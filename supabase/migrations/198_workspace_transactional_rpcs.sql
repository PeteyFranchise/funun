-- ============================================================
-- Funūn — Phase 38.0.2 (workspace-transactional-integrity-hygiene):
--         opened by plan 06, CLOSED BY PLAN 11.
-- Migration 198: the transactional SECURITY DEFINER RPC family for every
--                consequential workspace state change (R-06).
--
-- ─── WHAT THIS FILE CONTAINS ─────────────────────────────────────────────
-- One RPC per consequential workspace state change. Each one locks in the
-- global order (LO-1 below), revalidates every precondition AFTER the lock,
-- mutates one row per statement, and writes its audit row IN THE SAME
-- TRANSACTION. That last clause is the whole point: after this file a
-- consequential mutation can no longer commit without its audit record.
--
-- Sections, and the plan that authors each:
--   (a) THE TEMPLATE — the canonical shape, as a reference comment block.
--                                                           plan 06 (here)
--   (b) public.workspace_create                             plan 06 (here)
--   (c) public.workspace_change_member_role_or_status       plan 08
--   (d) public.workspace_nominate_owner                     plan 08
--   (e) public.workspace_respond_ownership_nomination       plan 08
--   (f) public.workspace_redeem_invitation                  plan 10
--   (g) public.workspace_transition_roster_relationship     plan 10
--   (h) public.workspace_accept_custody_transfer            plan 11
--   (i) public.guard_custody_transfer_transition, and the
--       re-scoped custody audit assertion                   plan 11
--
-- ─── FILE COMPLETE — CLOSED BY PLAN 11 ───────────────────────────────────
-- **THIS FILE IS COMPLETE.** Sections (a) through (i) all exist. Plans 08,
-- 10 and 11 APPENDed to this file, in that order, and plan 11 closed it and
-- carried the owner review checkpoint. Every appended section is stamped
-- from section (a) and obeys LO-1 through LO-4, R-26 and R-21 below.
--
-- The plan-06 staged-authorship notice this paragraph replaces declared the
-- file unfinished and told a reader not to review it as a finished
-- artifact. That is no longer true, and the sentence is DELETED rather than
-- left to mislead: reviewing this file as a finished artifact is exactly
-- what plan 11's checkpoint asks for.
--
-- COMPLETE AND UNAPPLIED ARE DIFFERENT THINGS. Nothing here has been
-- pushed. The next two sections say so, and say when it is.
--
-- ─── HUMAN-GATED ─────────────────────────────────────────────────────────
-- HUMAN-GATED — this project never runs `supabase db push`, `supabase db
-- reset`, `supabase migration up`, or `supabase db query` from an agent.
-- That is the standing convention stated verbatim in the headers of
-- migrations 078, 080, 136, 177 and 181-197. This file is authored and
-- text-tested (__tests__/migration-198.test.ts) but must not be applied
-- automatically. No plan in this phase opens a database connection of any
-- kind. The owner performs the push.
--
-- ─── PUSHED WITH 197 — NEVER STAGED ALONE ────────────────────────────────
-- This migration is pushed TOGETHER with migration 197, and with the
-- TypeScript changes from plans 12-16, in ONE transaction window at plan
-- 17's checkpoint. It is never staged ahead of that window. Staging 198
-- alone would install RPCs against tables, columns and triggers that
-- migration 197 has not created yet — sections (d), (e) and (h) reference
-- 197's ownership-transfer table and its owner-role guard, and section (b)
-- depends on 197's `guard_workspace_owner_role_change` admitting an owner
-- INSERT. A partial stage is a broken schema, not a smaller change.
--
-- ─── MIGRATION NUMBERING ─────────────────────────────────────────────────
-- 198 is claimed from the LIVE LEDGER in `.planning/ROADMAP.md`, which is
-- authoritative and explicitly supersedes every migration-file header.
-- Migration-file headers are NOT a source of migration numbers: this
-- project has had SIX stale-migration-number incidents, and the headers of
-- 190, 191, 192 and 193 all still carry a range that is now off by two.
-- Per the LIVE LEDGER as of 2026-09-07:
--   197-198  Phase 38.0.2 (197 = plan 05, 198 = this file)
--   199-200  Phase 38.2 (billing, beta flag) — RESERVED, do not claim
--   201-202  the Playbook rich-content model, Release 1 (a separate,
--            parallel workstream, in progress) — RESERVED, do not claim
-- Read the ledger, not this header, before claiming the next number.
--
-- ─── WHY THIS EXISTS ─────────────────────────────────────────────────────
-- PostgREST wraps every request — including `POST /rpc/<function>` — in ONE
-- SQL transaction at READ COMMITTED. Any database failure or RAISE inside
-- the function rolls the whole transaction back; otherwise it COMMITs.
-- Migration 127 states the same fact about this repo in its own words:
-- "The RPC itself is one database transaction."
--
-- The four races this phase closes exist because each route issues 2-5
-- separate supabase-js calls, which are 2-5 separate transactions. Folding
-- them into one RPC is not an optimisation; it is the entire fix.
--
--   F9  custody accept       app/api/vault/custody-transfers/route.ts PATCH
--       Read transfer -> CAS-update to `accepted` -> call
--       transfer_vault_project_custody(). A crash or a concurrent transfer
--       between the last two leaves the diary saying `accepted` while
--       custody never moved. Split-brain. Closed by section (h).
--   F11 invitation redemption
--       app/api/workspaces/invitations/accept/route.ts:118-166
--       Four transactions. The CAS on status=`pending` is issued but its
--       row count is never checked, so two concurrent redemptions can both
--       take the seat-INSERT branch. Closed by section (f).
--   F15 owner floor
--       app/api/workspaces/[workspaceId]/members/route.ts:71-95, 190-198
--       refuseIfOwnerFloorBreaks counts owners in one transaction and the
--       UPDATE happens in another. Closed by section (c).
--   F16 roster transitions   app/api/roster/relationships/route.ts:129-286
--       Read row -> assertCanTransition -> UPDATE with NO CAS on the state
--       it read, plus a separate-transaction side-effect upsert into
--       workspace_roster_blocks. Closed by section (g).
--   F14 best-effort audit    lib/workspaces/audit.ts:28-49
--       logWorkspaceAction returns {ok:false} and every one of its ~14 call
--       sites ignores the return value. A mutation can succeed with no
--       audit row and nothing notices. Closed by every section here writing
--       its audit row in the same transaction, and made non-bypassable by
--       plan 07's deferred constraint triggers.
--
-- ─── RULE LO-1 — THE GLOBAL LOCK ORDER ───────────────────────────────────
-- **THIS IS A RULE, NOT A PREFERENCE.** Any transaction in this file that
-- locks more than one row MUST acquire those locks in strictly ascending
-- rank order, MUST NEVER re-acquire a lower rank after acquiring a higher
-- one, and within a single table MUST lock multiple rows in ascending `id`
-- order (ORDER BY id).
--
--   | Rank | Table                                   | Note                |
--   |------|-----------------------------------------|---------------------|
--   |  1   | public.workspaces                       | the container       |
--   |  2   | public.workspace_members                | the seat            |
--   |  3   | public.workspace_roster_relationships   | the consent root    |
--   |  4   | public.workspace_invitations            | pending seat        |
--   |  5   | public.workspace_attachments            | link to a project   |
--   |  6   | public.workspace_grants                 | permission on it    |
--   |  7   | public.workspace_custody_transfers /    | two-sided offers    |
--   |      | public.workspace_ownership_transfers    |                     |
--   |  8   | public.vault_projects                   | the shared resource |
--   |  9   | public.workspace_audit_log              | INSERT only — never |
--   |      |                                         | locked, always last |
--
-- Auxiliary tables not in that list inherit the rank of their parent + 0.5
-- and are touched AFTER it:
--   public.workspace_roster_blocks         3.5  (parent: relationships)
--   public.workspace_agreement_evidence    3.5  (parent: relationships)
--   public.workspace_permission_requests   3.5  (parent: relationships)
--   public.workspace_permission_bundles    6.5  (parent: grants)
--
-- WHY THIS ORDER. It follows the foreign-key direction, parent before
-- child, which is the order PostgreSQL already takes FOR KEY SHARE locks in
-- implicitly when a child row is inserted — so this order agrees with the
-- database rather than inverting against it, and lock-order inversion is
-- what produces deadlocks. vault_projects is last because it is the most
-- contended row in the model and the join point of the two flows most
-- likely to collide: custody acceptance (7 -> 8) and roster/attachment work
-- (1-6 -> 8) both terminate at the same vault_projects row, so ranking it
-- last means both flows arrive at it in the same direction and hold it for
-- the shortest possible interval. workspace_audit_log takes no row lock at
-- all — an INSERT acquires only ROW EXCLUSIVE on the table, which does not
-- conflict with other inserts — so its position cannot influence deadlock,
-- and putting it last is also what makes "the mutation and its audit row
-- are one transaction" trivially true. And PostgreSQL's own guidance is to
-- acquire locks on multiple objects in a consistent order and to take the
-- most restrictive mode you will need on the first touch of an object.
--
-- The rule is machine-checked: __tests__/migration-198.test.ts walks every
-- function body in this file, extracts each locked table in source order,
-- maps it to its LO-1 rank, and asserts the sequence never decreases. That
-- assertion is the only thing that keeps LO-1 true after a future edit,
-- because this repo has no live-Postgres harness. The rank table above and
-- the LO1_RANKS constant in that suite are twins and must change together.
--
-- ─── RULE LO-2 — `FOR NO KEY UPDATE`, NOT `FOR UPDATE` ───────────────────
-- Every locking clause in this file is FOR NO KEY UPDATE. FOR UPDATE is
-- permitted ONLY with a comment at the point of use naming a DELETE or a
-- key-column change as the justification — and nothing in this phase does
-- either.
--
-- THE REASON, not just the rule: all seven lockable tables in LO-1 are
-- foreign-key PARENTS. When a concurrent transaction inserts any child row,
-- PostgreSQL takes FOR KEY SHARE on the parent to guarantee the key still
-- exists at commit. FOR UPDATE conflicts with FOR KEY SHARE; FOR NO KEY
-- UPDATE does not. So locking a `workspaces` row FOR UPDATE would block
-- EVERY concurrent membership, invitation, grant, attachment AND audit-log
-- insert in that workspace for the whole transaction — a self-inflicted
-- throughput cliff and a far larger deadlock surface, which is the exact
-- thing LO-1 exists to prevent. FOR NO KEY UPDATE blocks only other writers
-- of the same row.
--
-- Nothing in this phase needs the stronger mode. Nothing is deleted
-- anywhere (D-14, D-17 and D-25 all forbid it, and every existing route
-- already does a status update instead), and no mutation here changes a key
-- column: roster transitions move state/accepted_at/refused_at/ended_at,
-- membership moves role/status, invitation redemption moves status and the
-- seat, custody moves workspace_custody_transfers.state (and
-- vault_projects.user_id via the sanctioned function — children reference
-- vault_projects.id, not user_id), ownership moves role twice, grants move
-- revoked_at, attachments move detached_at.
--
-- THE ONE HONEST UNKNOWN, stated rather than glossed: an UPDATE that
-- modifies a column covered by a unique index USABLE IN A FOREIGN KEY is
-- implicitly upgraded to FOR UPDATE. workspace_members carries
-- idx_workspace_members_unique_user (workspace_id, user_id) WHERE user_id
-- IS NOT NULL — a PARTIAL unique index, which cannot back a foreign key —
-- and invitation redemption sets user_id. No upgrade is therefore expected,
-- but this was NOT verified against a live database because no plan in this
-- phase opens one. The failure mode is benign in either direction: if
-- PostgreSQL takes the stronger lock anyway the statement is more
-- serialised than intended, never less. It is never a correctness problem.
--
-- ─── RULE LO-3 — NO LOCK UPGRADES ────────────────────────────────────────
-- One locking clause per row per transaction. Never lock a row FOR NO KEY
-- UPDATE and later re-lock it more strongly in the same transaction: that
-- is a lock upgrade and an independent deadlock source. If a row will ever
-- need the stronger mode, take the stronger mode on the first touch — and
-- per LO-2, justify it in a comment at that point.
--
-- ─── RULE LO-4 — BOUNDED WAIT ────────────────────────────────────────────
-- `SET LOCAL lock_timeout = '3s'` at the top of every RPC in this file. A
-- blocked row lock in a Node request path is a hung HTTP request, and
-- PostgREST's own timeout is not a substitute. A bounded wait converts that
-- hang into SQLSTATE 55P03, which the route maps to 409 with a retry-safe
-- message. Deadlocks that do occur surface as SQLSTATE 40P01 and map the
-- same way. Neither is ever a 500.
--
-- Do NOT use NOWAIT — it turns ordinary contention into user-visible
-- errors. Do NOT use SKIP LOCKED — that is correct for a work queue
-- (migration 123) and WRONG for an authorization decision, where skipping a
-- row means silently reading stale state and deciding on it.
--
-- ─── RULE R-26 — RAISE VERSUS OUTCOME CODE ───────────────────────────────
-- A BUSINESS OUTCOME returns an outcome code: stale CAS, already resolved,
-- not found, the owner floor would break, AND an authority refusal the
-- phase wants on the record. An AUTHORIZATION OR INVARIANT VIOLATION that a
-- correct caller could never produce RAISEs with an explicit ERRCODE.
--
-- The reason is mechanical and is the single easiest thing in this file to
-- get wrong: **A RAISE ROLLS THE TRANSACTION BACK, INCLUDING ANY AUDIT ROW
-- ALREADY WRITTEN IN IT.** R-26 requires authority refusals to be audited
-- — "an admin attempted self-promotion" belongs on the record — so those
-- specific paths MUST NOT RAISE. They return an outcome code after writing
-- their audit row. Validation errors (a bad enum literal, a null id, an
-- unparseable value) do not belong on the audit trail and may keep raising.
--
-- Sections (c) through (h) inherit this distinction. Applying it backwards
-- silently deletes the very audit rows this phase exists to guarantee.
--
-- ─── RULE R-21 — ACTOR BINDING: OPTION A, AND ITS LIMITATION ─────────────
-- Every RPC in this file is granted to `service_role` ONLY — migration
-- 123's posture, REVOKE from PUBLIC, anon and authenticated first. The
-- route supplies `p_actor_id` from the identity `requireWorkspaceAccess`
-- has ALREADY PROVED. The RPC then re-derives that actor's AUTHORITY —
-- role, active status, expires_at — from the database AFTER the lock, and
-- **NEVER accepts a role parameter.**
--
-- THE LIMITATION, WRITTEN DOWN AND NOT GLOSSED: R-05 says authorization is
-- "enforced in the database/RPC, never route logic". Under Option A the
-- AUTHORITY is in the database but the IDENTITY still comes from the route.
-- That is a PARTIAL satisfaction of R-05, accepted deliberately by the
-- owner. Option B (grant to `authenticated`, bind p_actor_id to auth.uid())
-- would satisfy R-05 literally but would require the staff-identity refusal
-- in SQL — getStaffRoles reads app_metadata, which has no equivalent here —
-- and would widen the client-reachable write surface that migration 182
-- section (e) deliberately closed. The trade was made with open eyes; do
-- not describe this file as fully satisfying R-05.
--
-- ─── THE TRIGGER INVENTORY ───────────────────────────────────────────────
-- **SECURITY DEFINER DOES NOT BYPASS TRIGGERS.** It changes the effective
-- user for permission checks, and therefore what current_user reports. That
-- is all. A BEFORE UPDATE FOR EACH ROW trigger fires on an UPDATE issued
-- inside a SECURITY DEFINER function exactly as it does anywhere else. This
-- is not speculation: migration 139 asserted the opposite in a parenthetical,
-- custody transfer never worked in production as a result, and migration 196
-- is the fix. Every RPC in this file must have an explicit answer to "which
-- triggers fire, on which statement, in which order, and what do they see?"
--
--   | Table                          | Trigger                            | Timing              |
--   |--------------------------------|------------------------------------|---------------------|
--   | workspaces                     | workspaces_updated_at              | BEFORE UPDATE ROW   |
--   | workspace_members              | workspace_members_updated_at       | BEFORE UPDATE ROW   |
--   | workspace_members              | guard_workspace_never_zero_owners  | BEFORE DEL/UPD ROW  |
--   | workspace_members              | (197 adds the owner-role guard)    | BEFORE INS/UPD ROW  |
--   | workspace_roster_relationships | ..._updated_at                     | BEFORE UPDATE ROW   |
--   | workspace_invitations          | (none)                             | —                   |
--   | workspace_attachments          | (none)                             | —                   |
--   | workspace_grants               | (none)                             | —                   |
--   | workspace_custody_transfers    | guard_custody_transfer_offered_..  | BEFORE INSERT ROW   |
--   | workspace_custody_transfers    | guard_custody_transfer_transition  | BEFORE UPDATE ROW   |
--   |                                | — section (i) adds it; this table  |                     |
--   |                                | had NO UPDATE guard at all before  |                     |
--   | workspace_permission_requests  | ..._member_matches                 | BEFORE INS/UPD ROW  |
--   | workspace_permission_requests  | ..._transition_guard               | BEFORE UPDATE ROW   |
--   | vault_projects                 | vault_projects_updated_at          | BEFORE UPDATE ROW   |
--   | vault_projects                 | guard_owner_immutable              | BEFORE UPDATE ROW   |
--   | vault_projects                 | trg_guard_vault_projects_user_id.. | BEFORE UPDATE ROW   |
--   | workspace_audit_log            | (plan 07 adds append-only + the    | —                   |
--   |                                |  deferred audit assertions)        |                     |
--
-- Two trigger-derived rules every section here must follow:
--
--   THE OWNER-FLOOR WRITE ORDER. guard_workspace_never_zero_owners runs
--   inside your transaction and SEES YOUR OWN UNCOMMITTED WRITES FROM
--   PREVIOUS STATEMENTS. So an ownership transfer must PROMOTE THE
--   SUCCESSOR IN STATEMENT 1 AND DEMOTE THE INCUMBENT IN STATEMENT 2. In
--   that order the trigger firing on the demotion counts the freshly
--   promoted successor and passes; in the reverse order it counts zero and
--   raises 42501. Note also that the guard does NOT fire on a promotion at
--   all (its UPDATE branch requires OLD.role = 'owner'), which is precisely
--   why it provides zero protection against unauthorized promotion and why
--   migration 197 adds a separate guard for that.
--
--   ONE ROW PER STATEMENT AGAINST workspace_members. A BEFORE ROW trigger's
--   own SELECT runs on the current command's snapshot, which under READ
--   COMMITTED does NOT include rows changed by that same command. A single
--   statement touching two owner rows therefore fires the trigger twice,
--   each invocation blind to the other's pending change. Never issue a
--   multi-row UPDATE against workspace_members from these RPCs.
--
-- Also: update_updated_at() fires on every UPDATE, so never set updated_at
-- by hand in these RPCs — it will be overwritten. And nothing in this file
-- may DISABLE TRIGGER or set session_replication_role; if a future append
-- does, that is a review-blocking finding.
--
-- ─── THE ROLE-SCOPED EXEMPTION ───────────────────────────────────────────
-- Migrations 190 and 196 both exempt `current_user IN ('postgres')` from
-- the vault_projects.user_id immutability guards. current_user is
-- `postgres` for the duration of ANY postgres-owned SECURITY DEFINER
-- function — not only transfer_vault_project_custody(). Both headers
-- describe the exemption as function-scoped; the code enforces role-scoped.
-- **Every RPC in this file therefore silently joins that exemption set.**
--
-- THIS FILE'S ANSWER: no function here issues an UPDATE against
-- public.vault_projects naming user_id. The custody RPC in section (h)
-- CALLS public.transfer_vault_project_custody() instead — a nested
-- SECURITY DEFINER call runs in the same transaction, so atomicity is
-- preserved, and the sanctioned function's double filter and its
-- stale-custodian NULL-return semantics come along for free. One sanctioned
-- write path stays literally true, at zero cost.
--
-- That assertion is text-locked by __tests__/migration-198.test.ts, so a
-- future append cannot regress it. Migrations 190 and 196 are deliberately
-- NOT edited: both are applied, reviewed and text-locked by their own
-- suites, and churning them to correct a forward-looking sentence is higher
-- risk than removing the need for it. The discrepancy is recorded in
-- .planning/phases/38.0.2-.../38.0.2-ORCHESTRATOR-NOTES.md, not fixed here.
--
-- ─── WHY NO BACKFILL EXISTS ──────────────────────────────────────────────
-- All five workspace tables held ZERO rows on production as of 2026-09-07
-- (38.0.1 Part A check A9). This phase starts with no data migration
-- anywhere, so nothing in this file backfills, rewrites or repairs an
-- existing row. See the orchestrator notes for the one caveat: A9 counted
-- five tables and did not count workspace_audit_log or
-- workspace_invitations.
--
-- ─── WHAT THIS FILE DOES NOT TOUCH (D-52) ────────────────────────────────
-- Nothing in the signup trigger, nothing in the legacy membership-type
-- column, nothing in the professional-role array, nothing in the
-- capability-grant table, and nothing in the pre-existing project-members
-- table is referenced, altered or read by any statement in this file. It is
-- additive: it creates functions and their grants, and nothing else.
-- ============================================================


-- ─── (a) THE TEMPLATE — copy this shape ───────────────────────────────────
-- Every RPC appended to this file by plans 08, 10 and 11 is stamped from
-- the skeleton below. The numbered steps are the contract:
--
--   (0) BOUND THE WAIT              — SET LOCAL lock_timeout (LO-4)
--   (1) CONSULT THE KILL SWITCH     — first, before any other work, and
--                                     fail closed (D-56)
--   (2) LOCK IN ASCENDING LO-1 RANK — FOR NO KEY UPDATE (LO-1, LO-2)
--   (3) REVALIDATE AFTER THE LOCK   — every precondition, and re-derive the
--                                     actor authority from the database;
--                                     never accept a role parameter (R-21)
--   (4) MUTATE                      — one row per statement
--   (5) AUDIT IN THE SAME TRANSACTION — no restricted PII in `changes`
--                                       (WSR-19), then return the outcome
--
-- EVERY DEVIATION FROM THIS SHAPE MUST BE JUSTIFIED IN A COMMENT AT THE
-- POINT OF DEVIATION. Not in a commit message, not in a plan file: here.
--
-- ```sql
-- CREATE OR REPLACE FUNCTION public.workspace_<verb>_<noun>(
--   p_actor_id       UUID,        -- asserted by the route AFTER
--                                 -- requireWorkspaceAccess (R-21 Option A)
--   p_<target>_id    UUID,
--   p_expected_state TEXT DEFAULT NULL   -- caller-side CAS token
-- )
-- RETURNS TABLE (
--   outcome   TEXT,  -- 'ok' | 'not_found' | 'stale' | 'forbidden' | 'floor'
--   target_id UUID,
--   audit_id  UUID
-- )
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = ''
-- AS $$
-- DECLARE
--   v_row        public.workspace_<table>%ROWTYPE;
--   v_actor_role TEXT;
--   v_audit_id   UUID;
-- BEGIN
--   -- (0) Bound the wait. A row lock in a Node request path must never hang.
--   SET LOCAL lock_timeout = '3s';
--
--   -- (1) GLOBAL GATE FIRST, fail closed. Migration 192/194 precedent.
--   IF NOT public.workspace_access_enabled() THEN
--     RAISE EXCEPTION 'workspace access is disabled'
--       USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   -- (2) LOCK, IN ASCENDING LO-1 RANK ONLY. Never descending, never
--   --     conditionally reordered, multiple rows ORDER BY id.
--   SELECT * INTO v_row
--     FROM public.workspace_<table>
--    WHERE id = p_<target>_id
--      FOR NO KEY UPDATE;   -- LO-2: NO KEY, not FOR UPDATE
--
--   IF NOT FOUND THEN
--     RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::UUID;
--     RETURN;
--   END IF;
--
--   -- (3) REVALIDATE EVERY PRECONDITION *AFTER* THE LOCK. This is the point
--   --     of the exercise: a precondition checked before the lock proves
--   --     nothing. Re-derive the actor AUTHORITY here (R-21).
--   SELECT m.role INTO v_actor_role
--     FROM public.workspace_members m
--    WHERE m.workspace_id = v_row.workspace_id
--      AND m.user_id      = p_actor_id
--      AND m.status       = 'active'
--      AND (m.expires_at IS NULL OR m.expires_at > now());
--
--   IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner') THEN
--     -- R-26: an AUTHORITY refusal is audited, so it returns a code and
--     -- must not RAISE. Write the audit row first, then return.
--     RETURN QUERY SELECT 'forbidden'::TEXT, v_row.id, NULL::UUID;
--     RETURN;
--   END IF;
--
--   IF p_expected_state IS NOT NULL
--      AND v_row.state IS DISTINCT FROM p_expected_state THEN
--     RETURN QUERY SELECT 'stale'::TEXT, v_row.id, NULL::UUID;
--     RETURN;
--   END IF;
--
--   -- (4) MUTATE. One row per statement against workspace_members.
--   UPDATE public.workspace_<table>
--      SET state = '<new>'
--    WHERE id = v_row.id;
--
--   -- (5) AUDIT, IN THE SAME TRANSACTION. Never a second round trip, and no
--   --     restricted PII in `changes` (WSR-19).
--   INSERT INTO public.workspace_audit_log (
--     workspace_id, actor_user_id, subject_member_id,
--     action, permission_relied_on, target_type, target_id, changes
--   ) VALUES (
--     v_row.workspace_id, p_actor_id, v_row.member_user_id,
--     'workspace.<noun>.<verb>', NULL, 'workspace_<table>', v_row.id,
--     jsonb_build_object('state',
--       jsonb_build_object('before', v_row.state, 'after', '<new>'))
--   )
--   RETURNING id INTO v_audit_id;
--
--   RETURN QUERY SELECT 'ok'::TEXT, v_row.id, v_audit_id;
-- END;
-- $$;
--
-- REVOKE EXECUTE ON FUNCTION public.workspace_<verb>_<noun>(UUID, UUID, TEXT)
--   FROM PUBLIC, anon, authenticated;
-- GRANT  EXECUTE ON FUNCTION public.workspace_<verb>_<noun>(UUID, UUID, TEXT)
--   TO service_role;
-- ```
--
-- The grants above are migration 123's posture and explicitly NOT migration
-- 046's. Migration 046 is the behavioural template for the outcome-code
-- discriminator and NOTHING ELSE: it has no REVOKE at all, so PUBLIC —
-- including anon — holds EXECUTE on a SECURITY DEFINER function, and it
-- uses SET search_path = public with unqualified table names. Copy one half
-- from 123 and one half from 046; never copy 046's security posture. That
-- gap is pre-existing, out of scope here, and recorded as backlog in the
-- phase orchestrator notes rather than fixed inside this migration.


-- ─── (b) public.workspace_create (WSR-23 / R-15) ──────────────────────────
-- Replaces the two-insert-plus-compensating-delete sequence in
-- app/api/workspaces/route.ts. Today that route inserts the workspace,
-- inserts the owner seat, and on seat failure issues a compensating
-- .delete() on the workspace it just created — three transactions and a
-- hand-rolled rollback that only runs if the process survives long enough
-- to run it. Here all three writes are one transaction, so:
--
--   * the compensating DELETE in the route becomes UNREACHABLE (plan 12
--     removes it), because a failed seat insert rolls the workspace insert
--     back automatically; and
--   * migration 182's `created_by = auth.uid()` visibility fallback in
--     workspaces_select_member becomes UNNECESSARY (plan 09 removes it),
--     because a workspace can no longer exist without its owner seat, so
--     membership alone is always sufficient to see your own new workspace.
--
-- LO-1 note: this function LOCKS NOTHING. It is INSERTs only, so there is
-- no pre-existing row to lock and lockedTablesInOrder() correctly finds an
-- empty sequence for it. The WRITE order still follows LO-1 exactly:
-- rank 1 (workspaces) -> rank 2 (workspace_members) -> rank 9
-- (workspace_audit_log, last, INSERT only).
--
-- R-21 note: creation is the one RPC in this file with no prior authority
-- in the workspace to re-derive — the actor becomes its first owner. The
-- eligibility question that replaces it is the D-55 cohort gate (WSR-16),
-- which lands separately and is applied by the route and by section (f)'s
-- acceptor check. This function still never accepts a role parameter: the
-- owner role is a literal here, not an input.
CREATE OR REPLACE FUNCTION public.workspace_create(
  p_actor_id          UUID,
  p_name              TEXT,
  p_slug              TEXT,
  p_workspace_type    TEXT,
  p_roster_enabled    BOOLEAN,
  p_catalogue_enabled BOOLEAN,
  p_subject_member_id UUID
)
RETURNS TABLE (
  outcome      TEXT,
  workspace_id UUID,
  slug         TEXT,
  audit_id     UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Every value the body reads or writes lives in a v_ local. The OUT
  -- parameter names above (workspace_id, slug) are therefore never
  -- referenced as expressions inside the body, and the only places those
  -- identifiers appear are INSERT target column lists, which PostgreSQL
  -- parses as column names and never as PL/pgSQL variables.
  v_slug         TEXT;
  v_workspace_id UUID;
  v_audit_id     UUID;
  v_subject_id   UUID;
  v_attempt      INT := 0;
BEGIN
  -- (0) LO-4: bound the wait.
  SET LOCAL lock_timeout = '3s';

  -- (1) D-56/WS-31 kill switch FIRST, before any other work, fail closed.
  --     This branch returns an outcome code rather than raising ONLY
  --     because there is nothing to audit yet: no workspace exists, no
  --     audit row has been written, so a RAISE would roll back nothing and
  --     a return loses nothing. A later RPC in this file that has already
  --     written state when it discovers the switch is off may legitimately
  --     RAISE instead. Do not read this as a general rule (see R-26).
  IF NOT public.workspace_access_enabled() THEN
    RETURN QUERY SELECT 'disabled'::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Validation errors. R-26: these are NOT audited and therefore RAISE is
  -- the correct mechanism — a correct caller cannot produce them, and "a
  -- literal failed to validate" does not belong on an audit trail.
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'p_actor_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'p_name is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_slug IS NULL OR btrim(p_slug) = '' THEN
    RAISE EXCEPTION 'p_slug is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- The three literals migration 182's workspace_type CHECK names. Kept as
  -- an explicit list rather than deferring to the CHECK so the refusal is a
  -- named parameter error instead of a constraint violation.
  IF p_workspace_type IS NULL
     OR p_workspace_type NOT IN ('artist_team', 'management', 'label') THEN
    RAISE EXCEPTION 'p_workspace_type must be artist_team, management or label'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- D-07: subject_member_id means something only for an artist_team
  -- workspace, and naming a subject grants that person nothing until they
  -- affirmatively accept (D-05). Preserves the route rule exactly.
  IF p_workspace_type = 'artist_team' THEN
    v_subject_id := p_subject_member_id;
  ELSE
    v_subject_id := NULL;
  END IF;

  -- (2)/(4) LO-1 rank 1: the container. INSERT, so no row to lock.
  --
  -- The slug arrives FINISHED from TypeScript. It is deliberately not
  -- normalised, lower-cased or punctuation-stripped here: two
  -- implementations of the same string transform in two languages drift,
  -- and the TypeScript one is already shipped and tested. This function
  -- only handles the one thing TypeScript cannot: losing the race for the
  -- workspaces.slug UNIQUE constraint against a concurrent creation.
  --
  -- The bounded retry appends a fresh 8-character suffix and tries again.
  -- The cap is FIVE attempts: with a random 8-hex-character suffix, five
  -- consecutive collisions is not a contention outcome, it is a signal that
  -- something else is wrong (a duplicate-key error being misreported, a
  -- broken random source), and looping forever inside a request path would
  -- turn that into a hung HTTP request instead of a visible failure.
  v_slug := p_slug;
  LOOP
    v_attempt := v_attempt + 1;
    BEGIN
      INSERT INTO public.workspaces (
        name,
        slug,
        workspace_type,
        roster_enabled,
        catalogue_enabled,
        subject_member_id,
        created_by
      ) VALUES (
        btrim(p_name),
        v_slug,
        p_workspace_type,
        COALESCE(p_roster_enabled, FALSE),
        COALESCE(p_catalogue_enabled, FALSE),
        v_subject_id,
        p_actor_id
      )
      RETURNING id INTO v_workspace_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN
        RAISE EXCEPTION
          'could not allocate a unique workspace slug after 5 attempts'
          USING ERRCODE = 'unique_violation';
      END IF;
      v_slug := left(btrim(p_slug), 60) || '-'
                || substr(gen_random_uuid()::text, 1, 8);
    END;
  END LOOP;

  -- (4) LO-1 rank 2: the owner seat, in the SAME transaction as the
  -- container. This is what makes the route compensating DELETE unreachable.
  --
  -- Migration 197's guard_workspace_owner_role_change admits this INSERT
  -- because this function is postgres-owned, so its INSERT branch sees the
  -- sanctioned execution context rather than a client write. THAT is why
  -- WSR-23's atomic create is a PREREQUISITE for WSR-07 rather than an
  -- independent hygiene item: once 197 forbids seating an owner from
  -- anywhere else, this is the only path that can seat the first one.
  --
  -- One row, one statement (the workspace_members rule above).
  INSERT INTO public.workspace_members (
    workspace_id,
    user_id,
    role,
    status,
    invited_by
  ) VALUES (
    v_workspace_id,
    p_actor_id,
    'owner',
    'active',
    p_actor_id
  );

  -- (5) LO-1 rank 9: audit, last, in the same transaction, INSERT only.
  -- `changes` carries the workspace shape and nothing else. No email, no
  -- display name, no identifier belonging to a person (WSR-19). The actor
  -- is already a first-class column, and subject_member_id is NULL because
  -- creating a workspace is an action about the workspace itself, not about
  -- a roster Member (migration 182 section (d)).
  INSERT INTO public.workspace_audit_log (
    workspace_id,
    actor_user_id,
    subject_member_id,
    action,
    permission_relied_on,
    target_type,
    target_id,
    changes
  ) VALUES (
    v_workspace_id,
    p_actor_id,
    NULL,
    'workspace.created',
    NULL,
    'workspace',
    v_workspace_id,
    jsonb_build_object(
      'workspace_type', p_workspace_type,
      'roster_enabled', COALESCE(p_roster_enabled, FALSE),
      'catalogue_enabled', COALESCE(p_catalogue_enabled, FALSE),
      'slug', v_slug
    )
  )
  RETURNING id INTO v_audit_id;

  RETURN QUERY SELECT 'ok'::TEXT, v_workspace_id, v_slug, v_audit_id;
END;
$$;

-- Migration 123's grant posture, NOT migration 046's.
REVOKE EXECUTE ON FUNCTION public.workspace_create(
  UUID, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_create(
  UUID, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, UUID
) TO service_role;

COMMENT ON FUNCTION public.workspace_create(
  UUID, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, UUID
) IS
  'Creates a workspace, seats its creator as sole active owner, and writes the workspace.created audit row -- all three in ONE transaction (R-06/WSR-23). Locks nothing: it is INSERTs only, and there is no pre-existing row to lock. Its WRITE order still follows the global lock order LO-1 exactly, rank 1 public.workspaces, then rank 2 public.workspace_members, then rank 9 public.workspace_audit_log last. Revalidates, after entry and before any write: the D-56 platform kill switch via public.workspace_access_enabled() (fail closed, returned as the outcome code disabled because no audit row exists yet to be rolled back), a non-null actor, a non-empty name, a non-empty slug, and workspace_type against the three literals migration 182 CHECKs. Never accepts a role parameter -- the owner role is a literal, per R-21. The slug arrives finished from TypeScript and is not re-derived here; the only slug work this function does is a bounded five-attempt retry appending a fresh random suffix when it loses the workspaces.slug UNIQUE race. Triggers that fire on its writes: none on the workspaces INSERT, and on the workspace_members INSERT migration 197 guard_workspace_owner_role_change, which admits it because this function is postgres-owned -- that admission is why the atomic create is a prerequisite for WSR-07 and not an independent item. guard_workspace_never_zero_owners does not fire on an INSERT. Its audit row is written in the same transaction as both inserts, so the compensating DELETE in app/api/workspaces/route.ts becomes unreachable and migration 182 created_by visibility fallback in workspaces_select_member becomes unnecessary; plan 09 removes the fallback and plan 12 removes the compensating delete. Granted to service_role only (R-21 Option A): the route supplies the actor identity it has already proved.';


-- ─── (c) public.workspace_change_member_role_or_status ────────────────────
--         (WSR-11 / WSR-07 / F15)
--
-- Replaces the mutation sequence in BOTH handlers of
-- app/api/workspaces/[workspaceId]/members/route.ts — the PATCH
-- update/changes pair and the DELETE status-to-removed path. Plan 12 does
-- the route side.
--
-- WHAT F15 ACTUALLY IS. refuseIfOwnerFloorBreaks counts owners with one
-- supabase-js call and the UPDATE happens in another, so they are two
-- transactions. Two concurrent demotions of two DIFFERENT owners each count
-- one remaining owner, each conclude the floor holds, and both proceed. The
-- outcome is correct today only because guard_workspace_never_zero_owners
-- catches the second one at write time — and the route then recognises that
-- refusal by STRING-MATCHING the English sentence 'at least one active
-- owner' (isOwnerFloorTriggerError), which couples three files to one
-- sentence. Counting the floor HERE, after the row lock and inside the same
-- transaction as the write, makes the trigger the backstop it was meant to
-- be rather than the primary control, and gives the route the 'floor'
-- outcome code to map instead of a sentence to sniff. Plan 12 deletes the
-- sniffer.
--
-- THE ACTOR-RELATIVE HALF (F5 / WSR-07). Migration 197's
-- guard_workspace_owner_role_change enforces the STRUCTURAL half: a row may
-- not become owner, and an owner row may not change, outside the definer
-- path. It cannot enforce the actor-relative half — only owners may
-- promote, nobody may self-promote, admins may not touch owner rows —
-- because a trigger cannot see the human actor (auth.uid() is NULL under
-- service_role). Those rules live HERE, checked against p_actor_id after
-- the lock, with the actor's AUTHORITY re-derived from the database and no
-- role parameter ever accepted (R-21). Both layers are required; neither
-- replaces the other.
CREATE OR REPLACE FUNCTION public.workspace_change_member_role_or_status(
  p_actor_id        UUID,   -- asserted by the route AFTER
                            -- requireWorkspaceAccess (R-21 Option A)
  p_workspace_id    UUID,
  p_member_id       UUID,
  p_new_role        TEXT,   -- NULL means "leave the role unchanged"
  p_new_status      TEXT,   -- NULL means "leave the status unchanged"
  p_expected_role   TEXT,   -- caller-side CAS token; NULL means "do not compare"
  p_expected_status TEXT    -- caller-side CAS token; NULL means "do not compare"
)
RETURNS TABLE (
  outcome         TEXT,
  member_id       UUID,
  subject_user_id UUID,
  audit_id        UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Every value the body reads or writes lives in a v_ local, so the OUT
  -- parameter names above are never referenced as expressions inside the
  -- body (plan 06's rule, kept).
  v_member            public.workspace_members%ROWTYPE;
  v_actor_role        TEXT;
  v_role_after        TEXT;
  v_status_after      TEXT;
  v_leaves_live_owner BOOLEAN;
  v_other_owners      INT;
  v_action            TEXT;
  v_changes           JSONB;
  v_audit_id          UUID;
BEGIN
  -- (0) LO-4: bound the wait.
  SET LOCAL lock_timeout = '3s';

  -- (1) D-56/WS-31 kill switch FIRST, before any other work, fail closed.
  --
  -- DEVIATION FROM SECTION (a) AND FROM workspace_create, JUSTIFIED HERE.
  -- workspace_create returns the outcome code 'disabled' for this branch;
  -- this function RAISEs instead. Both are correct, for the same reason
  -- stated from opposite ends: R-26 makes the choice turn on whether there
  -- is anything to audit. There is nothing to audit about a globally
  -- disabled feature — no authority was exercised, no refusal belongs on
  -- this workspace's record — and no audit row has been written yet, so the
  -- RAISE rolls back nothing. The caller must see a hard failure rather
  -- than a code it might map to a member-scoped 409, because the switch
  -- being off is a platform fact, not a fact about this member.
  IF NOT public.workspace_access_enabled() THEN
    RAISE EXCEPTION 'workspace access is disabled'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Validation error, NOT audited, so RAISE is the correct mechanism
  -- (R-26). A correct caller cannot produce it: the route already refuses
  -- an empty change set with its own 400. Refusing it here as well keeps a
  -- no-op UPDATE — which would still fire every row trigger and would still
  -- write an audit row with an empty `changes` object — off the trail.
  IF p_new_role IS NULL AND p_new_status IS NULL THEN
    RAISE EXCEPTION 'at least one of p_new_role or p_new_status is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (2) LOCK, IN ASCENDING LO-1 RANK ONLY.
  --
  -- Rank 1, the container, FIRST. Nothing on the workspaces row is read or
  -- written here; the lock is taken purely to give every concurrent
  -- membership change on the SAME workspace one stable serialisation point.
  -- That is what turns F15's two independent transactions into two queued
  -- ones, so the second demotion's floor count sees the first demotion.
  --
  -- FOR NO KEY UPDATE, never FOR UPDATE (LO-2). public.workspaces is a
  -- foreign-key parent of members, invitations, grants, attachments and the
  -- audit log; FOR UPDATE conflicts with the FOR KEY SHARE that every one
  -- of those concurrent child INSERTs takes on this row, so it would block
  -- all of them for the whole transaction. Nothing here modifies a column
  -- that any foreign key references, so the weaker mode is both sufficient
  -- and correct.
  --
  -- The phrasing above is deliberate: LO-2's suite assertion treats the
  -- literal phrase "key column" in the ten comment lines preceding a
  -- locking clause as a JUSTIFICATION for a stronger mode. Prose that
  -- explains why the stronger mode is NOT needed must therefore avoid that
  -- token, or it would silently pre-authorise a future FOR UPDATE at this
  -- exact site. Do not "restore" the shorter wording.
  PERFORM 1
     FROM public.workspaces w
    WHERE w.id = p_workspace_id
      FOR NO KEY UPDATE;

  -- Rank 2, the seat itself. Filtered on BOTH id and workspace_id so a
  -- member id belonging to another workspace cannot be reached by naming
  -- this workspace.
  SELECT * INTO v_member
    FROM public.workspace_members m
   WHERE m.id           = p_member_id
     AND m.workspace_id = p_workspace_id
     FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- (3) REVALIDATE EVERY PRECONDITION *AFTER* THE LOCK.
  --
  -- R-21: re-derive the actor's AUTHORITY from the database. The route
  -- supplies only the identity it already proved. There is deliberately no
  -- p_actor_role parameter and there never will be — a caller that could
  -- assert its own role would make every check below decorative.
  SELECT m.role INTO v_actor_role
    FROM public.workspace_members m
   WHERE m.workspace_id = p_workspace_id
     AND m.user_id      = p_actor_id
     AND m.status       = 'active'
     AND (m.expires_at IS NULL OR m.expires_at > now());

  v_role_after   := COALESCE(p_new_role, v_member.role);
  v_status_after := COALESCE(p_new_status, v_member.status);

  -- THE MECHANISM BEHIND EVERY AUDITED REFUSAL BELOW, STATED ONCE HERE.
  -- Each of these branches INSERTs its audit row and then RETURNs. NONE of
  -- them RAISEs, and that is not a stylistic choice: **a RAISE rolls the
  -- transaction back, including the audit row written moments earlier in
  -- it.** R-26 requires authority refusals to be on the record — "an admin
  -- attempted self-promotion" is precisely the sentence this phase exists
  -- to be able to show someone later — so an audited refusal MUST be an
  -- outcome code. Getting this backwards silently deletes the very rows the
  -- phase was built to guarantee. Validation errors above may keep raising,
  -- because they are not audited and a correct caller cannot produce them.
  IF v_actor_role IS NULL THEN
    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      p_workspace_id, p_actor_id, v_member.user_id,
      'workspace.member.change_refused', NULL, 'workspace_member', v_member.id,
      jsonb_build_object('refusal', 'forbidden')
    )
    RETURNING id INTO v_audit_id;

    RETURN QUERY SELECT 'forbidden'::TEXT, v_member.id, v_member.user_id, v_audit_id;
    RETURN;
  END IF;

  -- Ordinary member management stays an admin's job (canManageWorkspaceMembers
  -- in lib/workspaces/membership.ts deliberately keeps admins). The owner-only
  -- narrowing is the NEXT branch, not this one — the two predicates are meant
  -- to disagree on `admin`, and that disagreement is the whole of WSR-07.
  IF v_actor_role NOT IN ('owner', 'admin') THEN
    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      p_workspace_id, p_actor_id, v_member.user_id,
      'workspace.member.change_refused', NULL, 'workspace_member', v_member.id,
      jsonb_build_object('refusal', 'forbidden')
    )
    RETURNING id INTO v_audit_id;

    RETURN QUERY SELECT 'forbidden'::TEXT, v_member.id, v_member.user_id, v_audit_id;
    RETURN;
  END IF;

  -- R-05, second clause: admins may not edit or remove owner rows. This is
  -- canManageOwners in lib/workspaces/membership.ts, expressed where the row
  -- lock is held. Migration 197's guard_workspace_owner_role_change refuses
  -- the same statement structurally, but only OUTSIDE the definer path — and
  -- this function IS the definer path, so inside here the structural guard
  -- returns at its exemption and this branch is the only thing standing
  -- between an admin and an owner's seat.
  IF v_member.role = 'owner' AND v_actor_role <> 'owner' THEN
    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      p_workspace_id, p_actor_id, v_member.user_id,
      'workspace.member.change_refused', NULL, 'workspace_member', v_member.id,
      jsonb_build_object('refusal', 'forbidden_owner_row')
    )
    RETURNING id INTO v_audit_id;

    RETURN QUERY SELECT 'forbidden_owner_row'::TEXT, v_member.id, v_member.user_id, v_audit_id;
    RETURN;
  END IF;

  -- R-05, first clause / R-22: promotion to owner moves ONLY through the
  -- two-sided transfer in sections (d) and (e). This function never performs
  -- one, for anybody, including an owner.
  --
  -- Migration 197's guard_workspace_owner_role_change would refuse the
  -- statement anyway — but it would refuse it by RAISING, which rolls this
  -- transaction back and takes the audit row with it. Returning an outcome
  -- here is what puts "somebody tried to promote a member straight to owner"
  -- on the record instead of erasing it.
  IF p_new_role = 'owner' THEN
    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      p_workspace_id, p_actor_id, v_member.user_id,
      'workspace.member.change_refused', NULL, 'workspace_member', v_member.id,
      jsonb_build_object('refusal', 'promotion_requires_transfer')
    )
    RETURNING id INTO v_audit_id;

    RETURN QUERY SELECT 'promotion_requires_transfer'::TEXT, v_member.id, v_member.user_id, v_audit_id;
    RETURN;
  END IF;

  -- R-05, third clause: nobody may change their OWN role. No self-promotion
  -- — and, by symmetry, no self-demotion out of an owner seat either, which
  -- would be a foot-gun on the floor: the last owner demoting themselves is
  -- how a workspace loses its only administrator by accident. Status is
  -- deliberately NOT covered: an owner suspending or removing their own seat
  -- still meets the floor check below, which is the correct control for it.
  IF p_actor_id = v_member.user_id
     AND p_new_role IS NOT NULL
     AND p_new_role IS DISTINCT FROM v_member.role THEN
    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      p_workspace_id, p_actor_id, v_member.user_id,
      'workspace.member.change_refused', NULL, 'workspace_member', v_member.id,
      jsonb_build_object('refusal', 'no_self_role_change')
    )
    RETURNING id INTO v_audit_id;

    RETURN QUERY SELECT 'no_self_role_change'::TEXT, v_member.id, v_member.user_id, v_audit_id;
    RETURN;
  END IF;

  -- Compare-and-set, against the LOCKED row. NOT an authority refusal and
  -- therefore NOT audited (R-26): losing a race is a business outcome about
  -- the caller's stale copy, not a fact about anyone's authority, and an
  -- audit trail full of stale-CAS rows would bury the refusals that matter.
  IF (p_expected_role IS NOT NULL AND v_member.role IS DISTINCT FROM p_expected_role)
     OR (p_expected_status IS NOT NULL AND v_member.status IS DISTINCT FROM p_expected_status) THEN
    RETURN QUERY SELECT 'stale'::TEXT, v_member.id, v_member.user_id, NULL::UUID;
    RETURN;
  END IF;

  -- Transition legality, from migration 182's own status CHECK set:
  --   pending   -> active
  --   active    -> suspended, removed, expired
  --   suspended -> active, removed
  --   expired   -> active
  --   removed   is terminal — no outbound edge, ever (D-14: removal ends
  --             future access only; nothing is ever deleted or revived).
  -- A same-state assignment is a no-op, not an illegal edge, which is why
  -- the check is skipped when the status does not actually move — the same
  -- reading the PATCH handler already applies.
  --
  -- isLegalMembershipTransition in lib/workspaces/membership.ts is the
  -- INDEPENDENT second layer and produces the friendly sentence for the
  -- user. It is kept deliberately, not deduplicated into this one: two
  -- layers agreeing is this repo's doctrine (078, 136, 187, 190, 192, 196),
  -- and WSR-17 exists because two layers once disagreed about expires_at.
  IF v_status_after IS DISTINCT FROM v_member.status THEN
    IF NOT (
         (v_member.status = 'pending'   AND v_status_after = 'active')
      OR (v_member.status = 'active'    AND v_status_after IN ('suspended', 'removed', 'expired'))
      OR (v_member.status = 'suspended' AND v_status_after IN ('active', 'removed'))
      OR (v_member.status = 'expired'   AND v_status_after = 'active')
    ) THEN
      RETURN QUERY SELECT 'illegal_transition'::TEXT, v_member.id, v_member.user_id, NULL::UUID;
      RETURN;
    END IF;
  END IF;

  -- THE OWNER FLOOR, COUNTED HERE AND ONLY HERE (F15).
  --
  -- The predicate mirrors migration 197's guard_workspace_never_zero_owners
  -- UPDATE branch deliberately, so the RPC and the trigger say the same
  -- thing about the same rule rather than two nearly-identical things. Its
  -- third disjunct — an UPDATE pushing NEW.expires_at into the past — has no
  -- analogue here because this function never writes expires_at; and a seat
  -- whose expires_at is ALREADY past is not a live owner at all, which the
  -- third conjunct below excludes before the question arises.
  v_leaves_live_owner :=
        v_member.role   = 'owner'
    AND v_member.status = 'active'
    AND (v_member.expires_at IS NULL OR v_member.expires_at > now())
    AND (v_role_after <> 'owner' OR v_status_after <> 'active');

  IF v_leaves_live_owner THEN
    -- This count is INSIDE the lock and INSIDE the write transaction, which
    -- is precisely what F15's cross-transaction count was not. Two concurrent
    -- demotions of two different owners now queue on the rank-1 workspaces
    -- row, so the second one counts a roster the first has already changed.
    -- guard_workspace_never_zero_owners remains the last line of defence
    -- rather than the primary control — it still fires on the UPDATE below
    -- and would still refuse a floor break that reached it by some other
    -- path.
    --
    -- expires_at is honoured on both sides, matching R-28's amended trigger:
    -- an owner with no live access cannot satisfy a floor they cannot reach.
    SELECT count(*) INTO v_other_owners
      FROM public.workspace_members m
     WHERE m.workspace_id = p_workspace_id
       AND m.role         = 'owner'
       AND m.status       = 'active'
       AND (m.expires_at IS NULL OR m.expires_at > now())
       AND m.id <> v_member.id;

    IF v_other_owners = 0 THEN
      INSERT INTO public.workspace_audit_log (
        workspace_id, actor_user_id, subject_member_id,
        action, permission_relied_on, target_type, target_id, changes
      ) VALUES (
        p_workspace_id, p_actor_id, v_member.user_id,
        'workspace.member.change_refused', NULL, 'workspace_member', v_member.id,
        jsonb_build_object('refusal', 'floor')
      )
      RETURNING id INTO v_audit_id;

      RETURN QUERY SELECT 'floor'::TEXT, v_member.id, v_member.user_id, v_audit_id;
      RETURN;
    END IF;
  END IF;

  -- (4) MUTATE. ONE ROW, ONE STATEMENT.
  --
  -- A BEFORE ROW trigger's own SELECT runs on the current command's
  -- snapshot, which under READ COMMITTED does NOT include rows changed by
  -- that same command. A single statement touching two member rows would
  -- therefore fire guard_workspace_never_zero_owners twice, each invocation
  -- blind to the other's pending change. Keyed on the primary key, so this
  -- can only ever match one row.
  --
  -- COALESCE is how "NULL means leave unchanged" is expressed: a NULL
  -- parameter resolves to the column's existing value and the column is
  -- rewritten with what it already held. updated_at is deliberately absent —
  -- update_updated_at() fires on this statement and would overwrite anything
  -- set by hand.
  UPDATE public.workspace_members
     SET role   = COALESCE(p_new_role, role),
         status = COALESCE(p_new_status, status)
   WHERE id = v_member.id;

  -- (5) AUDIT, IN THE SAME TRANSACTION.
  --
  -- `changes` carries before/after for role and status and NOTHING else — no
  -- email, no display name, no identifier belonging to a person (WSR-19).
  -- The actor and the subject are already first-class columns.
  v_changes := '{}'::JSONB;

  IF v_role_after IS DISTINCT FROM v_member.role THEN
    v_changes := v_changes || jsonb_build_object(
      'role', jsonb_build_object('before', v_member.role, 'after', v_role_after));
  END IF;

  IF v_status_after IS DISTINCT FROM v_member.status THEN
    v_changes := v_changes || jsonb_build_object(
      'status', jsonb_build_object('before', v_member.status, 'after', v_status_after));
  END IF;

  -- One action per row, and a change that moves both columns is recorded as
  -- the role change: it is the consequential half, and `changes` carries the
  -- status move alongside it either way.
  IF v_role_after IS DISTINCT FROM v_member.role THEN
    v_action := 'workspace.member.role_changed';
  ELSE
    v_action := 'workspace.member.status_changed';
  END IF;

  -- target_id is the MEMBER ROW's own id, not the workspace's and not the
  -- subject's user id. Migration 197's deferred constraint trigger for
  -- workspace_members matches on target_id = NEW.id, so any other value
  -- fails the whole transaction at COMMIT.
  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, subject_member_id,
    action, permission_relied_on, target_type, target_id, changes
  ) VALUES (
    p_workspace_id, p_actor_id, v_member.user_id,
    v_action, NULL, 'workspace_member', v_member.id, v_changes
  )
  RETURNING id INTO v_audit_id;

  RETURN QUERY SELECT 'ok'::TEXT, v_member.id, v_member.user_id, v_audit_id;
END;
$$;

-- Migration 123's grant posture, NOT migration 046's.
REVOKE EXECUTE ON FUNCTION public.workspace_change_member_role_or_status(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_change_member_role_or_status(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.workspace_change_member_role_or_status(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT
) IS
  'Changes one workspace member''s role and/or status, and writes its audit row, in ONE transaction (R-06/WSR-11). LOCK RANKS, IN ORDER: rank 1 public.workspaces (FOR NO KEY UPDATE, taken purely as a stable serialisation point for concurrent membership changes on the same workspace), then rank 2 the target public.workspace_members row (FOR NO KEY UPDATE, filtered on both id and workspace_id). Rank 9 public.workspace_audit_log is INSERT only and never locked. FOR NO KEY UPDATE and not FOR UPDATE per LO-2: both tables are foreign-key parents, nothing here changes a key column, and FOR UPDATE would block every concurrent member, invitation, grant, attachment and audit insert on the workspace. REVALIDATED AFTER THE LOCK, in this order: the D-56 kill switch via public.workspace_access_enabled() (fail closed, RAISEd rather than returned because nothing is audited about a globally disabled feature); the target row still exists; the actor''s AUTHORITY re-derived from public.workspace_members as role plus status = active plus a live expires_at, NEVER accepted as a parameter (R-21 Option A -- there is no p_actor_role and there never will be); the actor holds owner or admin; an admin may not touch an owner row (R-05); p_new_role = owner is refused outright because promotion moves only through the two-sided transfer in sections (d) and (e) (R-05/R-22); no actor may change their own role (R-05); the caller-side compare-and-set tokens p_expected_role and p_expected_status still match the locked row; the status move is a legal edge of migration 182''s state set; and the owner floor, counted HERE -- after the lock, inside the write transaction, honouring expires_at on both sides -- which is exactly what F15''s cross-transaction count was not. TRIGGERS THAT FIRE ON ITS UPDATE: guard_workspace_member_owner_role_change (migration 197, returns at the postgres exemption because this function is postgres-owned, which is why the actor-relative rules above are not optional), guard_workspace_never_zero_owners (retained as the LAST line of defence, no longer the primary control), and workspace_members_updated_at (which is why updated_at is never set by hand here). The UPDATE is keyed on the primary key so it can only ever match one row -- a multi-row UPDATE would fire the floor guard twice, each invocation blind to the other''s pending change. Its audit row is written in the same transaction as the UPDATE, and every AUTHORITY refusal writes its own audit row and then RETURNS an outcome code rather than raising, because a RAISE would roll that row back (R-26). OUTCOME VOCABULARY the route must map: ok, not_found, forbidden, forbidden_owner_row, promotion_requires_transfer, no_self_role_change, stale, illegal_transition, floor. The floor code replaces isOwnerFloorTriggerError''s string match on the English sentence in app/api/workspaces/[workspaceId]/members/route.ts; plan 12 deletes that sniffer. Granted to service_role only.';


-- ─── (d) public.workspace_nominate_owner (WSR-08 / R-22) ──────────────────
--
-- Side one of the two-sided act. Migration 197 created the diary table
-- (public.workspace_ownership_transfers); this writes to it.
--
-- These checks are NOT copies of assertMayNominate in
-- lib/workspaces/ownership-transfer.ts, and they are not copies of
-- migration 197's guard_ownership_nomination_by_active_owner either. They
-- are the SAME RULE expressed in the one place where the row lock is held,
-- which is the only place it can be true at the moment it is written down.
-- All three layers are kept deliberately (078, 136, 187, 190, 192, 196).
--
-- WHERE THIS FUNCTION DELIBERATELY FAILS EARLIER THAN THE GUARDS. Migration
-- 197's BEFORE INSERT trigger and its partial unique index
-- idx_workspace_ownership_transfers_one_live_offer would both refuse a bad
-- nomination on their own — by RAISEing, and in the index's case with a
-- bare 23505 the user cannot act on. Every precondition below is therefore
-- checked explicitly first, so the caller gets a named outcome and the
-- structural layers stay what they are meant to be: backstops.
CREATE OR REPLACE FUNCTION public.workspace_nominate_owner(
  p_actor_id          UUID,   -- asserted by the route AFTER
                              -- requireWorkspaceAccess (R-21 Option A)
  p_workspace_id      UUID,
  p_successor_user_id UUID
)
RETURNS TABLE (
  outcome     TEXT,
  transfer_id UUID,
  audit_id    UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role      TEXT;
  v_successor_role  TEXT;
  v_open_nomination UUID;
  v_transfer_id     UUID;
  v_audit_id        UUID;
BEGIN
  -- (0) LO-4: bound the wait.
  SET LOCAL lock_timeout = '3s';

  -- (1) D-56/WS-31 kill switch FIRST, fail closed. RAISE rather than an
  --     outcome code, for the reason section (c) states in full: there is
  --     nothing to audit about a globally disabled feature, and no audit
  --     row has been written yet for a RAISE to roll back.
  IF NOT public.workspace_access_enabled() THEN
    RAISE EXCEPTION 'workspace access is disabled'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (2) LOCK, IN ASCENDING LO-1 RANK ONLY.
  --
  -- Rank 1, the container. Same purpose as in section (c): a stable
  -- serialisation point, so two owners cannot each open a nomination on
  -- this workspace at the same instant and discover the collision only when
  -- the partial unique index fires.
  PERFORM 1
     FROM public.workspaces w
    WHERE w.id = p_workspace_id
      FOR NO KEY UPDATE;

  -- Rank 2, and THE WITHIN-TABLE RULE APPLIES HERE. Both the actor's seat
  -- and the successor's seat are rank 2, so LO-1's second clause governs:
  -- multiple rows of ONE table are locked in ascending `id` order. The
  -- ORDER BY is what makes that true — it is not cosmetic and it is not a
  -- sort for the reader's benefit. Two nominations running in opposite
  -- pairings (A nominating B while B nominates A) would otherwise take the
  -- same two rows in opposite orders, which is a textbook deadlock.
  --
  -- ONE STATEMENT LOCKING TWO ROWS IS CORRECT HERE, and does not violate
  -- the one-row-per-statement rule. That rule is about UPDATEs: a BEFORE
  -- ROW trigger's own SELECT cannot see rows changed by its own command. A
  -- locking SELECT fires no triggers at all, so the hazard does not arise —
  -- and splitting the lock into two statements would forfeit exactly the
  -- deterministic ordering this ORDER BY exists to provide.
  PERFORM 1
     FROM public.workspace_members m
    WHERE m.workspace_id = p_workspace_id
      AND m.user_id IN (p_actor_id, p_successor_user_id)
    ORDER BY m.id
      FOR NO KEY UPDATE;

  -- (3) REVALIDATE EVERY PRECONDITION *AFTER* THE LOCKS.
  --
  -- R-21: the actor's authority is re-derived here, never accepted. Both
  -- rows are already locked, so these reads take no further lock (LO-3
  -- forbids re-locking a row this transaction already holds).
  SELECT m.role INTO v_actor_role
    FROM public.workspace_members m
   WHERE m.workspace_id = p_workspace_id
     AND m.user_id      = p_actor_id
     AND m.status       = 'active'
     AND (m.expires_at IS NULL OR m.expires_at > now());

  -- R-05: only an owner may start an ownership transfer. An admin may not,
  -- which is the whole of WSR-07 at this layer. AUDITED, and therefore an
  -- outcome code rather than a RAISE — a RAISE would roll the audit row
  -- back (R-26).
  IF v_actor_role IS DISTINCT FROM 'owner' THEN
    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      p_workspace_id, p_actor_id, p_successor_user_id,
      'workspace.ownership.nomination_refused', NULL, 'workspace', p_workspace_id,
      jsonb_build_object('refusal', 'forbidden')
    )
    RETURNING id INTO v_audit_id;

    RETURN QUERY SELECT 'forbidden'::TEXT, NULL::UUID, v_audit_id;
    RETURN;
  END IF;

  -- The degenerate one-actor form of the F1 attack: nominating yourself is
  -- self-promotion wearing a two-sided act's clothes. AUDITED — an attempt
  -- to take sole ownership of a workspace unilaterally is exactly the kind
  -- of thing someone should be able to see on the record later.
  IF p_actor_id = p_successor_user_id THEN
    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      p_workspace_id, p_actor_id, p_successor_user_id,
      'workspace.ownership.nomination_refused', NULL, 'workspace', p_workspace_id,
      jsonb_build_object('refusal', 'no_self_nomination')
    )
    RETURNING id INTO v_audit_id;

    RETURN QUERY SELECT 'no_self_nomination'::TEXT, NULL::UUID, v_audit_id;
    RETURN;
  END IF;

  SELECT m.role INTO v_successor_role
    FROM public.workspace_members m
   WHERE m.workspace_id = p_workspace_id
     AND m.user_id      = p_successor_user_id
     AND m.status       = 'active'
     AND (m.expires_at IS NULL OR m.expires_at > now());

  -- The next three refusals are NOT authority refusals and are NOT audited
  -- (R-26). Nobody exceeded their authority in any of them: the actor is a
  -- verified owner and is entitled to ask. They are facts about the state
  -- of the workspace — the successor is not seated, is already the owner,
  -- or a nomination is already open — and auditing them would bury the two
  -- refusals above that do belong on the record.
  IF v_successor_role IS NULL THEN
    RETURN QUERY SELECT 'successor_not_a_member'::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  IF v_successor_role = 'owner' THEN
    RETURN QUERY SELECT 'already_owner'::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- Checked EXPLICITLY rather than left to
  -- idx_workspace_ownership_transfers_one_live_offer. The index is a real
  -- guarantee and stays the backstop, but a 23505 reaching a person is an
  -- error they cannot act on; 'nomination_open' is one they can.
  SELECT t.id INTO v_open_nomination
    FROM public.workspace_ownership_transfers t
   WHERE t.workspace_id = p_workspace_id
     AND t.state        = 'offered';

  IF v_open_nomination IS NOT NULL THEN
    RETURN QUERY SELECT 'nomination_open'::TEXT, v_open_nomination, NULL::UUID;
    RETURN;
  END IF;

  -- (4) MUTATE. LO-1 rank 7.
  --
  -- offered_by and from_user_id are BOTH the actor. Migration 197's
  -- guard_ownership_nomination_by_active_owner refuses the row unless they
  -- are equal — the two columns are separately spoofable, and that guard is
  -- what ties them together. Setting both from the same re-derived actor
  -- here means this function can never be the thing that separates them.
  INSERT INTO public.workspace_ownership_transfers (
    workspace_id, from_user_id, to_user_id, offered_by, state
  ) VALUES (
    p_workspace_id, p_actor_id, p_successor_user_id, p_actor_id, 'offered'
  )
  RETURNING id INTO v_transfer_id;

  -- (5) AUDIT, IN THE SAME TRANSACTION. LO-1 rank 9, last.
  --
  -- `changes` carries the state and nothing else. The two people involved
  -- are already first-class columns (actor_user_id, subject_member_id), so
  -- repeating their ids inside the JSON would add no information and would
  -- put identifiers belonging to a person into a payload WSR-19 governs.
  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, subject_member_id,
    action, permission_relied_on, target_type, target_id, changes
  ) VALUES (
    p_workspace_id, p_actor_id, p_successor_user_id,
    'workspace.ownership.nominated', NULL, 'workspace_ownership_transfer', v_transfer_id,
    jsonb_build_object('state', jsonb_build_object('before', NULL, 'after', 'offered'))
  )
  RETURNING id INTO v_audit_id;

  RETURN QUERY SELECT 'ok'::TEXT, v_transfer_id, v_audit_id;
END;
$$;

-- Migration 123's grant posture, NOT migration 046's.
REVOKE EXECUTE ON FUNCTION public.workspace_nominate_owner(
  UUID, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_nominate_owner(
  UUID, UUID, UUID
) TO service_role;

COMMENT ON FUNCTION public.workspace_nominate_owner(UUID, UUID, UUID) IS
  'Side one of the two-sided workspace ownership transfer (R-22/WSR-08): an active owner nominates a successor, and the nomination plus its audit row are written in ONE transaction. LOCK RANKS, IN ORDER: rank 1 public.workspaces, then rank 2 public.workspace_members for BOTH the actor''s seat and the successor''s seat in ONE statement with ORDER BY m.id -- LO-1''s within-table rule, because two nominations in opposite pairings would otherwise take the same two rows in opposite orders and deadlock. One statement locking two rows is correct: the one-row-per-statement rule governs UPDATEs, whose BEFORE ROW triggers cannot see their own command''s changes, and a locking SELECT fires no trigger. Rank 7 public.workspace_ownership_transfers is INSERTed, rank 9 public.workspace_audit_log last. All locks FOR NO KEY UPDATE (LO-2). REVALIDATED AFTER THE LOCKS: the D-56 kill switch (fail closed, RAISEd); the actor holds an ACTIVE, unexpired owner seat, re-derived from the database and never accepted as a parameter (R-21 Option A); the actor is not the successor; the successor holds an ACTIVE, unexpired seat on this workspace; the successor is not already owner; and no live offered nomination exists for this workspace -- checked explicitly so the caller sees the named outcome nomination_open rather than the partial unique index''s bare 23505. TRIGGERS THAT FIRE ON ITS INSERT: guard_ownership_nomination_by_active_owner (migration 197), which independently refuses unless offered_by = from_user_id and the nominator is a live owner and the successor is a live non-owner member; this function sets offered_by and from_user_id from the same re-derived actor so it can never be what separates them. OUTCOME VOCABULARY the route must map: ok, forbidden, no_self_nomination, successor_not_a_member, already_owner, nomination_open. The first two are AUTHORITY refusals and each writes its audit row before returning its code, never raising, because a RAISE would roll that row back (R-26); the last three are facts about workspace state, not excesses of authority, and are deliberately not audited. Granted to service_role only.';


-- ─── (e) public.workspace_respond_ownership_nomination ────────────────────
--         (WSR-08 / R-22)
--
-- Side two. The successor accepts or declines; the incumbent withdraws.
--
-- **THE WRITE ORDER IN THE ACCEPT PATH IS LOAD-BEARING AND IS COMMENTED
-- AGAIN AT THE STATEMENT ITSELF. Promote, then demote. Never the reverse.**
--
-- R-22, settled and not re-openable here: accepting TRANSFERS ownership.
-- The nominator ends as `admin`, not as a second owner. A workspace with
-- two founders who want "add an owner" needs a different RPC with a
-- different authority rule, and that is deliberately a later phase's
-- problem. Do not grow this function into it.
CREATE OR REPLACE FUNCTION public.workspace_respond_ownership_nomination(
  p_actor_id       UUID,   -- asserted by the route AFTER
                           -- requireWorkspaceAccess (R-21 Option A)
  p_transfer_id    UUID,
  p_action         TEXT,   -- 'accept' | 'decline' | 'withdraw'
  p_expected_state TEXT    -- caller-side CAS token; NULL means "do not compare"
)
RETURNS TABLE (
  outcome      TEXT,
  transfer_id  UUID,
  workspace_id UUID,
  audit_id     UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Every column reference in this body is alias-qualified, because two of
  -- the OUT parameter names above (transfer_id, workspace_id) collide with
  -- real column names on the tables this function touches. Qualification is
  -- what keeps PL/pgSQL from having to choose.
  v_workspace_id        UUID;
  v_from_user_id        UUID;
  v_to_user_id          UUID;
  v_offered_by          UUID;
  v_state               TEXT;
  v_nominator_role      TEXT;
  v_nominator_member_id UUID;
  v_successor_member_id UUID;
  v_successor_role      TEXT;
  v_new_state           TEXT;
  v_audit_id            UUID;
BEGIN
  -- (0) LO-4: bound the wait.
  SET LOCAL lock_timeout = '3s';

  -- (1) D-56/WS-31 kill switch FIRST, fail closed.
  IF NOT public.workspace_access_enabled() THEN
    RAISE EXCEPTION 'workspace access is disabled'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Validation error, NOT audited, so RAISE is correct (R-26). The three
  -- literals are the only actions this function performs; a fourth would be
  -- a caller defect, not a business outcome.
  IF p_action IS NULL OR p_action NOT IN ('accept', 'decline', 'withdraw') THEN
    RAISE EXCEPTION 'p_action must be accept, decline or withdraw'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (2) LOCK, IN ASCENDING LO-1 RANK ONLY.
  --
  -- READ BEFORE LOCK, AND WHY IT IS SAFE. The rank-1 row to lock is the
  -- transfer's workspace, and the rank-2 rows to lock are the seats of the
  -- transfer's two named parties — none of which is known until the
  -- transfer row has been read. Reading it UNLOCKED first is the only way
  -- to acquire the rest in ascending rank order; reading it locked first
  -- would take rank 7 before rank 1 and invert LO-1 outright.
  --
  -- This read therefore proves NOTHING and is treated as proving nothing:
  -- every value it returns is re-read from the locked row at step (3), and
  -- every precondition is decided there. All this read does is name the
  -- rows to lock. If the transfer is concurrently resolved between here and
  -- the lock, the re-read sees the resolved state and the CAS or the
  -- already_resolved branch refuses -- which is the correct answer.
  SELECT t.workspace_id, t.from_user_id, t.to_user_id
    INTO v_workspace_id, v_from_user_id, v_to_user_id
    FROM public.workspace_ownership_transfers t
   WHERE t.id = p_transfer_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- Rank 1, the container.
  PERFORM 1
     FROM public.workspaces w
    WHERE w.id = v_workspace_id
      FOR NO KEY UPDATE;

  -- Rank 2, both seats, ORDER BY id — LO-1's within-table rule again, and
  -- for the same reason as section (d): two responses touching the same
  -- pair of member rows in opposite orders deadlock. One statement, two
  -- rows, no trigger fired: see section (d)'s note on why that is correct.
  PERFORM 1
     FROM public.workspace_members m
    WHERE m.workspace_id = v_workspace_id
      AND m.user_id IN (v_from_user_id, v_to_user_id)
    ORDER BY m.id
      FOR NO KEY UPDATE;

  -- Rank 7, the transfer row itself, LAST of the locks.
  SELECT t.workspace_id, t.from_user_id, t.to_user_id, t.offered_by, t.state
    INTO v_workspace_id, v_from_user_id, v_to_user_id, v_offered_by, v_state
    FROM public.workspace_ownership_transfers t
   WHERE t.id = p_transfer_id
     FOR NO KEY UPDATE;

  -- (3) REVALIDATE EVERY PRECONDITION *AFTER* THE LOCKS.
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- Compare-and-set against the LOCKED row. Not an authority refusal, not
  -- audited (R-26).
  IF p_expected_state IS NOT NULL AND v_state IS DISTINCT FROM p_expected_state THEN
    RETURN QUERY SELECT 'stale'::TEXT, p_transfer_id, v_workspace_id, NULL::UUID;
    RETURN;
  END IF;

  -- All three non-offered states are terminal. Migration 197's
  -- guard_ownership_transfer_transition refuses the UPDATE independently;
  -- this branch exists so the caller gets a named outcome instead of a
  -- check_violation, and so a double-resolve is refused before any write.
  -- Also not an authority refusal: losing the race to resolve a nomination
  -- is not an excess of authority.
  IF v_state <> 'offered' THEN
    RETURN QUERY SELECT 'already_resolved'::TEXT, p_transfer_id, v_workspace_id, NULL::UUID;
    RETURN;
  END IF;

  -- THE F1 ATTACK SHAPE, RESTATED AT THE OWNERSHIP LAYER.
  -- In the custody flow one actor could once both offer a transfer and
  -- accept their own offer -- one person performing both sides of an act
  -- D-29 requires to be two-sided, with no grant needed to do it. Here the
  -- prize is the workspace itself, so the refusal is absolute: only the
  -- named successor may accept or decline, and **the nominator may never
  -- accept, whatever else is true**. The second test is deliberately not
  -- collapsed into the first even though migration 197's
  -- CHECK (offered_by <> to_user_id) already makes them equivalent -- if
  -- that CHECK or assertMayNominate is ever widened, self-dealing must
  -- still be impossible here.
  --
  -- Withdrawal is the incumbent's alone: a successor can decline a
  -- nomination made to them, never withdraw it.
  --
  -- AUDITED (R-26), so an outcome code and never a RAISE.
  IF (p_action IN ('accept', 'decline')
      AND (p_actor_id <> v_to_user_id
           OR p_actor_id = v_offered_by
           OR p_actor_id = v_from_user_id))
     OR (p_action = 'withdraw'
         AND p_actor_id <> v_offered_by
         AND p_actor_id <> v_from_user_id) THEN
    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      v_workspace_id, p_actor_id, v_to_user_id,
      'workspace.ownership.response_refused', NULL,
      'workspace_ownership_transfer', p_transfer_id,
      jsonb_build_object('refusal', 'forbidden', 'attempted', p_action)
    )
    RETURNING id INTO v_audit_id;

    RETURN QUERY SELECT 'forbidden'::TEXT, p_transfer_id, v_workspace_id, v_audit_id;
    RETURN;
  END IF;

  IF p_action = 'accept' THEN
    -- A nomination must not survive its author losing the authority to make
    -- it. An owner who was demoted, suspended, removed or whose seat expired
    -- between nominating and being accepted no longer has ownership to give.
    SELECT m.id, m.role INTO v_nominator_member_id, v_nominator_role
      FROM public.workspace_members m
     WHERE m.workspace_id = v_workspace_id
       AND m.user_id      = v_from_user_id
       AND m.status       = 'active'
       AND (m.expires_at IS NULL OR m.expires_at > now());

    IF v_nominator_role IS DISTINCT FROM 'owner' THEN
      INSERT INTO public.workspace_audit_log (
        workspace_id, actor_user_id, subject_member_id,
        action, permission_relied_on, target_type, target_id, changes
      ) VALUES (
        v_workspace_id, p_actor_id, v_to_user_id,
        'workspace.ownership.response_refused', NULL,
        'workspace_ownership_transfer', p_transfer_id,
        jsonb_build_object('refusal', 'nominator_no_longer_owner')
      )
      RETURNING id INTO v_audit_id;

      RETURN QUERY SELECT 'nominator_no_longer_owner'::TEXT, p_transfer_id, v_workspace_id, v_audit_id;
      RETURN;
    END IF;

    -- THE SYMMETRIC CHECK, AND IT IS NOT OPTIONAL.
    -- If the successor's seat was removed, suspended or expired between
    -- nomination and acceptance, the promotion below would match ZERO rows
    -- while the demotion below it would still match one. The transfer would
    -- then demote the only owner and leave the workspace with none —
    -- caught by guard_workspace_never_zero_owners as a 42501 the person
    -- cannot act on, which is the trigger doing its job at the cost of a
    -- transaction that should never have been attempted. Refuse it here,
    -- where the refusal has a name.
    -- The role is captured alongside the id because the audit row below
    -- records the successor's BEFORE value, and a successor may hold any
    -- non-owner role — admin, member, contractor or guest. Hardcoding a
    -- literal there would write a false value onto the audit trail, which
    -- is worse than writing none: an audit record nobody can trust is not
    -- an audit record.
    SELECT m.id, m.role INTO v_successor_member_id, v_successor_role
      FROM public.workspace_members m
     WHERE m.workspace_id = v_workspace_id
       AND m.user_id      = v_to_user_id
       AND m.status       = 'active'
       AND (m.expires_at IS NULL OR m.expires_at > now());

    IF v_successor_member_id IS NULL THEN
      INSERT INTO public.workspace_audit_log (
        workspace_id, actor_user_id, subject_member_id,
        action, permission_relied_on, target_type, target_id, changes
      ) VALUES (
        v_workspace_id, p_actor_id, v_to_user_id,
        'workspace.ownership.response_refused', NULL,
        'workspace_ownership_transfer', p_transfer_id,
        jsonb_build_object('refusal', 'successor_no_longer_a_member')
      )
      RETURNING id INTO v_audit_id;

      RETURN QUERY SELECT 'successor_no_longer_a_member'::TEXT, p_transfer_id, v_workspace_id, v_audit_id;
      RETURN;
    END IF;

    -- ══════════════════════════════════════════════════════════════════
    -- STATEMENT 1 OF 3 — PROMOTE THE SUCCESSOR.
    --
    -- **THIS STATEMENT MUST COME BEFORE THE DEMOTION BELOW. THIS IS NOT A
    -- STYLE PREFERENCE AND MUST NOT BE REORDERED.**
    --
    -- guard_workspace_never_zero_owners runs INSIDE this transaction and
    -- SEES THIS TRANSACTION'S UNCOMMITTED WRITES FROM EARLIER STATEMENTS.
    -- Promoting first means the floor count that runs when the demotion
    -- fires the guard counts the freshly-promoted successor and passes.
    -- In the reverse order it counts zero remaining owners and raises
    -- SQLSTATE 42501, and the entire transfer fails — in production, on a
    -- path a person is standing in front of.
    --
    -- Note also that the guard does NOT fire on this statement at all: its
    -- UPDATE branch requires OLD.role = 'owner', and the successor's
    -- OLD.role is not 'owner'. The promotion is instead admitted by
    -- migration 197's guard_workspace_owner_role_change, which returns at
    -- its postgres exemption because this function is postgres-owned. That
    -- exemption is precisely why the authority checks above are not
    -- optional decoration.
    --
    -- ONE ROW, ONE STATEMENT — keyed on the member row's primary key. Two
    -- member rows change here and they change in two separate statements,
    -- because a BEFORE ROW trigger's own SELECT runs on the current
    -- command's snapshot and cannot see rows changed by that same command.
    -- A single statement doing both would fire the floor guard twice, each
    -- invocation blind to the other's pending change.
    -- ══════════════════════════════════════════════════════════════════
    UPDATE public.workspace_members
       SET role = 'owner'
     WHERE id = v_successor_member_id;

    -- ══════════════════════════════════════════════════════════════════
    -- STATEMENT 2 OF 3 — DEMOTE THE INCUMBENT. R-22: OWNERSHIP TRANSFERS.
    --
    -- The nominator becomes `admin`. They do NOT remain a second owner.
    -- An add-a-second-owner RPC is deliberately a later phase's problem and
    -- is not built here; if that is ever wanted it needs its own authority
    -- rule, not a quiet edit to this line.
    --
    -- This is the statement guard_workspace_never_zero_owners actually
    -- fires on (OLD.role = 'owner', NEW.role <> 'owner'), and it is the
    -- statement whose success depends entirely on statement 1 having
    -- already run.
    -- ══════════════════════════════════════════════════════════════════
    UPDATE public.workspace_members
       SET role = 'admin'
     WHERE id = v_nominator_member_id;

    v_new_state := 'accepted';
  ELSIF p_action = 'decline' THEN
    v_new_state := 'declined';
  ELSE
    v_new_state := 'withdrawn';
  END IF;

  -- STATEMENT 3 OF 3 on the accept path, and the ONLY mutation on the
  -- decline and withdraw paths: resolve the diary row. responded_at is set
  -- explicitly because no trigger maintains it; updated_at is NOT, because
  -- workspace_ownership_transfers_updated_at fires here and would overwrite
  -- it. guard_ownership_transfer_transition also fires, and admits this
  -- because the row is still 'offered' and the four identity columns are
  -- untouched.
  UPDATE public.workspace_ownership_transfers t
     SET state        = v_new_state,
         responded_at = now()
   WHERE t.id = p_transfer_id;

  -- (5) AUDIT — ONE ROW PER MUTATED ROW, IN THE SAME TRANSACTION.
  --
  -- THIS IS THREE ROWS ON THE ACCEPT PATH, AND THAT IS NOT REDUNDANCY.
  -- Migration 197's deferred constraint triggers are scoped PER TABLE and
  -- each matches on target_id = NEW.id, so a mutated row without its own
  -- audit row naming it fails the WHOLE TRANSACTION at COMMIT with an
  -- integrity violation. An accept mutates three rows — the successor's
  -- seat, the nominator's seat, and the transfer — so it writes three audit
  -- rows: target_id = the successor's member id, target_id = the
  -- nominator's member id, and target_id = the transfer id. Getting this
  -- wrong is the constraint working correctly, but nobody should have to
  -- learn it from a COMMIT-time failure.
  IF p_action = 'accept' THEN
    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      v_workspace_id, p_actor_id, v_to_user_id,
      'workspace.member.role_changed', NULL, 'workspace_member', v_successor_member_id,
      jsonb_build_object('role', jsonb_build_object('before', v_successor_role, 'after', 'owner'))
    );

    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      v_workspace_id, p_actor_id, v_from_user_id,
      'workspace.member.role_changed', NULL, 'workspace_member', v_nominator_member_id,
      jsonb_build_object('role', jsonb_build_object('before', 'owner', 'after', 'admin'))
    );
  END IF;

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, subject_member_id,
    action, permission_relied_on, target_type, target_id, changes
  ) VALUES (
    v_workspace_id, p_actor_id, v_to_user_id,
    'workspace.ownership.' || v_new_state, NULL,
    'workspace_ownership_transfer', p_transfer_id,
    jsonb_build_object('state', jsonb_build_object('before', 'offered', 'after', v_new_state))
  )
  RETURNING id INTO v_audit_id;

  RETURN QUERY SELECT 'ok'::TEXT, p_transfer_id, v_workspace_id, v_audit_id;
END;
$$;

-- Migration 123's grant posture, NOT migration 046's.
REVOKE EXECUTE ON FUNCTION public.workspace_respond_ownership_nomination(
  UUID, UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_respond_ownership_nomination(
  UUID, UUID, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.workspace_respond_ownership_nomination(
  UUID, UUID, TEXT, TEXT
) IS
  'Side two of the two-sided workspace ownership transfer (R-22/WSR-08): the named successor accepts or declines, or the incumbent owner withdraws, and every row the response touches plus its audit row are written in ONE transaction. LOCK RANKS, IN ORDER: the transfer row is first read WITHOUT a lock, because the rank-1 workspace and the rank-2 seats it names cannot be locked in ascending order until they are known -- that read proves nothing and every value from it is re-read from the locked row; then rank 1 public.workspaces, then rank 2 public.workspace_members for the successor''s seat and the incumbent''s seat in ONE statement with ORDER BY m.id (LO-1''s within-table rule -- opposite pairings would otherwise deadlock), then rank 7 public.workspace_ownership_transfers last of the locks, all FOR NO KEY UPDATE (LO-2). REVALIDATED AFTER THE LOCKS: the transfer still exists; the caller-side compare-and-set token p_expected_state still matches; the state is still offered (all three other states are terminal); authority -- only to_user_id may accept or decline, only offered_by or from_user_id may withdraw, and THE NOMINATOR MAY NEVER ACCEPT WHATEVER ELSE IS TRUE, which is the F1 self-dealing attack shape restated where the prize is the workspace itself; on accept, that the nominator STILL holds a live owner seat, because a nomination must not survive its author losing the authority to make it; and on accept, that the SUCCESSOR still holds a live seat, without which the promotion would match zero rows while the demotion matched one and the transfer would leave the workspace with no owner at all. THE ACCEPT PATH MUTATES IN EXACTLY THIS ORDER, ONE ROW PER STATEMENT: promote the successor to owner, THEN demote the nominator to admin, THEN resolve the transfer. THE ORDER IS LOAD-BEARING AND MUST NOT BE REVERSED -- guard_workspace_never_zero_owners runs inside this transaction and sees its uncommitted writes from earlier statements, so promoting first makes the demotion''s floor count find the freshly-promoted successor and pass, while the reverse order counts zero and raises SQLSTATE 42501. One row per statement because a BEFORE ROW trigger''s own SELECT cannot see rows changed by its own command. R-22: ownership TRANSFERS -- the nominator ends as admin, never as a second owner, and no add-a-second-owner RPC exists here by design. TRIGGERS THAT FIRE: guard_workspace_owner_role_change and guard_workspace_never_zero_owners and workspace_members_updated_at on each member UPDATE, and guard_ownership_transfer_transition and workspace_ownership_transfers_updated_at on the transfer UPDATE (which is why updated_at is never set by hand, though responded_at is, since no trigger maintains it). AUDIT: one row per MUTATED row, so an accept writes THREE -- migration 197''s deferred constraint triggers are scoped per table and match on target_id = NEW.id, so a mutated row without its own audit row naming it fails the whole transaction at COMMIT. OUTCOME VOCABULARY the route must map: ok, not_found, stale, already_resolved, forbidden, nominator_no_longer_owner, successor_no_longer_a_member. The last three are AUTHORITY-class refusals and each writes its audit row before returning its code, never raising, because a RAISE would roll that row back (R-26). Granted to service_role only.';


-- ─── (f) public.workspace_redeem_invitation ───────────────────────────────
--         (WSR-10 / WSR-16 / F11 / R-24)
--
-- Replaces the whole mutation sequence in
-- app/api/workspaces/invitations/accept/route.ts. Plan 14 does the route
-- side.
--
-- WHAT F11 ACTUALLY IS. That route performs FOUR separate transactions:
-- lookup; a CAS-update of the invitation to `accepted` filtered on
-- status = 'pending'; a seat lookup; then a seat UPDATE **or** a seat
-- INSERT. The CAS is issued but ITS RESULT IS NEVER CHECKED -- the route
-- destructures only `{ error }`, which reports a database failure and not
-- "zero rows matched", so a redemption that lost the race is indistinguish-
-- able from one that won it. Worse, the seat lookup and the seat write are
-- also two transactions, so two concurrent redemptions can both miss the
-- seat and both take the INSERT branch. Correctness survives today only
-- because idx_workspace_members_unique_user refuses the second one with a
-- 23505, which the route reports as a generic 500.
--
-- Here the invitation row is LOCKED, every precondition is revalidated
-- under that lock, and the seat is written as ONE statement. The CAS
-- becomes structural: there is no unchecked-result path left to check.
--
-- R-24 -- THE COHORT GATE APPLIES TO THE ACCEPTOR. This is the third
-- kill-switch call site, and the one research flagged as reproducing the
-- exact shape of hotfix F7: a route carrying workspace state that consulted
-- the platform control directly instead of going through the gate. If the
-- D-55 cohort bound applied only to workspace creation, one cohort owner
-- could pull in unlimited non-cohort Members and the pilot bound would stop
-- meaning anything.
--
-- THE THREE THINGS THAT DELIBERATELY STAY IN THE ROUTE (RESEARCH §11's KEEP
-- LIST), each for a reason, not by omission:
--   * hashInvitationToken -- THE RAW TOKEN MUST NEVER REACH SQL. It would
--     otherwise appear in pg_stat_statements, in a log_min_duration_statement
--     line, and in any error context this function raises. The RPC receives
--     only the hash.
--   * normalizeInvitedEmail -- the route normalises the SESSION's own
--     verified address and passes the result. SQL does not read
--     auth.users.email at all.
--   * isInvitationRedeemable -- the independent second layer producing the
--     friendly sentence. Two layers agreeing is this repo's doctrine (078,
--     136, 187, 190, 192, 196); WSR-17 exists because two layers once
--     disagreed about expires_at.
--
-- WHY p_actor_email IS A PARAMETER AT ALL, STATED RATHER THAN GLOSSED.
-- This is R-21 Option A applied to one more field than usual. The route
-- asserts the identity from `auth.getUser()` -- never from a body value --
-- and this function re-checks the BINDING IT WAS TOLD against the address
-- the invitation actually names. So the authority half ("does this
-- invitation name this address") is decided in the database; the identity
-- half ("is this session that address") is still decided in the route. That
-- is the same partial satisfaction of R-05 the file header records for
-- p_actor_id, extended to the email, and it is written down here rather
-- than left for a reader to infer.
--
-- WHY p_require_cohort IS A PARAMETER. SQL cannot read environment
-- variables. lib/workspaces/cohort.ts derives it from
-- WORKSPACE_ACCESS_GENERAL_ENABLED and hands it in, exactly as
-- resolveWorkspaceAccessDecision already does for the other two call sites.
-- The DEFAULT IS CLOSED on the TypeScript side, so an absent variable means
-- "cohort required", never "everyone admitted".
CREATE OR REPLACE FUNCTION public.workspace_redeem_invitation(
  p_actor_id       UUID,      -- asserted by the route AFTER auth.getUser()
                              -- (R-21 Option A)
  p_token_hash     TEXT,      -- the sha256 hex digest, NEVER the raw token
  p_actor_email    TEXT,      -- already normalised by normalizeInvitedEmail
  p_require_cohort BOOLEAN    -- supplied from the environment by
                              -- lib/workspaces/cohort.ts (D-55 / R-07)
)
RETURNS TABLE (
  outcome             TEXT,
  workspace_id        UUID,
  member_id           UUID,
  member_role         TEXT,
  invitation_audit_id UUID,
  member_audit_id     UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Every value the body reads or writes lives in a v_ local, so the OUT
  -- parameter names above are never referenced as expressions inside the
  -- body (plan 06's rule, kept -- and load-bearing here, because
  -- `workspace_id` is also a real column on four of the tables below).
  v_workspace_id          UUID;
  v_invitation_id         UUID;
  v_invitation_email      TEXT;
  v_invitation_role       TEXT;
  v_invitation_status     TEXT;
  v_invitation_expires_at TIMESTAMPTZ;
  v_seat                  public.workspace_members%ROWTYPE;
  v_seat_found            BOOLEAN := FALSE;
  v_member_id             UUID;
  v_access_enabled        BOOLEAN;
  v_cohort_ok             BOOLEAN;
  v_invitation_audit_id   UUID;
  v_member_audit_id       UUID;
  -- Used by the AUDITED REFUSAL branches only. Named to match the
  -- shared harness assertion in __tests__/migration-198.test.ts, which
  -- checks that every refusal captures its audit row's id before
  -- returning: one local for that job keeps the check meaningful across
  -- every RPC in this file rather than per-function.
  v_audit_id              UUID;
BEGIN
  -- (0) LO-4: bound the wait.
  SET LOCAL lock_timeout = '3s';

  -- Validation errors, NOT audited, so RAISE is the correct mechanism
  -- (R-26). A correct caller cannot produce any of them: the route's Zod
  -- schema refuses an empty token and the session gate refuses an anonymous
  -- caller before this function is reached.
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'p_actor_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_token_hash IS NULL OR btrim(p_token_hash) = '' THEN
    RAISE EXCEPTION 'p_token_hash is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN
    RAISE EXCEPTION 'p_actor_email is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (1) THE GLOBAL GATE, FIRST, AND BOTH HALVES IN ONE ROUND TRIP.
  --
  -- public.workspace_access_permitted (migration 197, plan 09) folds the
  -- D-56 kill switch and the D-55 cohort window into one function
  -- specifically so a gated request does not grow from one round trip to
  -- two -- the same move migrations 192 and 194 already made. This RPC is
  -- the acceptor call site R-24 names.
  SELECT a.access_enabled, a.cohort_ok
    INTO v_access_enabled, v_cohort_ok
    FROM public.workspace_access_permitted(p_actor_id, p_require_cohort) a;

  -- COALESCE, not a bare NOT: a three-valued NULL would make `NOT v` return
  -- NULL, which an IF treats as false and would therefore ADMIT the caller.
  -- Plan 07 shipped the same COALESCE for the same reason on the audit
  -- reader's redaction flag. Fail closed on every path.
  IF NOT COALESCE(v_access_enabled, FALSE) THEN
    -- RAISE, not an outcome code, and the reason is R-26's test: there is
    -- nothing to audit about a globally disabled feature -- no authority
    -- was exercised, and no workspace's record is the right place for it --
    -- and no audit row has been written yet, so the RAISE rolls back
    -- nothing. Section (c) makes the identical call for the identical
    -- reason.
    RAISE EXCEPTION 'workspace access is disabled'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT COALESCE(v_cohort_ok, FALSE) THEN
    -- R-24 / R-25. The route maps this outcome to 404, NOT 403: during a
    -- bounded pilot a Member outside the cohort should not learn the
    -- feature exists, and 404 is how the rest of this repo hides an
    -- unreachable resource. That is why it is a DISTINCT outcome from the
    -- disabled RAISE above -- 503 and 404 are different answers to
    -- different questions and the route must be able to tell them apart.
    --
    -- NOT AUDITED, and the reason is structural rather than a judgement
    -- call: workspace_audit_log.workspace_id is NOT NULL, and no workspace
    -- is known at this point -- the invitation has not been read yet,
    -- deliberately, because reading it before the eligibility gate would
    -- leak the existence of an invitation to an ineligible caller. A
    -- platform-eligibility fact also does not belong on one workspace's
    -- record.
    RETURN QUERY SELECT 'not_in_cohort'::TEXT,
      NULL::UUID, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- (2) LOCK, IN ASCENDING LO-1 RANK ONLY: 1 -> 2 -> 4.
  --
  -- READ BEFORE LOCK, AND WHY IT IS SAFE. The rank-1 row to lock is the
  -- invitation's workspace, which is not known until the invitation has
  -- been read. Reading it UNLOCKED first is the only way to acquire the
  -- rest in ascending rank order; locking the invitation first would take
  -- rank 4 before rank 1 and invert LO-1 outright. This read therefore
  -- proves NOTHING and is treated as proving nothing: the invitation is
  -- re-read from the locked row at step (3) and every precondition is
  -- decided there. All it does is name the workspace.
  SELECT i.workspace_id INTO v_workspace_id
    FROM public.workspace_invitations i
   WHERE i.token_hash = p_token_hash;

  IF NOT FOUND THEN
    -- The route's message for this outcome must stay NON-ENUMERATING: it
    -- may not disclose whether the token ever existed, whether it belonged
    -- to this caller, or whether it has already been used. One generic
    -- sentence for every miss.
    RETURN QUERY SELECT 'not_found'::TEXT,
      NULL::UUID, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- Rank 1, the container, FIRST. Nothing on the workspaces row is read or
  -- written here; the lock is cheap and it gives every concurrent
  -- redemption against the SAME workspace one stable serialisation point,
  -- which is what turns two racing redemptions into two queued ones.
  --
  -- FOR NO KEY UPDATE, never FOR UPDATE (LO-2). public.workspaces is a
  -- foreign-key parent of members, invitations, grants, attachments and the
  -- audit log; FOR UPDATE conflicts with the FOR KEY SHARE that every one
  -- of those concurrent child INSERTs takes on this row, so it would block
  -- all of them for the whole transaction. The weaker mode is sufficient
  -- here because nothing in this function modifies a column that any
  -- foreign key references. That phrasing is deliberate and section (c)
  -- explains why at length: LO-2's suite assertion treats one particular
  -- two-word phrase in the ten comment lines above a locking clause as a
  -- JUSTIFICATION for a stronger mode, so prose explaining why the stronger
  -- mode is NOT needed must avoid that token or it would silently
  -- pre-authorise a future FOR UPDATE at this exact site.
  PERFORM 1
     FROM public.workspaces w
    WHERE w.id = v_workspace_id
      FOR NO KEY UPDATE;

  -- Rank 2, the candidate seat -- the row the seat write at step (4) will
  -- conflict with if it exists. Locked BEFORE the invitation so the rank
  -- sequence stays ascending, and captured in full rather than PERFORMed
  -- because step (3) has to look at its role and its status.
  SELECT * INTO v_seat
    FROM public.workspace_members m
   WHERE m.workspace_id = v_workspace_id
     AND m.user_id      = p_actor_id
     FOR NO KEY UPDATE;

  v_seat_found := FOUND;

  -- Rank 4, the invitation itself, last of the locks. Keyed on token_hash,
  -- which migration 182 declares UNIQUE, so this can only ever match one
  -- row.
  SELECT i.id, i.email, i.role, i.status, i.expires_at
    INTO v_invitation_id, v_invitation_email, v_invitation_role,
         v_invitation_status, v_invitation_expires_at
    FROM public.workspace_invitations i
   WHERE i.token_hash = p_token_hash
     FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT,
      NULL::UUID, NULL::UUID, NULL::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- (3) REVALIDATE EVERY PRECONDITION *AFTER* THE LOCKS.
  --
  -- THE SELF-HEAL, FOLDED IN. The route today issues this expiry write as
  -- its own separate transaction before returning 410. Here it happens
  -- under the lock that already proved the invitation is still pending, so
  -- it cannot race the acceptance path.
  --
  -- IT MUST BE AN OUTCOME AND NOT A RAISE, and the reason is mechanical:
  -- this branch MUTATES and therefore AUDITS, and a RAISE would roll that
  -- audit row back along with the mutation (R-26). Migration 197's deferred
  -- constraint trigger on workspace_invitations (AFTER UPDATE OF status)
  -- would also abort the transaction at COMMIT if this UPDATE committed
  -- without an audit row naming this invitation's own id.
  IF v_invitation_status = 'pending' AND v_invitation_expires_at <= now() THEN
    UPDATE public.workspace_invitations
       SET status = 'expired'
     WHERE id = v_invitation_id;

    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      v_workspace_id, p_actor_id, p_actor_id,
      'workspace.invitation.expired', NULL, 'workspace_invitation', v_invitation_id,
      jsonb_build_object('status',
        jsonb_build_object('before', 'pending', 'after', 'expired'))
    )
    RETURNING id INTO v_invitation_audit_id;

    RETURN QUERY SELECT 'expired'::TEXT,
      v_workspace_id, NULL::UUID, v_invitation_role, v_invitation_audit_id, NULL::UUID;
    RETURN;
  END IF;

  -- Already accepted, refused, revoked or swept to expired. A business
  -- outcome about a link the caller holds a stale copy of, not a fact about
  -- anyone's authority, so NOT audited (R-26).
  IF v_invitation_status <> 'pending' THEN
    RETURN QUERY SELECT 'not_pending'::TEXT,
      v_workspace_id, NULL::UUID, v_invitation_role, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- THE BINDING CHECK. An attempted redemption by an identity the
  -- invitation does not name is an AUTHORITY refusal and belongs on the
  -- record (R-26), so it writes its audit row and returns a code rather
  -- than raising -- a RAISE would roll that row back.
  --
  -- Both sides are lowered because migration 182's own live-invitation
  -- index is keyed on lower(email); comparing raw would let a differently
  -- cased address miss a row the database considers the same one.
  --
  -- NO ADDRESS APPEARS IN `changes`. Migration 197 section (f) refuses the
  -- key `email` at ANY depth, and the address already lives on
  -- workspace_invitations.email behind an owner/admin-only policy, which
  -- this audit row reaches through its own target_id.
  IF lower(v_invitation_email) IS DISTINCT FROM lower(p_actor_email) THEN
    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      v_workspace_id, p_actor_id, p_actor_id,
      'workspace.invitation.redemption_refused', NULL,
      'workspace_invitation', v_invitation_id,
      jsonb_build_object('refusal', 'email_mismatch')
    )
    RETURNING id INTO v_audit_id;

    RETURN QUERY SELECT 'email_mismatch'::TEXT,
      v_workspace_id, NULL::UUID, v_invitation_role, v_audit_id, NULL::UUID;
    RETURN;
  END IF;

  -- AN OWNER-ROLE INVITATION IS REFUSED HERE, AND THIS IS THE EXPLICIT
  -- ANSWER TO "WHICH OF THE TWO DID YOU DO", AS THE PLAN REQUIRED.
  --
  -- Migration 197's guard_workspace_owner_role_change DOES define the rule
  -- structurally -- a workspace_members row may not become owner, and an
  -- owner row may not change -- but its FIRST statement is
  -- `IF current_user IN ('postgres') THEN RETURN NEW`, and current_user IS
  -- 'postgres' for the duration of this function, because this function is
  -- a postgres-owned SECURITY DEFINER function. THE TRIGGER THEREFORE
  -- ADMITS AN OWNER SEAT CREATED HERE. Its exemption is role-scoped, not
  -- function-scoped, exactly as this file's header records at length.
  --
  -- So the guard is added here explicitly rather than relied on: an owner
  -- seat is created ONLY at workspace creation (section (b)) or through the
  -- two-sided ownership transfer (sections (d) and (e), R-05/R-22). An
  -- invitation is neither, and an owner-role invitation reaching this point
  -- means somebody issued one -- which is an authority event worth having
  -- on the record, so it is audited before the code is returned.
  IF v_invitation_role = 'owner' THEN
    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      v_workspace_id, p_actor_id, p_actor_id,
      'workspace.invitation.redemption_refused', NULL,
      'workspace_invitation', v_invitation_id,
      jsonb_build_object('refusal', 'owner_invitation_forbidden')
    )
    RETURNING id INTO v_audit_id;

    RETURN QUERY SELECT 'owner_invitation_forbidden'::TEXT,
      v_workspace_id, NULL::UUID, v_invitation_role, v_audit_id, NULL::UUID;
    RETURN;
  END IF;

  -- THE SECOND HALF OF THE SAME RULE, AND IT IS NOT IN THE PLAN TEXT --
  -- RECORDED HERE RATHER THAN LEFT SILENT.
  --
  -- The single seat statement at step (4) ends `DO UPDATE SET role =
  -- EXCLUDED.role`. If the caller ALREADY holds an owner seat on this
  -- workspace and redeems a lower-role invitation to it, that clause would
  -- DEMOTE AN OWNER -- outside the two-sided transfer, silently, and past
  -- migration 197's guard because of the same postgres exemption explained
  -- above. guard_workspace_never_zero_owners would catch it only when that
  -- owner is the LAST one, and then only as a raised 42501 the route
  -- reports as a 500.
  --
  -- Refusing is the correct answer rather than "leave the role alone",
  -- because an owner silently receiving a member-role invitation and having
  -- it appear to succeed is a worse outcome than a named refusal.
  IF v_seat_found AND v_seat.role = 'owner' THEN
    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      v_workspace_id, p_actor_id, p_actor_id,
      'workspace.invitation.redemption_refused', NULL,
      'workspace_member', v_seat.id,
      jsonb_build_object('refusal', 'owner_seat_conflict')
    )
    RETURNING id INTO v_audit_id;

    RETURN QUERY SELECT 'owner_seat_conflict'::TEXT,
      v_workspace_id, v_seat.id, v_invitation_role, NULL::UUID, v_audit_id;
    RETURN;
  END IF;

  -- SEAT-TRANSITION LEGALITY, ALSO NOT IN THE PLAN TEXT AND ALSO RECORDED.
  --
  -- `DO UPDATE SET status = 'active'` would REVIVE a `removed` seat. D-14
  -- makes removal terminal -- "removal ends future access only; nothing is
  -- ever deleted or revived" -- and migration 182's status set gives
  -- `removed` no outbound edge at all. A person removed from a workspace
  -- while an invitation to it was still pending must not be able to let
  -- themselves back in by redeeming it.
  --
  -- The allowlist is migration 182's own inbound edges to `active`:
  -- pending -> active, suspended -> active, expired -> active, and
  -- active -> active as a no-op re-redemption. NOT audited, matching
  -- section (c)'s treatment of the same code: losing to the state machine
  -- is a business outcome, not an exercise of authority.
  IF v_seat_found AND v_seat.status NOT IN ('pending', 'active', 'suspended', 'expired') THEN
    RETURN QUERY SELECT 'illegal_transition'::TEXT,
      v_workspace_id, v_seat.id, v_invitation_role, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- (4) MUTATE. ONE STATEMENT EACH.
  --
  -- THE CAS IS NOW STRUCTURAL. The route's `.eq('status','pending')` filter
  -- is gone because there is nothing left for it to do: the row was locked
  -- at step (2) and its status was revalidated under that lock at step (3),
  -- so no concurrent writer can have moved it in between. There is no
  -- unchecked result to check.
  --
  -- updated_at is deliberately absent everywhere in this function -- and
  -- workspace_invitations has no updated_at column at all.
  UPDATE public.workspace_invitations
     SET status      = 'accepted',
         accepted_at = now(),
         accepted_by = p_actor_id
   WHERE id = v_invitation_id;

  -- THE SEAT, AS ONE STATEMENT. THREE THINGS ABOUT IT.
  --
  -- 1. THE CONFLICT TARGET IS THE PARTIAL UNIQUE INDEX
  --    idx_workspace_members_unique_user (workspace_id, user_id)
  --    WHERE user_id IS NOT NULL. Restating that predicate in the ON
  --    CONFLICT clause is what makes the inference well-defined: without
  --    it, PostgreSQL has no partial index to match and the statement
  --    fails to plan. Migration 182 chose a PARTIAL index deliberately --
  --    a plain composite UNIQUE would still allow the same person to be
  --    seated twice through two NULL-user_id pending rows, because every
  --    NULL is distinct.
  --
  -- 2. IT REPLACES THE LOOKUP-THEN-UPDATE-OR-INSERT FORK ENTIRELY, which
  --    is the half of F11 that let two concurrent redemptions both miss
  --    the seat and both take the INSERT branch. One statement cannot
  --    race itself.
  --
  -- 3. IT IS STILL ONE ROW PER STATEMENT, honouring the workspace_members
  --    trigger rule in this file's header: a BEFORE ROW trigger's own
  --    SELECT cannot see rows changed by its own command, so a statement
  --    touching two member rows would fire each guard twice, blind.
  --
  -- ON THE PL/PGSQL NAME QUESTION, REASONED AND NOT OBSERVED. The OUT
  -- parameter `workspace_id` shares a name with the column in the conflict
  -- target below. A bare column name in an ON CONFLICT inference list is
  -- carried as an IndexElem name and resolved directly against the target
  -- relation's attributes -- it is not transformed as an expression, so
  -- PL/pgSQL's variable substitution does not reach it. The infer clause's
  -- WHERE predicate IS an expression, which is why it names `user_id`, a
  -- word that collides with nothing here. This reasoning was NOT checked
  -- against a running database, because no plan in this phase opens one; if
  -- it is wrong the failure is a loud plan-time error in plan 17's harness,
  -- never a silent misbehaviour.
  --
  -- expires_at IS CARRIED OVER FROM THE PAIRED PENDING SEAT, and this is an
  -- addition to the plan text, stated rather than slipped in. The issuance
  -- route sets expires_at on the pending seat for a time-boxed role (D-11,
  -- contractor). When the invitee had no account at issuance time that
  -- pending row carries user_id = NULL, so it is NOT the row this statement
  -- conflicts with, and a plain INSERT would produce a contractor seat with
  -- NO expiry at all -- an unbounded contractor, which is precisely what
  -- D-11's time-boxing exists to prevent. The scalar subquery is a read,
  -- not a branch: there is still exactly one INSERT and no conditional
  -- UPDATE against this table. On the conflict path expires_at is left
  -- untouched, so an existing seat keeps its own window.
  INSERT INTO public.workspace_members (
    workspace_id, user_id, invited_email, role, status, expires_at
  ) VALUES (
    v_workspace_id,
    p_actor_id,
    v_invitation_email,
    v_invitation_role,
    'active',
    (SELECT m.expires_at
       FROM public.workspace_members m
      WHERE m.workspace_id        = v_workspace_id
        AND m.user_id             IS NULL
        AND lower(m.invited_email) = lower(v_invitation_email)
        AND m.status              = 'pending'
      ORDER BY m.created_at DESC
      LIMIT 1)
  )
  ON CONFLICT (workspace_id, user_id) WHERE user_id IS NOT NULL
  DO UPDATE SET status = 'active',
                role   = EXCLUDED.role
  RETURNING id INTO v_member_id;

  -- (5) AUDIT TWICE, IN THE SAME TRANSACTION, AND HERE IS WHY TWICE.
  --
  -- Migration 197 installs its deferred constraint triggers PER TABLE, and
  -- each matches on `target_id = NEW.id`. This function mutates a row on
  -- workspace_invitations AND a row on workspace_members, so ONE audit row
  -- cannot satisfy both: whichever table it did not name would abort the
  -- whole transaction at COMMIT.
  --
  -- THE SHAPE THAT WOULD FAIL, NAMED SO NOBODY REINTRODUCES IT. The route
  -- today writes a single log line with `targetId: pendingSeat?.id ?? null`
  -- -- null whenever no pending seat existed, and a null target_id matches
  -- no row at all. Plan 14 removes it.
  --
  -- `changes` carries the role and NOTHING else on both rows. No email
  -- address appears anywhere: migration 197 section (f) refuses the key at
  -- any depth, and the address is already reachable from the audit row
  -- through target_id, behind workspace_invitations' owner/admin-only
  -- policy.
  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, subject_member_id,
    action, permission_relied_on, target_type, target_id, changes
  ) VALUES (
    v_workspace_id, p_actor_id, p_actor_id,
    'workspace.invitation.accepted', NULL, 'workspace_invitation', v_invitation_id,
    jsonb_build_object('role', v_invitation_role)
  )
  RETURNING id INTO v_invitation_audit_id;

  -- target_id is the SEAT ROW's own id -- never null, never the workspace's,
  -- never the invitation's.
  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, subject_member_id,
    action, permission_relied_on, target_type, target_id, changes
  ) VALUES (
    v_workspace_id, p_actor_id, p_actor_id,
    'workspace.member.activated', NULL, 'workspace_member', v_member_id,
    jsonb_build_object('role', v_invitation_role)
  )
  RETURNING id INTO v_member_audit_id;

  RETURN QUERY SELECT 'ok'::TEXT,
    v_workspace_id, v_member_id, v_invitation_role,
    v_invitation_audit_id, v_member_audit_id;
END;
$$;

-- Migration 123's grant posture, NOT migration 046's.
REVOKE EXECUTE ON FUNCTION public.workspace_redeem_invitation(
  UUID, TEXT, TEXT, BOOLEAN
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_redeem_invitation(
  UUID, TEXT, TEXT, BOOLEAN
) TO service_role;

COMMENT ON FUNCTION public.workspace_redeem_invitation(
  UUID, TEXT, TEXT, BOOLEAN
) IS
  'Redeems a workspace invitation -- activating or creating the seat, resolving the invitation, and writing BOTH audit rows -- in ONE transaction (R-06/WSR-10/F11). LOCK RANKS, IN ORDER: the invitation is first read WITHOUT a lock, because the rank-1 workspace it names cannot be locked in ascending order until it is known -- that read proves nothing and the invitation is re-read from the locked row; then rank 1 public.workspaces (taken purely as a stable serialisation point for concurrent redemptions on the same workspace), then rank 2 the candidate public.workspace_members seat for this actor, then rank 4 public.workspace_invitations keyed on its UNIQUE token_hash, all FOR NO KEY UPDATE (LO-2 -- every one of these tables is a foreign-key parent, and FOR UPDATE would block every concurrent child insert on the workspace). Rank 9 public.workspace_audit_log is INSERT only and never locked. REVALIDATED AFTER THE LOCKS: a passed expiry on a still-pending invitation, which is SELF-HEALED to expired here -- an outcome and never a RAISE, because that branch mutates and therefore audits, and a RAISE would roll the audit row back; the status is still pending; the invitation names this actor''s address, compared lowered on both sides, refused as an AUTHORITY refusal that is audited before its code is returned; the invitation''s role is not owner, refused explicitly because migration 197''s guard_workspace_owner_role_change returns at its postgres exemption inside this postgres-owned definer function and therefore ADMITS an owner seat created here -- an owner seat is created only at workspace creation or through the two-sided transfer (R-05/R-22); the actor does not already hold an OWNER seat on this workspace, which the conflict clause''s role assignment would otherwise silently demote; and the existing seat''s status is a legal inbound edge to active, so a removed seat is never revived (D-14). R-24: the D-55 cohort gate applies to the ACCEPTOR, consulted through public.workspace_access_permitted BEFORE any other work and before the invitation is read at all, so an ineligible caller learns nothing -- the disabled switch RAISEs (a platform fact, nothing to audit) while a cohort miss returns not_in_cohort, which the route maps to 404 and not 403 per R-25. THE SEAT IS ONE STATEMENT: INSERT ... ON CONFLICT (workspace_id, user_id) WHERE user_id IS NOT NULL DO UPDATE, inferring migration 182''s PARTIAL unique index idx_workspace_members_unique_user, which is what removes F11''s lookup-then-update-or-insert fork and the double-INSERT race it allowed; expires_at is carried across from the paired NULL-user_id pending seat so a time-boxed contractor invitation cannot produce an unbounded seat (D-11). TRIGGERS THAT FIRE: guard_workspace_member_owner_role_change and workspace_members_updated_at on the seat write, guard_workspace_never_zero_owners only on the conflict path, and migration 197''s four deferred audit assertions at COMMIT -- which is why this function writes TWO audit rows, one per mutated table, each with target_id set to the MUTATED ROW''S OWN id: one row cannot satisfy two per-table assertions. The route''s current single log line with targetId pendingSeat?.id ?? null is exactly the shape that fails them, and plan 14 removes it. `changes` carries the role and nothing else on both rows -- no address anywhere, which migration 197 section (f) refuses at any depth and which is already reachable through target_id behind workspace_invitations'' owner/admin-only policy. THE RAW TOKEN NEVER REACHES SQL: hashInvitationToken stays in the route and this function receives only the digest, so no raw token can reach pg_stat_statements or a statement log. normalizeInvitedEmail and isInvitationRedeemable also stay in the route as the independent second layer. OUTCOME VOCABULARY the route must map: ok, not_found, not_in_cohort, expired, not_pending, email_mismatch, owner_invitation_forbidden, owner_seat_conflict, illegal_transition. Granted to service_role only (R-21 Option A): the route supplies the actor identity and the already-normalised session address it has proved, and this function re-checks the binding it was told.';


-- ─── (g) public.workspace_transition_roster_relationship ──────────────────
--         (WSR-12 / F16 / R-23)
--
-- Replaces the four PATCH branches in app/api/roster/relationships/route.ts
-- AND the `end` branch of app/api/workspaces/[workspaceId]/roster/route.ts.
-- Plan 12 does the route side.
--
-- WHAT F16 ACTUALLY IS, IN TWO HALVES.
--
--   THE MISSING CAS. Every branch reads the row, calls assertCanTransition
--   on the state it read, then issues `.update({state}).eq('id', row.id)`.
--   THERE IS NO `.eq('state', row.state)` ANYWHERE IN THAT FILE. Two
--   concurrent PATCHes can both read `proposed`, both pass the legality
--   check, and the second can overwrite the first's TERMINAL state -- an
--   `accept` landing on top of a `block` is the shape that matters, because
--   it hands a workspace the relationship the Member just refused.
--
--   THE SIDE EFFECT IN A SEPARATE TRANSACTION. The `block` branch updates
--   the relationship in one transaction and upserts workspace_roster_blocks
--   in another. A crash between them leaves a `blocked` relationship with
--   NO block row -- and assertCanPropose reads the BLOCK TABLE, not the
--   relationship state, so the workspace would then be permitted to
--   re-propose to a Member who had just blocked it. That is D-51's control
--   silently not existing.
--
-- ONE RPC WITH A p_action PARAMETER, NOT FOUR FUNCTIONS. The state machine
-- is one machine and isLegalRosterTransition is already one function;
-- splitting it into one RPC per action would create four places to keep in
-- step with LEGAL_ROSTER_EDGES instead of one, and the drift between them
-- would be invisible until a Member hit it.
--
-- p_actor_side NAMES THE SURFACE, AND IS NEVER AN AUTHORITY CLAIM. The two
-- calling surfaces have genuinely different authority rules -- the Member
-- surface authorises on "this row names me", the workspace surface on a
-- live owner/admin seat -- so this function has to know which rule to
-- apply. IT STILL RE-DERIVES THE ACTOR'S AUTHORITY FROM THE DATABASE FOR
-- BOTH SIDES (R-21): a caller that named 'member' cannot thereby become the
-- Member, because the member branch compares p_actor_id to the locked row's
-- own member_user_id, and a caller that named 'workspace' still has to hold
-- a live seat whose role passes the owner/admin test. The parameter selects
-- which check runs; it never substitutes for one.
--
-- WHAT THIS FUNCTION DOES NOT DO. It does not collapse `blocked` into
-- `refused` at the write. R-23 collapses the two only in the
-- WORKSPACE-FACING READ (migration 197's workspace_roster_page), so the
-- workspace cannot distinguish a decline from a block while the Member's
-- own view keeps the true state and the block keeps working. `blocked` is a
-- real distinct state in migration 183's CHECK and in LEGAL_ROSTER_EDGES,
-- and collapsing it here would throw away a value the schema and the pure
-- state machine both define -- which is the deviation the roster route's
-- own header already records and refuses.
CREATE OR REPLACE FUNCTION public.workspace_transition_roster_relationship(
  p_actor_id       UUID,   -- asserted by the route AFTER its own gate
                           -- (R-21 Option A)
  p_relationship_id UUID,
  p_action         TEXT,   -- 'accept' | 'refuse' | 'block' | 'end'
  p_expected_state TEXT,   -- caller-side CAS token; NULL means "do not compare"
  p_actor_side     TEXT    -- 'member' | 'workspace' -- a routing hint, never
                           -- an authority claim; see the header above
)
RETURNS TABLE (
  outcome         TEXT,
  relationship_id UUID,
  new_state       TEXT,
  audit_id        UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Every value the body reads or writes lives in a v_ local, so the OUT
  -- parameter names above are never referenced as expressions inside the
  -- body (plan 06's rule, kept).
  v_workspace_id UUID;
  v_relationship public.workspace_roster_relationships%ROWTYPE;
  v_actor_role   TEXT;
  v_authorized   BOOLEAN;
  v_new_state    TEXT;
  v_action_name  TEXT;
  v_audit_id     UUID;
BEGIN
  -- (0) LO-4: bound the wait.
  SET LOCAL lock_timeout = '3s';

  -- Validation errors, NOT audited, so RAISE is correct (R-26). Both
  -- parameters are closed vocabularies that the route's Zod enum already
  -- refuses to widen; a fifth action or a third side is a caller defect,
  -- not a business outcome.
  IF p_action IS NULL OR p_action NOT IN ('accept', 'refuse', 'block', 'end') THEN
    RAISE EXCEPTION 'p_action must be accept, refuse, block or end'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_actor_side IS NULL OR p_actor_side NOT IN ('member', 'workspace') THEN
    RAISE EXCEPTION 'p_actor_side must be member or workspace'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (1) THE KILL SWITCH, AND THE ASYMMETRY IT IS DELIBERATELY GIVEN.
  --
  -- CONSULTED ONLY ON `accept`. This is not an oversight and it is not a
  -- shortcut: it preserves the asymmetry the roster route already states in
  -- its own comment. Accepting FORMS new workspace-derived authority, so it
  -- must stop when the platform-wide control is off. Refuse, block and end
  -- are the Member's OWN PROTECTIVE ACTIONS, D-18 makes revocation
  -- unconditional, and disabling a Member's escape hatch during an incident
  -- would trap them in exactly the relationship the control exists to
  -- contain. A control that locks the victim in is not a safety control.
  --
  -- The guard therefore sits INSIDE the action branch rather than at the
  -- top of the body, and __tests__/migration-198.test.ts asserts that
  -- placement by source offset so a future tidy-up cannot "simplify" it to
  -- the top.
  IF p_action = 'accept' THEN
    IF NOT public.workspace_access_enabled() THEN
      RAISE EXCEPTION 'workspace access is disabled'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- (2) LOCK, IN ASCENDING LO-1 RANK ONLY: 1 -> 3 -> 3.5.
  --
  -- READ BEFORE LOCK, AND WHY IT IS SAFE. The rank-1 row to lock is the
  -- relationship's workspace, which is not known until the relationship has
  -- been read. Reading it UNLOCKED first is the only way to acquire the
  -- rest in ascending rank order. This read proves NOTHING and is treated
  -- as proving nothing: the relationship is re-read from the locked row
  -- below and every precondition, including the compare-and-set, is decided
  -- against THAT copy.
  SELECT r.workspace_id INTO v_workspace_id
    FROM public.workspace_roster_relationships r
   WHERE r.id = p_relationship_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Rank 1, the container, FIRST. Nothing on the workspaces row is read or
  -- written; the lock gives concurrent transitions on the same workspace
  -- one stable serialisation point. FOR NO KEY UPDATE, never the stronger
  -- mode (LO-2) -- public.workspaces is a foreign-key parent of six tables
  -- and the stronger mode would block every concurrent child insert on it
  -- for the whole transaction, which is the throughput cliff and the
  -- enlarged deadlock surface LO-1 exists to avoid. Section (c) explains
  -- why this paragraph is worded the way it is.
  PERFORM 1
     FROM public.workspaces w
    WHERE w.id = v_workspace_id
      FOR NO KEY UPDATE;

  -- Rank 3, the consent root. THIS LOCK IS THE ANSWER TO F16: from here to
  -- COMMIT no other transaction can move this row, so the state read below
  -- is the state written against.
  SELECT * INTO v_relationship
    FROM public.workspace_roster_relationships r
   WHERE r.id = p_relationship_id
     FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Rank 3.5, and ONLY for the action that touches it. LO-1's auxiliary
  -- rule: workspace_roster_blocks is a child of rank 3 and is touched AFTER
  -- it, never before. Locking the pair's block row here -- whether or not
  -- one exists yet -- means the upsert at step (4) cannot race a concurrent
  -- block of the same pair.
  IF p_action = 'block' THEN
    PERFORM 1
       FROM public.workspace_roster_blocks b
      WHERE b.workspace_id   = v_workspace_id
        AND b.member_user_id = v_relationship.member_user_id
        FOR NO KEY UPDATE;
  END IF;

  -- (3) REVALIDATE EVERY PRECONDITION *AFTER* THE LOCK.
  --
  -- THE COMPARE-AND-SET. THIS IS THE POINT OF THE EXERCISE. The caller
  -- passes the state it believes the row holds and this compares it to the
  -- LOCKED row. F16 is that no such comparison existed anywhere: the route
  -- reads the row in one transaction, checks legality against what it read,
  -- and writes in another with no condition on the state at all, so two
  -- concurrent PATCHes can both read `proposed` and the loser can overwrite
  -- the winner's terminal state.
  --
  -- NOT audited (R-26): losing a race is a business outcome about the
  -- caller's stale copy, not a fact about anyone's authority, and a trail
  -- full of stale-CAS rows would bury the refusals that matter.
  IF p_expected_state IS NOT NULL
     AND v_relationship.state IS DISTINCT FROM p_expected_state THEN
    RETURN QUERY SELECT 'stale'::TEXT, v_relationship.id, v_relationship.state, NULL::UUID;
    RETURN;
  END IF;

  -- AUTHORITY, BY SIDE, RE-DERIVED FROM THE DATABASE ON BOTH BRANCHES.
  IF p_actor_side = 'member' THEN
    -- The Member surface authorises on "this row names me" -- the same rule
    -- app/api/roster/relationships/route.ts applies before every write
    -- (T-38-07-02), expressed where the lock is held. All four actions are
    -- available to the named Member.
    v_authorized := v_relationship.member_user_id IS NOT DISTINCT FROM p_actor_id;
  ELSE
    -- The workspace surface authorises on a LIVE seat whose role passes the
    -- manage-roster test -- canManageRoster in lib/workspaces/membership.ts,
    -- re-derived here rather than accepted as a parameter (R-21). There is
    -- deliberately no p_actor_role and there never will be.
    SELECT m.role INTO v_actor_role
      FROM public.workspace_members m
     WHERE m.workspace_id = v_workspace_id
       AND m.user_id      = p_actor_id
       AND m.status       = 'active'
       AND (m.expires_at IS NULL OR m.expires_at > now());

    -- ONLY `end` IS AVAILABLE TO A WORKSPACE. A workspace may never accept,
    -- refuse or block ON A MEMBER'S BEHALF: D-05 makes a proposal inert
    -- until the named Member affirms it, and a workspace that could accept
    -- its own proposal would make consent a formality. Ending is available
    -- to both sides (D-17) -- only the Member's end is unconditional (D-18).
    --
    -- COALESCE, not a bare boolean: v_actor_role IS NULL for a caller with
    -- no live seat, and `NULL IN (...) AND TRUE` is NULL, which an IF treats
    -- as false only by accident. Fail closed on purpose, not by luck.
    v_authorized := v_actor_role IN ('owner', 'admin') AND p_action = 'end';
  END IF;

  IF NOT COALESCE(v_authorized, FALSE) THEN
    -- An AUTHORITY refusal, so it is audited and therefore MUST NOT RAISE:
    -- a RAISE would roll back the row written moments earlier in this
    -- transaction (R-26). subject_member_id is the relationship's own
    -- Member on both sides (D-22) -- on the Member side the actor and the
    -- subject coincide, on the workspace side they do not.
    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      v_workspace_id, p_actor_id, v_relationship.member_user_id,
      'roster.transition_refused', NULL,
      'workspace_roster_relationship', v_relationship.id,
      jsonb_build_object('refusal', 'forbidden')
    )
    RETURNING id INTO v_audit_id;

    RETURN QUERY SELECT 'forbidden'::TEXT,
      v_relationship.id, v_relationship.state, v_audit_id;
    RETURN;
  END IF;

  v_new_state := CASE p_action
                   WHEN 'accept' THEN 'accepted'
                   WHEN 'refuse' THEN 'refused'
                   WHEN 'block'  THEN 'blocked'
                   ELSE 'ended'
                 END;

  -- TRANSITION LEGALITY, REPRODUCING LEGAL_ROSTER_EDGES EXACTLY:
  --   proposed -> accepted, refused, blocked   (D-05: inert until affirmed)
  --   accepted -> ended                        (D-17/D-18)
  --   refused, blocked, ended are TERMINAL -- no outbound edge, ever, and
  --   they are covered by falling through this check rather than by being
  --   listed, so a renewed relationship is a new row and never a revival
  --   (D-25's never-move-never-copy posture).
  --
  -- isLegalRosterTransition stays in the route as the INDEPENDENT second
  -- layer, and it is kept for a reason a RAISE cannot supply: it produces
  -- the friendly sentence naming the illegal edge ("Cannot move a roster
  -- relationship from ended to accepted"). Two layers agreeing is this
  -- repo's doctrine (078, 136, 187, 190, 192, 196), and the suite imports
  -- LEGAL_ROSTER_EDGES from source so a future divergence fails the tests
  -- instead of reaching production.
  --
  -- NOT audited, matching section (c)'s treatment of the same code.
  IF NOT (
       (v_relationship.state = 'proposed' AND v_new_state IN ('accepted', 'refused', 'blocked'))
    OR (v_relationship.state = 'accepted' AND v_new_state = 'ended')
  ) THEN
    RETURN QUERY SELECT 'illegal_transition'::TEXT,
      v_relationship.id, v_relationship.state, NULL::UUID;
    RETURN;
  END IF;

  -- (4) MUTATE. ONE ROW PER STATEMENT, EVERY STATEMENT KEYED ON THE PRIMARY
  --     KEY, so none of them can ever match more than one row.
  --
  -- updated_at is deliberately absent from all four -- migration 183's
  -- workspace_roster_relationships_updated_at trigger fires on each and
  -- would overwrite anything set by hand.
  IF p_action = 'accept' THEN
    -- effective_from is set ONLY when it is currently null, which preserves
    -- the route's existing behaviour exactly: a workspace that named a
    -- start date when it proposed keeps that date, and a proposal with no
    -- date starts today. COALESCE expresses "only when null" in one
    -- statement rather than a branch. The UTC cast matches the route's
    -- `nowIso.slice(0, 10)` to the day.
    UPDATE public.workspace_roster_relationships
       SET state          = 'accepted',
           accepted_at    = now(),
           effective_from = COALESCE(effective_from, (now() AT TIME ZONE 'UTC')::DATE)
     WHERE id = v_relationship.id;

  ELSIF p_action = 'refuse' THEN
    UPDATE public.workspace_roster_relationships
       SET state      = 'refused',
           refused_at = now()
     WHERE id = v_relationship.id;

  ELSIF p_action = 'block' THEN
    UPDATE public.workspace_roster_relationships
       SET state      = 'blocked',
           refused_at = now()
     WHERE id = v_relationship.id;

    -- THE SIDE EFFECT, NOW IN THE SAME TRANSACTION AS THE STATE CHANGE.
    -- THIS IS THE OTHER HALF OF WSR-12. Today this upsert is a separate
    -- write issued after the state update has already committed, so a crash
    -- between the two leaves a `blocked` relationship with NO block row --
    -- and assertCanPropose reads THIS TABLE, not the relationship state, so
    -- the workspace would then be permitted to re-propose to a Member who
    -- had just blocked it. Being in one transaction is what makes that
    -- window not exist.
    --
    -- ON CONFLICT DO NOTHING is D-51's upsert-and-ignore: a repeat block is
    -- a harmless no-op, which is what migration 183's
    -- UNIQUE (workspace_id, member_user_id) was chosen to make it.
    INSERT INTO public.workspace_roster_blocks (workspace_id, member_user_id)
    VALUES (v_workspace_id, v_relationship.member_user_id)
    ON CONFLICT (workspace_id, member_user_id) DO NOTHING;

  ELSE
    UPDATE public.workspace_roster_relationships
       SET state    = 'ended',
           ended_at = now(),
           ended_by = p_actor_id
     WHERE id = v_relationship.id;
  END IF;

  -- (5) AUDIT, IN THE SAME TRANSACTION.
  --
  -- The action strings are the ones the two routes ALREADY EMIT, so the
  -- trail stays continuous across this change rather than splitting into a
  -- before-and-after vocabulary. That is why `end` is side-conditional:
  -- app/api/roster/relationships/route.ts writes 'roster.ended' and
  -- app/api/workspaces/[workspaceId]/roster/route.ts writes
  -- 'workspace.roster.ended', and one RPC now serves both. Collapsing them
  -- would rewrite the meaning of every historical row of one of the two.
  v_action_name := CASE
                     WHEN p_action = 'accept'          THEN 'roster.accepted'
                     WHEN p_action = 'refuse'          THEN 'roster.refused'
                     WHEN p_action = 'block'           THEN 'roster.blocked'
                     WHEN p_actor_side = 'workspace'   THEN 'workspace.roster.ended'
                     ELSE 'roster.ended'
                   END;

  -- target_id is the RELATIONSHIP ROW's own id. Migration 197's deferred
  -- constraint trigger on workspace_roster_relationships matches on
  -- target_id = NEW.id, so any other value fails the whole transaction at
  -- COMMIT. `changes` carries the state move and nothing else -- no
  -- professional role, no identifier belonging to a person; the actor and
  -- the subject are already first-class columns (D-22, WSR-19).
  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, subject_member_id,
    action, permission_relied_on, target_type, target_id, changes
  ) VALUES (
    v_workspace_id, p_actor_id, v_relationship.member_user_id,
    v_action_name, NULL, 'workspace_roster_relationship', v_relationship.id,
    jsonb_build_object('state',
      jsonb_build_object('before', v_relationship.state, 'after', v_new_state))
  )
  RETURNING id INTO v_audit_id;

  RETURN QUERY SELECT 'ok'::TEXT, v_relationship.id, v_new_state, v_audit_id;
END;
$$;

-- Migration 123's grant posture, NOT migration 046's.
REVOKE EXECUTE ON FUNCTION public.workspace_transition_roster_relationship(
  UUID, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_transition_roster_relationship(
  UUID, UUID, TEXT, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.workspace_transition_roster_relationship(
  UUID, UUID, TEXT, TEXT, TEXT
) IS
  'Moves one roster relationship through the D-05/D-17/D-18 state machine -- accept, refuse, block or end -- and writes its audit row, and the block side effect, in ONE transaction (R-06/WSR-12/F16). ONE function with a p_action parameter rather than four, because the state machine is one machine and four copies of LEGAL_ROSTER_EDGES would drift invisibly. LOCK RANKS, IN ORDER: the relationship is first read WITHOUT a lock, because the rank-1 workspace it names cannot be locked in ascending order until it is known -- that read proves nothing and the row is re-read from the locked copy; then rank 1 public.workspaces (a stable serialisation point), then rank 3 public.workspace_roster_relationships, then -- for the block action ONLY -- rank 3.5 public.workspace_roster_blocks, which is LO-1''s auxiliary rule: a child of rank 3, touched after it. All FOR NO KEY UPDATE (LO-2). Rank 9 public.workspace_audit_log is INSERT only and never locked. REVALIDATED AFTER THE LOCK: the row still exists; THE COMPARE-AND-SET, p_expected_state against the LOCKED row''s state, which is the whole of F16 -- no `.eq(''state'', ...)` existed anywhere in the routes, so two concurrent PATCHes could both read proposed and one could overwrite the other''s terminal state; authority, re-derived from the database on BOTH sides (R-21) -- the member side requires the row''s own member_user_id to equal the actor, the workspace side requires a LIVE active unexpired seat holding owner or admin AND permits ONLY `end`, because a workspace may never accept, refuse or block on a Member''s behalf (D-05); and transition legality reproducing LEGAL_ROSTER_EDGES, with refused, blocked and ended terminal. p_actor_side names the CALLING SURFACE and is never an authority claim -- it selects which check runs and never substitutes for one. THE KILL SWITCH IS CONSULTED ONLY ON accept, deliberately: accepting forms new workspace-derived authority, while refuse, block and end are the Member''s own protective actions and D-18 makes revocation unconditional -- disabling a Member''s escape hatch during an incident would trap them in exactly the relationship the control exists to contain. That placement is asserted by source offset in the suite. THE BLOCK SIDE EFFECT IS IN THE SAME TRANSACTION AS THE STATE CHANGE: today the workspace_roster_blocks upsert is a separate write, so a crash between the two leaves a blocked relationship with no block row -- and assertCanPropose reads the BLOCK TABLE, not the state, so the workspace would then be permitted to re-propose to a Member who had just blocked it. ON CONFLICT DO NOTHING is D-51''s upsert-and-ignore. blocked is NOT collapsed to refused at the write: R-23 collapses the two only in the workspace-facing READ (migration 197''s workspace_roster_page), so the workspace cannot distinguish a decline from a block while the Member''s own view keeps the true state. TRIGGERS THAT FIRE: workspace_roster_relationships_updated_at on every UPDATE, which is why updated_at is never set by hand, and migration 197''s deferred audit assertion at COMMIT, which is why target_id is the RELATIONSHIP ROW''S OWN id. The audit action strings are the ones the two routes already emit -- roster.accepted, roster.refused, roster.blocked, roster.ended for the Member surface and workspace.roster.ended for the workspace surface -- so the trail stays continuous rather than splitting into a before-and-after vocabulary. OUTCOME VOCABULARY the route must map: ok, not_found, stale, forbidden, illegal_transition. Only forbidden is an AUTHORITY refusal; it writes its audit row before returning its code and never raises, because a RAISE would roll that row back (R-26). Granted to service_role only.';


-- ─── (h) public.workspace_accept_custody_transfer (WSR-09 / WSR-13 / F9) ──
--
-- Replaces the PATCH branch of app/api/vault/custody-transfers/route.ts.
-- Plan 16 does the route side.
--
-- WHAT F9 STILL IS, AFTER THE P0 HOTFIX TOOK ITS CHEAP HALF. The route runs
-- THREE SEPARATE TRANSACTIONS: read the transfer, CAS-update it to
-- `accepted` with `.eq('state','offered')`, then call
-- transfer_vault_project_custody(). The hotfix added the stale-custodian
-- double filter and the single-row check, which closed the dangerous
-- overwrite. THE RESIDUAL WINDOW IS BETWEEN TRANSACTIONS 2 AND 3: a crash,
-- a lost connection, a redeploy or a concurrent transfer landing there
-- leaves the diary saying `accepted` while custody never moved. Split-brain,
-- on the one record whose custodian decides who can reach it. WSR-09 has
-- been deferred TWICE for this. It is not deferred again: from here the
-- diary move, the custody move and the audit row are ONE transaction.
--
-- ONE RPC FOR ALL THREE RESPONSES, NOT ONE FOR ACCEPT. p_action carries
-- `accept`, `decline` or `withdraw`. The diary write is then atomic on
-- EVERY path rather than only on the path that also moves custody, and the
-- terminal-state CAS, the authority rule and the audit row are written once
-- instead of three times drifting apart -- the same reasoning section (g)
-- gives for serving four roster actions from one function.
--
-- ══ THE SINGLE MOST IMPORTANT LINE IN THIS SECTION ══════════════════════
-- THIS FUNCTION CALLS public.transfer_vault_project_custody(). IT NEVER
-- ISSUES ITS OWN UPDATE AGAINST public.vault_projects. Migrations 190 and
-- 196 both exempt `current_user IN ('postgres')`, which is true inside ANY
-- postgres-owned SECURITY DEFINER function -- including this one. A raw
-- UPDATE here WOULD WORK. THAT IS PRECISELY WHY IT MUST NOT BE WRITTEN:
-- both guards' headers describe their exemption as function-scoped while
-- their code enforces it as role-scoped, and the phase's answer to that gap
-- is to remove the need to rely on the sentence rather than to churn two
-- applied, reviewed, text-locked production migrations. One sanctioned
-- write path to vault_projects.user_id, kept literally true, at zero cost.
-- __tests__/migration-198.test.ts holds the line in two places: a file-wide
-- assertion that no function here SETs user_id, and a section-local one
-- whose failure message names the role-scoped exemption.
--
-- WHAT THE NESTED CALL BUYS, BESIDES THE DOCTRINE. A nested SECURITY
-- DEFINER call runs in the SAME transaction, so atomicity is preserved
-- exactly as it would be for an inline UPDATE. Its `WHERE id = p_project_id
-- AND user_id = p_from_user_id` double filter and its NULL-return
-- stale-custodian semantics come along for free, so this function does not
-- reimplement either.
--
-- BOTH vault_projects GUARDS FIRE ON THAT NESTED UPDATE AND BOTH MUST ADMIT
-- IT. guard_owner_immutable (migration 139, exempted for this one table by
-- migration 196) fires FIRST -- trigger-name alphabetical order, and 'g' <
-- 't' puts it ahead of trg_guard_vault_projects_user_id_immutable
-- (migration 190). That is exactly the interaction that broke custody
-- transfer in production until 196: 190's suite was green, its function
-- existed and the route called it correctly, and the transfer still raised
-- 42501 because a differently-named second trigger also fired. NO TEXT-LOCK
-- IN THIS FILE CAN PROVE THAT PAIR ADMITS THIS CALL. Plan 17's owner-run
-- behavioural harness, performing a real custody accept, is the proof --
-- and 38.0.1-VERIFICATION.md Part B row 7, which flipped from ERROR to PASS
-- when 196 landed, is the precedent for why.
--
-- ══ WHY THE CUSTODY MOVE COMES BEFORE THE DIARY UPDATE ══════════════════
-- A DEVIATION FROM SECTION (a)'s STEP ORDER, JUSTIFIED HERE AT THE POINT OF
-- DEVIATION AS THE TEMPLATE REQUIRES. The sanctioned function returns NULL
-- rather than raising when the custodian has moved. If the diary UPDATE ran
-- first and that NULL then had to be reported as an OUTCOME CODE, the
-- function would RETURN -- and a RETURN COMMITS. The transaction would
-- commit a transfer row reading `accepted` with custody unmoved: F9's
-- split-brain, rebuilt inside the very function written to close it. Doing
-- the custody move first means the NULL branch has mutated NOTHING and can
-- return its outcome code honestly.
--
-- LO-1 IS NOT AFFECTED. LO-1 governs LOCK ACQUISITION, and both row locks
-- (rank 7 then rank 8) are already held before either write, so neither
-- write acquires anything new and there is no ordering hazard between them.
-- Only the WRITE order is 8 -> 7 -> 9, and it is deliberate.
--
-- ══ NO D-56 KILL SWITCH HERE, DELIBERATELY ══════════════════════════════
-- STATE IT EXPLICITLY SO A FUTURE REVIEWER DOES NOT "FIX" IT. Custody is a
-- MEMBER act. app/api/vault/custody-transfers/route.ts is gated with
-- requireMemberApiAccount ONLY and has carried ZERO workspace-derived
-- authority since the F1 hotfix deleted assertMayOffer's workspace-admin
-- branch -- there is no longer any workspace lookup for authority to be
-- proved through, which is why the F7 audit found the kill switch correctly
-- absent from that file. And workspace_custody_transfers.workspace_id is
-- NULLABLE precisely because a transfer may be offered outside any
-- workspace context at all (migration 185). Gating a Member's disposition
-- of their OWN record on a workspace-feature control would be a category
-- error, and for a NULL-workspace transfer it would be gating on a
-- workspace that does not exist. Contrast section (g), which consults the
-- switch on `accept` only, and section (f), which consults it first: those
-- flows form workspace-derived authority. This one does not.
--
-- ══ THE NULLABLE workspace_id ON THE AUDIT PATH -- THE CHOICE, STATED ════
-- THIS IS THE ONE PLACE IN THE PHASE WHERE THE AUDIT-ASSERTION TRIGGER AND
-- A NULLABLE COLUMN CAN CONTRADICT EACH OTHER. The facts:
--
--   * workspace_audit_log.workspace_id is NOT NULL and references
--     public.workspaces (migration 182).
--   * workspace_custody_transfers.workspace_id is NULLABLE (migration 185).
--   * migration 197's assert_workspace_custody_transfer_change_audited is
--     an AFTER UPDATE OF state deferred constraint trigger that fires
--     UNCONDITIONALLY and demands an audit row at COMMIT.
--
-- Those three cannot all hold. For a transfer offered outside any workspace
-- context, NO audit row can be written -- and 197 as written would then
-- abort the transaction at COMMIT, making every direct Member-to-Member
-- custody accept, decline and withdraw IMPOSSIBLE. That is true of the
-- CURRENT route too, not only of the RPC that replaces it.
--
-- THE CHOICE MADE HERE: the audit row is written WHENEVER workspace_id IS
-- NOT NULL -- matching the route's existing `if (row.workspace_id)`
-- condition, so the trail stays continuous -- and the block after section
-- (i) RE-SCOPES migration 197's constraint trigger, by name and with a WHEN
-- clause, to fire only on rows that HAVE a workspace. The two now agree.
-- This is 197's own stated discipline applied one step further: it
-- column-scoped that trigger because a constraint that fires on writes
-- nobody considers consequential is one that gets disabled rather than one
-- that gets satisfied, and a constraint that demands a row the schema makes
-- impossible to write is not strict, it is unsatisfiable.
--
-- THE TWO ALTERNATIVES, AND WHY NOT. Making
-- workspace_audit_log.workspace_id nullable would be a far larger change,
-- reaching every policy, index and reader of that table including D-50's
-- both-sides read and 197's redacted audit page -- rejected. Refusing to
-- resolve a NULL-workspace transfer would delete the direct
-- Member-to-Member custody flow the column was made nullable to support --
-- rejected. Plan 16's executor must not contradict this choice; it is
-- carried verbatim into 38.0.2-11-SUMMARY.md and to the owner checkpoint.
--
-- ══ WHAT STAYS IN THE ROUTE (the KEEP list) ═════════════════════════════
-- lib/workspaces/custody-transfer.ts's assertMayRespond,
-- isLegalTransferTransition and describeTransferEffect all STAY, as the
-- independent second layer this repo's doctrine requires (078, 136, 187,
-- 190, 192, 196) -- including assertMayRespond's self-dealing check, which
-- exists so that if assertMayOffer is ever widened again the same person
-- still cannot both offer and resolve one transfer. The authority predicate
-- below copies it exactly rather than deduplicating it.
CREATE OR REPLACE FUNCTION public.workspace_accept_custody_transfer(
  p_actor_id       UUID,   -- asserted by the route AFTER requireMemberApiAccount
                           -- (R-21 Option A)
  p_transfer_id    UUID,
  p_action         TEXT,   -- 'accept' | 'decline' | 'withdraw'
  p_expected_state TEXT    -- caller-side CAS token; NULL means "do not compare"
)
RETURNS TABLE (
  outcome     TEXT,
  transfer_id UUID,
  project_id  UUID,
  audit_id    UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Every value the body reads or writes lives in a v_ local, so the OUT
  -- parameter names above are never referenced as expressions inside the
  -- body (plan 06's rule, kept). It matters more here than anywhere else in
  -- this file: `project_id` is also a COLUMN NAME on the table this
  -- function locks, and an unqualified mention of it would be ambiguous.
  v_transfer    public.workspace_custody_transfers%ROWTYPE;
  v_custodian   UUID;
  v_authorized  BOOLEAN;
  v_new_state   TEXT;
  v_action_name TEXT;
  v_subject_id  UUID;
  v_moved_id    UUID;
  v_audit_id    UUID;
BEGIN
  -- (0) LO-4: bound the wait.
  SET LOCAL lock_timeout = '3s';

  -- A validation error, NOT audited, so RAISE is correct (R-26). The three
  -- actions are a closed vocabulary the route's Zod enum already refuses to
  -- widen; a fourth is a caller defect, not a business outcome.
  IF p_action IS NULL OR p_action NOT IN ('accept', 'decline', 'withdraw') THEN
    RAISE EXCEPTION 'p_action must be accept, decline or withdraw'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (1) NO KILL-SWITCH CONSULTATION. See the section header: custody is a
  --     Member act carrying no workspace-derived authority (F1/F7), and the
  --     transfer's workspace_id is nullable because a transfer may be
  --     offered outside any workspace at all. Deliberate, not omitted.

  -- (2) LOCK, IN ASCENDING LO-1 RANK ONLY: 7 -> 8.
  --
  -- Rank 7, the diary row. THIS LOCK IS THE ANSWER TO THE DOUBLE-RESOLVE
  -- half of F9: from here to COMMIT no other transaction can move this row,
  -- so the state read below is the state written against.
  SELECT * INTO v_transfer
    FROM public.workspace_custody_transfers t
   WHERE t.id = p_transfer_id
     FOR NO KEY UPDATE;   -- LO-2: NO KEY, never the stronger mode

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- Rank 8, the shared resource, LAST -- which is the whole reason
  -- vault_projects sits at the bottom of LO-1. It is the most contended row
  -- in the model and the join point of the two flows most likely to
  -- collide: custody acceptance arrives at it as 7 -> 8 and roster and
  -- attachment work arrives as 1-6 -> 8, so ranking it last means both
  -- flows approach it in the SAME direction -- lock-order inversion is what
  -- produces deadlocks -- and every transaction holds it for the shortest
  -- possible interval, here only the few statements that remain.
  --
  -- TAKEN ON ALL THREE ACTIONS, NOT ONLY ON ACCEPT. A decline and a
  -- withdraw do not read or write this row, so the lock could have been put
  -- inside the accept branch. It is not, deliberately: one uniform lock
  -- sequence for every action means two concurrent responses to the same
  -- offer can never interleave into two different orders, which is the
  -- property LO-1 exists to buy, and it is worth more than a lock held for
  -- microseconds on a flow that runs at human speed. FOR NO KEY UPDATE, as
  -- everywhere in this file (LO-2): public.vault_projects is a foreign-key
  -- parent of tracks, assets, documents and attachments among others, and
  -- the stronger mode would block every concurrent child insert against it
  -- for the whole transaction.
  SELECT p.user_id INTO v_custodian
    FROM public.vault_projects p
   WHERE p.id = v_transfer.project_id
     FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    -- Unreachable through the foreign key (ON DELETE CASCADE would have
    -- taken the transfer row with the project), and handled anyway rather
    -- than left to a NULL comparison further down.
    RETURN QUERY SELECT 'not_found'::TEXT, v_transfer.id, v_transfer.project_id, NULL::UUID;
    RETURN;
  END IF;

  -- (3) REVALIDATE EVERY PRECONDITION *AFTER* THE LOCK.
  --
  -- THE COMPARE-AND-SET, against the LOCKED row. NOT audited (R-26):
  -- losing a race is a business outcome about the caller's stale copy, not
  -- a fact about anyone's authority.
  IF p_expected_state IS NOT NULL
     AND v_transfer.state IS DISTINCT FROM p_expected_state THEN
    RETURN QUERY SELECT 'stale'::TEXT, v_transfer.id, v_transfer.project_id, NULL::UUID;
    RETURN;
  END IF;

  -- THE TERMINAL-STATE CHECK. This replaces the route's
  -- `.eq('state', 'offered')` filter, which until now was the ONLY thing in
  -- the entire system preventing a double-resolve of a custody offer --
  -- workspace_custody_transfers has never carried an UPDATE guard, a gap
  -- migration 197 names explicitly while installing the equivalent on its
  -- own ownership-transfer table. Section (i) closes it at the database
  -- layer; this is the same rule where the lock is held, so the caller gets
  -- an outcome code instead of a raw check_violation. NOT audited.
  IF v_transfer.state <> 'offered' THEN
    RETURN QUERY SELECT 'already_resolved'::TEXT, v_transfer.id, v_transfer.project_id, NULL::UUID;
    RETURN;
  END IF;

  -- AUTHORITY, COPYING assertMayRespond's PREDICATE EXACTLY.
  --   accept / decline -- only to_user_id, AND NEVER THE OFFERER.
  --   withdraw         -- only offered_by or from_user_id.
  -- THE OFFERER MAY NEVER ALSO ACCEPT. That is the F1 attack shape: one
  -- person performing both sides of an act D-29 requires to be two-sided.
  -- It is refused here, refused again by assertMayRespond at the route --
  -- kept deliberately as the independent second layer, self-dealing check
  -- included -- and refused a third time at offer time by migration 187's
  -- INSERT guard. Three layers agreeing, which is this repo's doctrine
  -- rather than deduplication.
  IF p_action IN ('accept', 'decline') THEN
    v_authorized := v_transfer.to_user_id IS NOT DISTINCT FROM p_actor_id
                AND v_transfer.offered_by IS DISTINCT FROM p_actor_id;
  ELSE
    v_authorized := v_transfer.offered_by   IS NOT DISTINCT FROM p_actor_id
                 OR v_transfer.from_user_id IS NOT DISTINCT FROM p_actor_id;
  END IF;

  IF NOT COALESCE(v_authorized, FALSE) THEN
    -- An AUTHORITY refusal, so it is audited and therefore MUST NOT RAISE:
    -- a RAISE rolls the transaction back and takes the row written moments
    -- earlier with it (R-26). Written only when the transfer HAS a
    -- workspace -- see the section header's stated choice; a refusal
    -- mutates nothing, so migration 197's assertion is not involved on this
    -- path either way. subject_member_id is the current custodian: the
    -- action concerns THEIR record (D-22).
    IF v_transfer.workspace_id IS NOT NULL THEN
      INSERT INTO public.workspace_audit_log (
        workspace_id, actor_user_id, subject_member_id,
        action, permission_relied_on, target_type, target_id, changes
      ) VALUES (
        v_transfer.workspace_id, p_actor_id, v_transfer.from_user_id,
        'custody.transfer.refused', NULL,
        'workspace_custody_transfer', v_transfer.id,
        jsonb_build_object('refusal', 'forbidden', 'attempted', p_action)
      )
      RETURNING id INTO v_audit_id;
    END IF;

    RETURN QUERY SELECT 'forbidden'::TEXT, v_transfer.id, v_transfer.project_id, v_audit_id;
    RETURN;
  END IF;

  -- THE STALE-CUSTODIAN PRE-CHECK, ON ACCEPT ONLY, AGAINST THE LOCKED ROW.
  -- This is the check the P0 hotfix added at the route -- and it is now
  -- INSIDE THE SAME TRANSACTION AS THE WRITE, which is the whole of what
  -- F9's residual window was. If the custodian moved after the offer, the
  -- offer is stale and can no longer be accepted; the route maps this one
  -- code to one 409, exactly as it does today.
  IF p_action = 'accept'
     AND v_custodian IS DISTINCT FROM v_transfer.from_user_id THEN
    IF v_transfer.workspace_id IS NOT NULL THEN
      INSERT INTO public.workspace_audit_log (
        workspace_id, actor_user_id, subject_member_id,
        action, permission_relied_on, target_type, target_id, changes
      ) VALUES (
        v_transfer.workspace_id, p_actor_id, v_transfer.from_user_id,
        'custody.transfer.refused', NULL,
        'workspace_custody_transfer', v_transfer.id,
        jsonb_build_object('refusal', 'stale_custodian')
      )
      RETURNING id INTO v_audit_id;
    END IF;

    RETURN QUERY SELECT 'stale_custodian'::TEXT, v_transfer.id, v_transfer.project_id, v_audit_id;
    RETURN;
  END IF;

  v_new_state := CASE p_action
                   WHEN 'accept'  THEN 'accepted'
                   WHEN 'decline' THEN 'declined'
                   ELSE 'withdrawn'
                 END;

  -- The audit action strings the route ALREADY EMITS, so the trail stays
  -- continuous across this change rather than splitting into a
  -- before-and-after vocabulary. Same reasoning as section (g).
  v_action_name := CASE p_action
                     WHEN 'accept'  THEN 'custody.transfer.accepted'
                     WHEN 'decline' THEN 'custody.transfer.declined'
                     ELSE 'custody.transfer.withdrawn'
                   END;

  -- The route attributes an accept to the incoming custodian and the other
  -- two to the outgoing one; reproduced rather than normalised, for the
  -- same continuity reason (D-22).
  v_subject_id := CASE p_action
                    WHEN 'accept' THEN v_transfer.to_user_id
                    ELSE v_transfer.from_user_id
                  END;

  -- (4) MUTATE. THE CUSTODY MOVE COMES FIRST -- see the section header for
  --     why, at length: the sanctioned function reports a moved custodian
  --     by returning NULL, and a NULL reported as an outcome code RETURNS,
  --     and a RETURN COMMITS. Doing this before the diary UPDATE means that
  --     branch has mutated nothing and can say so honestly instead of
  --     committing the split-brain this function exists to close.
  --
  -- THE ONE SANCTIONED WRITE PATH TO vault_projects.user_id. Not an UPDATE
  -- here -- see this section's header. A raw UPDATE would be admitted by
  -- both guards, because their exemption is role-scoped and this function
  -- is postgres-owned; that is exactly why it is not written.
  IF p_action = 'accept' THEN
    v_moved_id := public.transfer_vault_project_custody(
      v_transfer.project_id, v_transfer.from_user_id, v_transfer.to_user_id
    );

    IF v_moved_id IS NULL THEN
      -- The sanctioned function's OWN stale-custodian semantics, surfaced
      -- as the SAME outcome code as the pre-check above so the route maps
      -- one code to one 409. Unreachable in practice -- the rank-8 lock is
      -- held, so nothing can move user_id between the pre-check and here --
      -- and kept as defence in depth rather than as an assumption, because
      -- nothing has mutated yet at this point and the honest report costs
      -- nothing.
      IF v_transfer.workspace_id IS NOT NULL THEN
        INSERT INTO public.workspace_audit_log (
          workspace_id, actor_user_id, subject_member_id,
          action, permission_relied_on, target_type, target_id, changes
        ) VALUES (
          v_transfer.workspace_id, p_actor_id, v_transfer.from_user_id,
          'custody.transfer.refused', NULL,
          'workspace_custody_transfer', v_transfer.id,
          jsonb_build_object('refusal', 'stale_custodian')
        )
        RETURNING id INTO v_audit_id;
      END IF;

      RETURN QUERY SELECT 'stale_custodian'::TEXT, v_transfer.id, v_transfer.project_id, v_audit_id;
      RETURN;
    END IF;
  END IF;

  -- THE DIARY WRITE, now in the same transaction as the custody move. One
  -- row, keyed on the primary key, so it can never match more than one.
  -- The table carries no updated_at column and no timestamp trigger, so
  -- responded_at is set by hand here -- unlike role, status and state
  -- elsewhere in this file, where update_updated_at() would overwrite it.
  -- Section (i)'s BEFORE UPDATE guard fires on this statement and admits it
  -- because OLD.state was revalidated as `offered` above.
  UPDATE public.workspace_custody_transfers
     SET state        = v_new_state,
         responded_at = now()
   WHERE id = v_transfer.id;

  -- (5) AUDIT, IN THE SAME TRANSACTION -- when there is a workspace to
  --     audit against. target_id is the TRANSFER ROW's own id, which
  --     migration 197's deferred constraint trigger matches on; any other
  --     value fails the whole transaction at COMMIT. `changes` carries the
  --     project id and the two party ids and nothing else -- no restricted
  --     PII, and no key migration 197 section (f)'s guard refuses (WSR-19).
  IF v_transfer.workspace_id IS NOT NULL THEN
    INSERT INTO public.workspace_audit_log (
      workspace_id, actor_user_id, subject_member_id,
      action, permission_relied_on, target_type, target_id, changes
    ) VALUES (
      v_transfer.workspace_id, p_actor_id, v_subject_id,
      v_action_name, NULL, 'workspace_custody_transfer', v_transfer.id,
      jsonb_build_object(
        'projectId',  v_transfer.project_id,
        'fromUserId', v_transfer.from_user_id,
        'toUserId',   v_transfer.to_user_id
      )
    )
    RETURNING id INTO v_audit_id;
  END IF;

  RETURN QUERY SELECT 'ok'::TEXT, v_transfer.id, v_transfer.project_id, v_audit_id;
END;
$$;

-- Migration 123's grant posture, NOT migration 046's.
REVOKE EXECUTE ON FUNCTION public.workspace_accept_custody_transfer(
  UUID, UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_accept_custody_transfer(
  UUID, UUID, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.workspace_accept_custody_transfer(
  UUID, UUID, TEXT, TEXT
) IS
  'Resolves ONE two-sided record-custody offer -- accept, decline or withdraw -- and moves the diary row, the custody itself and the audit row in ONE transaction (R-06/WSR-09/F9). WHAT F9 WAS: app/api/vault/custody-transfers/route.ts PATCH ran THREE separate transactions -- read the transfer, CAS it to accepted, then call transfer_vault_project_custody -- and a crash or a concurrent transfer between the last two left the diary saying accepted while custody never moved. ONE function with a p_action parameter rather than three, so the diary write is atomic on every path and the CAS, the authority rule and the audit row exist once instead of three times drifting apart. LOCK RANKS, IN ORDER: rank 7 public.workspace_custody_transfers, then rank 8 public.vault_projects, both FOR NO KEY UPDATE (LO-2), the rank-8 lock taken on ALL THREE actions so two concurrent responses can never interleave into two different orders. Rank 9 public.workspace_audit_log is INSERT only and never locked. REVALIDATED AFTER THE LOCK: the transfer exists; the project exists; THE COMPARE-AND-SET of p_expected_state against the LOCKED row; the terminal-state check, which replaces the route''s `.eq(''state'', ''offered'')` -- until now the ONLY double-resolve protection in the system, because this table has never carried an UPDATE guard; AUTHORITY, copying assertMayRespond exactly -- only to_user_id may accept or decline, only offered_by or from_user_id may withdraw, AND THE OFFERER MAY NEVER ALSO ACCEPT, which is the F1 attack shape refused here, again by assertMayRespond at the route and a third time by migration 187''s INSERT guard at offer time; and, on accept, the STALE-CUSTODIAN pre-check against the locked vault_projects row, the P0 hotfix''s check now inside the same transaction as the write, which is the whole of what F9''s residual window was. IT CALLS public.transfer_vault_project_custody() AND NEVER WRITES vault_projects.user_id ITSELF: migrations 190 and 196 exempt current_user IN (postgres), which is true inside ANY postgres-owned definer function including this one, so a raw UPDATE here WOULD work -- and that is precisely why it must not be written. One sanctioned write path, kept literally true; the nested definer call runs in the same transaction so atomicity is preserved, and the double filter and the NULL-return stale-custodian semantics come along for free. THE CUSTODY MOVE IS ISSUED BEFORE THE DIARY UPDATE, deliberately: a NULL return reported as an outcome code RETURNS, and a RETURN COMMITS, so doing it first means that branch has mutated nothing rather than committing the split-brain this function closes. LO-1 is unaffected -- both locks are already held, so neither write acquires anything new. TRIGGERS THAT FIRE ON THE NESTED UPDATE: guard_owner_immutable (migration 139, exempted for vault_projects by 196) FIRST by alphabetical trigger name, then trg_guard_vault_projects_user_id_immutable (190); BOTH must admit it, and that pair is exactly what broke custody transfer in production until 196, so plan 17''s behavioural run is the proof, not this file''s text-lock suite. THE D-56 KILL SWITCH IS DELIBERATELY NOT CONSULTED: custody is a Member act, the route has carried zero workspace-derived authority since the F1 fix, and workspace_custody_transfers.workspace_id is NULLABLE because a transfer may be offered outside any workspace at all. THE AUDIT ROW IS WRITTEN WHENEVER workspace_id IS NOT NULL, matching the route''s existing condition, because workspace_audit_log.workspace_id is NOT NULL and no audit row can exist for a transfer with no workspace; the re-scoped constraint trigger below section (i) makes migration 197''s deferred assertion agree, so the two cannot contradict. target_id is the TRANSFER ROW''S OWN id. OUTCOME VOCABULARY the route must map: ok, not_found, stale, already_resolved, forbidden, stale_custodian. forbidden is an AUTHORITY refusal and is audited before returning its code, never raised, because a RAISE would roll that row back (R-26). Granted to service_role only.';


-- ─── (i) public.guard_custody_transfer_transition — the terminal-state ────
--         guard workspace_custody_transfers has NEVER had, plus the
--         re-scoped custody audit assertion that agrees with section (h).
--
-- WHY THIS TRIGGER LIVES IN 198 AND NOT IN 197. It is the DATABASE TWIN of
-- the CAS section (h) internalises, and the two should be read together:
-- section (h) refuses a non-`offered` transfer with an outcome code where
-- the lock is held, and this refuses the same write at the table, for every
-- writer, including one that never goes through the RPC. Migration 197
-- installs precisely this shape on its own ownership-transfer table and
-- says in its own header that workspace_custody_transfers conspicuously
-- lacks it and that plan 11 adds it. This is plan 11.
--
-- WHAT IT CLOSES. Until now the ONLY thing preventing a double-resolve of a
-- custody offer was the route's `.eq('state', 'offered')` filter -- an
-- application-layer condition in a flow that spanned three transactions.
-- That is the last route-only invariant in the custody flow, and after this
-- it is a database one. service_role carries BYPASSRLS, so an RLS policy
-- would be inert against the only role that can write this table; triggers
-- bind it. Same reasoning migration 197 gives for its own guard.
--
-- Shape copied from migration 197's guard_ownership_transfer_transition,
-- which itself mirrors migration 195's
-- workspace_permission_request_transition_guard. A CHECK constraint cannot
-- express any of this, because every rule compares OLD against NEW -- the
-- mechanism correction R-17 recorded for migration 190's trigger.
--
-- TRIGGER FIRING ORDER ON THIS TABLE. On BEFORE UPDATE this is the only row
-- trigger: the table carries no updated_at column and therefore no
-- timestamp trigger, and migration 187's
-- guard_custody_transfer_offered_by_holder is BEFORE INSERT only.
--
-- IS DISTINCT FROM on the identity comparison, not `<>`: workspace_id is
-- NULLABLE on this table, and `NULL <> NULL` is NULL, which an IF treats as
-- false -- so a plain inequality would silently permit the one identity
-- change involving the one nullable column. Fail closed on purpose.
CREATE OR REPLACE FUNCTION public.guard_custody_transfer_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.state <> 'offered' THEN
    RAISE EXCEPTION 'a record custody offer in state % is terminal and cannot be changed -- make a new offer instead (D-29)', OLD.state
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.state NOT IN ('accepted', 'declined', 'withdrawn') THEN
    RAISE EXCEPTION 'a record custody offer leaves state ''offered'' only as accepted, declined or withdrawn -- got %', NEW.state
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.project_id      IS DISTINCT FROM OLD.project_id
     OR NEW.from_user_id IS DISTINCT FROM OLD.from_user_id
     OR NEW.to_user_id   IS DISTINCT FROM OLD.to_user_id
     OR NEW.offered_by   IS DISTINCT FROM OLD.offered_by
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'the subject of a record custody offer is immutable -- make a new offer instead (D-29)'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-internal only: clients never call this directly, and the trigger
-- fires regardless of caller EXECUTE. Matches the guard-function posture of
-- migrations 070, 126, 139, 187, 190, 196 and 197.
REVOKE EXECUTE ON FUNCTION public.guard_custody_transfer_transition()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_custody_transfer_transition ON public.workspace_custody_transfers;
CREATE TRIGGER guard_custody_transfer_transition
  BEFORE UPDATE ON public.workspace_custody_transfers
  FOR EACH ROW EXECUTE FUNCTION public.guard_custody_transfer_transition();

COMMENT ON FUNCTION public.guard_custody_transfer_transition() IS
  'BEFORE UPDATE on workspace_custody_transfers. All three non-offered states are terminal, the three legal exits are accepted, declined and withdrawn, and the five identity columns -- project_id, from_user_id, to_user_id, offered_by, workspace_id -- are immutable. The database twin of the compare-and-set migration 198 section (h) internalises: until this trigger existed the ONLY thing preventing a double-resolve of a custody offer was the route''s `.eq(''state'', ''offered'')` filter, in a flow spanning three separate transactions (finding F9). service_role carries BYPASSRLS so an RLS policy would be inert against the only role that writes this table; triggers bind it. Mirrors migration 197''s guard_ownership_transfer_transition, which mirrors migration 195''s workspace_permission_request_transition_guard. IS DISTINCT FROM rather than <> on the identity comparison because workspace_id is nullable and NULL <> NULL is NULL, which an IF treats as false.';

-- ─── The re-scoped custody audit assertion — see section (h)'s stated ─────
--     choice about the nullable workspace_id.
--
-- READ THIS BEFORE CHANGING IT. Migration 197 installs
-- assert_workspace_custody_transfer_change_audited as an unconditional
-- AFTER UPDATE OF state deferred constraint trigger demanding an audit row
-- at COMMIT. But workspace_audit_log.workspace_id is NOT NULL (migration
-- 182) while workspace_custody_transfers.workspace_id is NULLABLE
-- (migration 185, deliberately -- a transfer may be offered outside any
-- workspace context). For such a transfer NO audit row can be written at
-- all, so the unconditional form makes every direct Member-to-Member
-- custody accept, decline and withdraw abort at COMMIT -- the CURRENT route
-- included, not only the RPC that replaces it.
--
-- The trigger is therefore RE-CREATED HERE, under its own name, with a WHEN
-- clause scoping it to rows that HAVE a workspace. Nothing else about it
-- changes: same function, same column scope, same AFTER UPDATE OF state,
-- same DEFERRABLE INITIALLY DEFERRED, same table, same name. This is
-- migration 197's own stated discipline carried one step further -- it
-- column-scoped this family of triggers because a constraint that fires on
-- writes nobody considers consequential is one that gets disabled rather
-- than one that gets satisfied, and a constraint that demands a row the
-- schema makes impossible to write is not strict, it is unsatisfiable.
--
-- 198 IS APPLIED AFTER 197, IN THE SAME PUSH WINDOW, so this re-creation
-- lands second and wins. MIGRATION 197 IS NOT EDITED: this is the same
-- later-migration-adjusts-an-earlier-object pattern migration 196 used on
-- migration 139's guard, and for the same reason -- churning an authored,
-- reviewed, text-locked file is higher risk than adjusting its object from
-- the file that discovered the problem. It is the FIRST item at plan 11's
-- owner checkpoint.
--
-- WHAT IS AND IS NOT GIVEN UP. The three OTHER assertion triggers migration
-- 197 installs are untouched and stay unconditional. For custody, WSR-13's
-- guarantee now reads: every custody resolution that CAN be audited MUST
-- be. A non-workspace transfer is still written only through section (h),
-- still guarded by guard_custody_transfer_transition above, and still moves
-- custody only through the one sanctioned function.
DROP TRIGGER IF EXISTS assert_workspace_custody_transfer_change_audited
  ON public.workspace_custody_transfers;
CREATE CONSTRAINT TRIGGER assert_workspace_custody_transfer_change_audited
  AFTER UPDATE OF state ON public.workspace_custody_transfers
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.workspace_id IS NOT NULL)
  EXECUTE FUNCTION public.assert_workspace_change_is_audited();

-- ─── END OF FILE ──────────────────────────────────────────────────────────
-- `NOTIFY pgrst, 'reload schema';` MUST REMAIN THE LAST STATEMENT IN THIS
-- FILE. Plans 08, 10 and 11 append their sections ABOVE this line, never
-- below it. __tests__/migration-198.test.ts asserts it is last.
NOTIFY pgrst, 'reload schema';
