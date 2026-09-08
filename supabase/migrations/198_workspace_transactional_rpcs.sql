-- ============================================================
-- Funūn — Phase 38.0.2 (workspace-transactional-integrity-hygiene): Plan 06.
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
--   (h) public.workspace_accept_custody_transfer
--       + public.guard_custody_transfer_transition          plan 11
--
-- **THIS FILE IS INCOMPLETE AS OF PLAN 06.** Sections (c) through (h) do
-- not exist yet. Plans 08, 10 and 11 APPEND to this file, in that order,
-- and plan 11 closes it and carries the owner review checkpoint. Do not
-- review this file as a finished artifact before plan 11, and do not push
-- it in any state before then. Every appended section is stamped from
-- section (a) and obeys LO-1 through LO-4, R-26 and R-21 below.
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
--   | workspace_custody_transfers    | (no UPDATE guard today; (h) adds)  | —                   |
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


-- ─── END OF FILE ──────────────────────────────────────────────────────────
-- `NOTIFY pgrst, 'reload schema';` MUST REMAIN THE LAST STATEMENT IN THIS
-- FILE. Plans 08, 10 and 11 append their sections ABOVE this line, never
-- below it. __tests__/migration-198.test.ts asserts it is last.
NOTIFY pgrst, 'reload schema';
