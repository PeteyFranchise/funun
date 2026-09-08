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
    SELECT m.id INTO v_successor_member_id
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
      jsonb_build_object('role', jsonb_build_object('before', 'member', 'after', 'owner'))
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


-- ─── END OF FILE ──────────────────────────────────────────────────────────
-- `NOTIFY pgrst, 'reload schema';` MUST REMAIN THE LAST STATEMENT IN THIS
-- FILE. Plans 08, 10 and 11 append their sections ABOVE this line, never
-- below it. __tests__/migration-198.test.ts asserts it is last.
NOTIFY pgrst, 'reload schema';
