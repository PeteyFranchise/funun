---
phase: 38-member-organization-team-workspaces
plan: 03
subsystem: database
tags: [supabase, postgres, rls, migration, security-definer, workspaces]

# Dependency graph
requires: ["38-01"]
provides:
  - "supabase/migrations/182_workspaces_foundation.sql — public.workspaces, workspace_members, workspace_invitations, workspace_audit_log with RLS, write lockdown, the workspace_member_role/is_workspace_owner SECURITY DEFINER helper pair, and the never-zero-owners BEFORE trigger"
  - "__tests__/migration-182.test.ts — the paired string-assertion test locking the migration's shape, CHECK-constraint agreement with lib/workspaces/types.ts, and the scalar-subselect wrapping discipline"
affects: [38-04, 38-08, 38-10, 38-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER helper pair (uid-as-parameter, STABLE, SET search_path = '') — the 018→064→078→136 recursion-avoidance pattern, reapplied for workspaces"
    - "Guest-list write lockdown — REVOKE INSERT, UPDATE, DELETE ... FROM authenticated, anon on every new membership/invitation/audit table"
    - "Append-only audit table — additional REVOKE UPDATE, DELETE ... FROM PUBLIC on top of the standard lockdown"
    - "Migration-content string-assertion test built FROM TypeScript *_VALUES arrays, not restated literals"

key-files:
  created:
    - supabase/migrations/182_workspaces_foundation.sql
    - __tests__/migration-182.test.ts
  modified: []

key-decisions:
  - "RAISE EXCEPTION text in guard_workspace_never_zero_owners is the literal 'a workspace must always retain at least one owner' — taken verbatim from 38-PATTERNS.md's own worked example for this exact trigger. This is a CROSS-WORKTREE COORDINATION POINT: lib/workspaces/membership.ts (plan 38-02, a sibling wave-2 plan running in a separate git worktree) was not present in this worktree at execution time, so WORKSPACE_OWNER_FLOOR_MESSAGE's actual exported text could not be read directly. See 'Known Blocker — Cross-Plan Verification Pending' below."
  - "workspace_member_role() and is_workspace_owner() only ever match ACTIVE memberships (status = 'active'), so a suspended or removed member's stale role can never leak into an owner/admin check — this is stricter than 078's project_member_role(), which has no status column to filter on, and was a deliberate addition given workspace_members has one"
  - "workspace_invitations gets no SELECT-by-invited-address policy; the plan's own action block calls this out explicitly (binding happens service-side in plan 38-06) and the migration test asserts no auth.email()/auth.jwt() reference exists in that policy"
  - "workspace_audit_log ships RLS-enabled with ZERO SELECT policy in this migration (denies all authenticated/anon SELECT by construction) — the both-sides-visible read policy D-50 requires lands in migration 186 alongside the helper family it needs, per the plan's planner decision 3"

patterns-established:
  - "Every new workspace table in this phase inherits: RLS enabled, INSERT/UPDATE/DELETE revoked from authenticated+anon, and any cross-table visibility resolved through a SECURITY DEFINER helper wrapped as (SELECT public.helper(...)) in every policy body — never a bare EXISTS"

requirements-completed: [WS-01, WS-02, WS-03, WS-04, WS-25]

coverage:
  - id: D1
    description: "workspaces, workspace_members, workspace_invitations, workspace_audit_log exist with RLS enabled and no client write path"
    requirement: "WS-01"
    verification:
      - kind: unit
        ref: "__tests__/migration-182.test.ts — 'all four tables exist with row level security and gen_random_uuid() defaults', 'four-table write lockdown'"
        status: pass
    human_judgment: false
  - id: D2
    description: "A workspace is born unverified; verification_state is a separate auditable state, never a creation default"
    requirement: "WS-02"
    verification:
      - kind: unit
        ref: "__tests__/migration-182.test.ts — 'a workspace is born unverified (D-04)'"
        status: pass
    human_judgment: false
  - id: D3
    description: "Five-role/five-state workspace_members with a database-enforced never-zero-owners floor"
    requirement: "WS-03"
    verification:
      - kind: unit
        ref: "__tests__/migration-182.test.ts — 'the owner floor is enforced by the database (D-13)'"
        status: pass
    human_judgment: false
  - id: D4
    description: "workspace_invitations pending-seat table with service-side-only binding"
    requirement: "WS-04"
    verification:
      - kind: unit
        ref: "__tests__/migration-182.test.ts — 'non-recursive SELECT policies' > 'workspace_invitations_select is owner/admin only, never the invited address'"
        status: pass
    human_judgment: false
  - id: D5
    description: "workspace_audit_log carries both actor_user_id and subject_member_id (D-22 dual identity) and is append-only for every role"
    requirement: "WS-25"
    verification:
      - kind: unit
        ref: "__tests__/migration-182.test.ts — 'workspace_audit_log carries both actor and subject identity (D-22)', 'additionally revokes UPDATE/DELETE on workspace_audit_log from PUBLIC'"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-09-06
status: complete
---

# Phase 38 Plan 03: Migration 182 — Workspaces Foundation Summary

**Migration 182 ships the four Slice A tables (`workspaces`, `workspace_members`, `workspace_invitations`, `workspace_audit_log`), the `workspace_member_role`/`is_workspace_owner` SECURITY DEFINER helper pair, a four-table write lockdown, three non-recursive SELECT policies, and a database-enforced never-zero-owners trigger — authored and text-tested, awaiting the owner's `supabase db push`.**

## Performance

- **Duration:** ~25 min (research + authoring + test-writing + cross-worktree verification workaround)
- **Tasks:** 2 of 3 (Task 3 is the blocking human checkpoint, correctly not executed)
- **Files modified:** 2 (both new)

## Accomplishments

- `supabase/migrations/182_workspaces_foundation.sql` — four new tables, each RLS-enabled with the guest-list write lockdown (078/136 posture); the audit log additionally revokes UPDATE/DELETE from PUBLIC so it is append-only for every role, not just authenticated/anon
- `public.workspace_member_role()` / `public.is_workspace_owner()` — the SECURITY DEFINER helper pair, uid-as-parameter, `STABLE`, `SET search_path = ''`, filtered to `status = 'active'` memberships only, matching 078/136's proven recursion-avoidance shape
- `public.guard_workspace_never_zero_owners()` — a `BEFORE DELETE OR UPDATE` trigger on `workspace_members` generalizing migration 172's owner-only-graduation guard shape; raises `insufficient_privilege` when a delete or a role/status change would leave a workspace with zero active owners
- `__tests__/migration-182.test.ts` — 55 tests (verified locally via a stubbed sibling import, see below) asserting table shape, CHECK-constraint agreement with `lib/workspaces/types.ts`'s `*_VALUES` arrays, the write lockdown, helper-pair shape, scalar-subselect wrapping structurally (following migration 136's technique), the owner-floor message and ERRCODE, D-22's dual-identity columns, and a battery of negative assertions (no `handle_new_user`, no `uuid_generate_v4`, no `DISABLE ROW LEVEL SECURITY`, no touch to `vault_projects`, no redefinition of `find_auth_user_id_by_email`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Author migration 182 — workspaces, members, invitations, audit log, helper pair** - `97e34cfa` (feat)
2. **Task 2: Paired string-assertion test for migration 182** - `ef17e78a` (test)
3. **Task 3: [BLOCKING] Owner reviews and pushes migration 182** - NOT EXECUTED, per this plan's explicit instruction. See "Checkpoint" below.

**Plan metadata:** committed with this SUMMARY (worktree mode — orchestrator finalizes STATE.md/ROADMAP.md after merge)

## Files Created/Modified

- `supabase/migrations/182_workspaces_foundation.sql` — the four Slice A tables, write lockdown, helper pair, three SELECT policies, owner-floor trigger, schema-cache reload
- `__tests__/migration-182.test.ts` — the paired string-assertion test

## Decisions Made

- Used the literal owner-floor message `'a workspace must always retain at least one owner'` verbatim from `38-PATTERNS.md`'s own worked code example for `guard_workspace_never_zero_owners()`, since that is the most authoritative available source for text that plan 38-02's `lib/workspaces/membership.ts` must also export as `WORKSPACE_OWNER_FLOOR_MESSAGE` (see Known Blocker below).
- Restricted `workspace_member_role()`/`is_workspace_owner()` to `status = 'active'` rows — a deliberate strengthening over 078's `project_member_role()` (which has no status column), so a `suspended` or `removed` member's stale role row can never satisfy an owner/admin check in a policy.
- Left `workspace_audit_log` with zero SELECT policies in this migration (RLS-enabled + zero policy = deny-all by construction), per the plan's planner decision 3 — the both-sides-visible read policy needs migration 186's helper family and is explicitly out of scope here.
- Did not add a SELECT-by-invited-email policy on `workspace_invitations` — binding an invitation to its invitee is a service-route concern (plan 38-06), and the migration test asserts no `auth.email()`/`auth.jwt()` reference exists in that policy body.

## Deviations from Plan

### Auto-fixed Issues

None — Task 1 and Task 2 were executed exactly as the plan's `<action>` blocks specified.

## Known Blocker — Cross-Plan Verification Pending (read before the push checkpoint)

This plan runs as a **parallel executor in an isolated git worktree**, concurrently with sibling plan **38-02**, which owns `lib/workspaces/membership.ts`. That file — and the `WORKSPACE_OWNER_FLOOR_MESSAGE` constant it must export per 38-02's own plan text — **did not exist in this worktree at execution time** (38-02 was not yet merged, and this executor is explicitly forbidden from touching any file under `lib/workspaces/`, which it does not own).

Consequences:
- `__tests__/migration-182.test.ts` imports `WORKSPACE_OWNER_FLOOR_MESSAGE` from `@/lib/workspaces/membership`. **Inside this worktree, `npx tsc --noEmit` and `npx jest __tests__/migration-182.test.ts` both fail with "Cannot find module '@/lib/workspaces/membership'"** — this is the ONLY failure either command produces.
- To verify the test's own logic is otherwise correct, it was run against a local stub (`export const WORKSPACE_OWNER_FLOOR_MESSAGE = 'a workspace must always retain at least one owner'`) via a scratch `--moduleNameMapper` override (never committed, never touching `lib/workspaces/`). **All 55 tests passed against that stub.**
- The migration's own `RAISE EXCEPTION` text was authored as the same literal string, sourced from `38-PATTERNS.md`'s worked example for this exact trigger.

**Action required before the Task 3 push checkpoint can be safely approved:**
1. After this worktree and 38-02's worktree are both merged, run `npx tsc --noEmit` and `npx jest __tests__/migration-182.test.ts` for real (no stub) from the merged tree.
2. If `lib/workspaces/membership.ts`'s actual `WORKSPACE_OWNER_FLOOR_MESSAGE` text differs from `'a workspace must always retain at least one owner'`, **migration 182's `RAISE EXCEPTION` string must be edited to match it exactly**, in the same commit as whatever reconciles the two, before the owner pushes. Do not push migration 182 while the two strings disagree — the migration test would be asserting a false equality, and the DB/API/UI would say different things about the same rule (violating this plan's own `must_haves.truths`).
3. Re-run the full verification list in `<verification>` (jest, `tsc --noEmit`, and the migration-number-collision check) once merged.

This is a structural consequence of the wave-2 parallel schedule (38-02 and 38-03 both `depends_on: ["38-01"]` only, with no ordering between them) combined with 38-03's own plan text assuming `lib/workspaces/membership.ts` "plans 38-01, 38-02" would already be readable at authoring time. It is not a defect in either plan's authored content as far as could be verified in isolation.

## Issues Encountered

- The bash sandbox in this worktree refuses commands mixing paths across the worktree boundary in a single invocation (e.g. heredocs referencing both the worktree and `/private/tmp`), even for read-only verification. Worked around by using the `Write` tool for scratch files and single-path `Bash` invocations for execution — no functional impact on the deliverable.
- One JS/TS syntax slip in the test file (a SQL-style doubled single-quote `buyer_orgs''` inside a JS string literal, copied from SQL-comment habit) was caught by `npx tsc --noEmit` and fixed inline before the module-resolution blocker above was reached (Rule 1 — auto-fixed bug, no separate commit needed since it was fixed before Task 2's commit).

## User Setup Required

None for Tasks 1–2. Task 3 requires the owner's action — see "Checkpoint" below.

## Next Phase Readiness

- Migration 182's SQL and its paired test are both authored and structurally verified. They are NOT yet pushed to any database (correctly — this is a human-gated migration, executor agents never run `supabase db push`).
- Plans 38-04, 38-08, 38-10 and 38-11 all depend on migration 182 being live before their own migrations (183/184/185/186) can be pushed. Migration 182 must be reconciled against 38-02's actual `WORKSPACE_OWNER_FLOOR_MESSAGE` (see Known Blocker) and pushed before those plans' own checkpoints are approved.
- No stubs. No threat-surface additions beyond what this plan's own `<threat_model>` already registers — all eight threats (T-38-03-01 through T-38-03-08) are mitigated by the authored SQL and asserted by the migration test, except T-38-03-08 (package installs), which is accepted with no new package proposed.

## Self-Check: PASSED

Both created files verified present on disk:
- `FOUND: supabase/migrations/182_workspaces_foundation.sql`
- `FOUND: __tests__/migration-182.test.ts`

Both commit hashes verified present in `git log`:
- `FOUND: 97e34cfa`
- `FOUND: ef17e78a`

---

## CHECKPOINT REACHED

**Type:** human-verify (gate: blocking)
**Plan:** 38-03
**Progress:** 2/3 tasks complete (Task 3 is this checkpoint itself)

### Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Author migration 182 — workspaces, members, invitations, audit log, helper pair | `97e34cfa` | `supabase/migrations/182_workspaces_foundation.sql` |
| 2 | Paired string-assertion test for migration 182 | `ef17e78a` | `__tests__/migration-182.test.ts` |

### Current Task

**Task 3:** [BLOCKING] Owner reviews and pushes migration 182
**Status:** awaiting owner action — NOT executed by this agent, per the plan's explicit `<CRITICAL_DO_NOT_PUSH>` instruction
**Blocked by:** requires the project owner's `supabase db push`; also see "Known Blocker — Cross-Plan Verification Pending" above, which must be resolved first

### Checkpoint Details

`supabase/migrations/182_workspaces_foundation.sql` creates four new tables (`workspaces`, `workspace_members`, `workspace_invitations`, `workspace_audit_log`), a four-table write lockdown, an append-only audit log, the `workspace_member_role` / `is_workspace_owner` SECURITY DEFINER helper pair, three non-recursive SELECT policies, and the never-zero-owners BEFORE trigger. The paired string-assertion test `__tests__/migration-182.test.ts` was verified locally against a stub for the one cross-worktree import it needs (see Known Blocker) and passed all 55 assertions. The migration is additive only — it creates nothing on, and alters nothing about, any pre-existing table.

**How to verify (owner steps — an executor agent must NEVER run `supabase db push`):**

0. **First**, resolve the Known Blocker above: confirm `lib/workspaces/membership.ts`'s actual `WORKSPACE_OWNER_FLOOR_MESSAGE` text matches this migration's `RAISE EXCEPTION` string exactly (`'a workspace must always retain at least one owner'`). Edit whichever side is wrong before proceeding. Then run `npx tsc --noEmit` and `npx jest __tests__/migration-182.test.ts` for real (no stub) and confirm both are green.
1. Read `supabase/migrations/182_workspaces_foundation.sql` end to end.
2. Confirm `supabase migration list` shows LOCAL = REMOTE through **181** before pushing.
3. Run `supabase db push`.
4. Run `supabase migration list` again and confirm LOCAL = REMOTE through **182**.
5. Confirm the PostgREST schema cache reloaded: an authenticated query against `workspaces` returns an empty array rather than a schema-cache "table not found" error.
6. Smoke the owner floor directly in SQL: insert a workspace and a single `owner` + `active` membership row via the service role, then attempt to delete that row. It must fail with the never-zero-owners message. Insert a second owner, retry the delete, and confirm it now succeeds.
7. Confirm no existing behavior changed: open the personal Sound Vault, a Writer's Room and the Contract Locker and confirm each loads exactly as before.

The owner may batch this push with migration 183 (plan 38-04) at a single checkpoint — both are additive-only and neither touches an existing policy. Migration 186 must NOT be batched with them.

### Awaiting

The project owner's review of `supabase/migrations/182_workspaces_foundation.sql`, resolution of the cross-worktree `WORKSPACE_OWNER_FLOOR_MESSAGE` reconciliation, and the `supabase db push` + verification steps above. Type "approved" once `supabase migration list` shows 182 live and the owner-floor smoke passed, or describe what failed.

---
*Phase: 38-member-organization-team-workspaces*
*Completed: 2026-09-06*
