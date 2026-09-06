---
phase: 38-member-organization-team-workspaces
plan: 04
subsystem: database
tags: [supabase, postgres, rls, migration, security-definer, workspaces, roster]

# Dependency graph
requires: ["38-02", "38-03"]
provides:
  - "supabase/migrations/183_workspace_roster_relationships.sql — public.workspace_roster_relationships, workspace_agreement_evidence, workspace_roster_blocks with RLS, write lockdown, the workspace_roster_relationship_is_live/workspace_agreement_evidence_visible SECURITY DEFINER helper pair, and three non-recursive SELECT policies"
  - "__tests__/migration-183.test.ts — the paired string-assertion test locking the migration's shape, CHECK-constraint agreement with lib/workspaces/types.ts, and the scalar-subselect wrapping discipline"
affects: [38-05, 38-06, 38-07, 38-08, 38-10, 38-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER helper pair (identifier-as-parameter, STABLE, SET search_path = '') — reapplied from migration 182 for the roster relationship liveness predicate and the cross-table evidence-visibility predicate"
    - "Compute-on-read authority tier — no stored 'document_supported' column, no scheduled job; expiry lapses authority on the next query (D-16, D-39)"
    - "Guest-list write lockdown — REVOKE INSERT, UPDATE, DELETE ... FROM authenticated, anon on every new table"
    - "Member-private policy — a policy that references only the subject's own auth.uid(), with no workspace-role call, so the workspace side gets no read path at all (D-51)"

key-files:
  created:
    - supabase/migrations/183_workspace_roster_relationships.sql
    - __tests__/migration-183.test.ts
  modified: []

key-decisions:
  - "professional_role is a nullable free-text column with no CHECK constraint and no read path into any authorization check in this migration — matches D-35's 'no schema fork' requirement and the plan's explicit instruction that the column never affects authorization."
  - "workspace_agreement_evidence_visible() is a NEW SECURITY DEFINER helper (not a reuse of migration 182's pair) because that table carries no workspace_id column of its own — its visibility check has to join relationship_id -> workspace_roster_relationships -> workspace_id, and the plan's action block explicitly calls for routing that join through a dedicated helper rather than a bare cross-table EXISTS in the policy body."
  - "The D-37 forbidden-vocabulary explanation (naming 'document_supported', 'verified', 'approved' in plain words) lives entirely in `--`-prefixed line comments, never inside a `COMMENT ON TABLE`/`COMMENT ON FUNCTION` SQL statement — the migration test's comment-stripping only removes `--` lines, so a SQL-statement-level comment would have leaked those forbidden words into the executable-SQL check that Task 1's own verify script and Task 2's D-37 test both run. Read the plan's `<!-- planner-discipline-allow -->` markers as authorizing prose in `--` comments specifically, not as license to put judgement words inside any SQL string literal."
  - "workspace_roster_relationship_is_live()'s date-window check (`terminates_on IS NULL OR terminates_on > CURRENT_DATE`) is strict-greater-than, matching lib/workspaces/roster.ts's isWorkspaceAccessLive(), where a terminates_on equal to today's date is already treated as ended (the JS comparison is `now >= end` with `end` resolving to midnight of terminates_on) — verified by reading roster.ts directly rather than assuming a boundary."

requirements-completed: [WS-05, WS-06, WS-26]

coverage:
  - id: D1
    description: "A roster relationship row can exist naming a Member who has never seen it, and that row grants nothing until accepted"
    requirement: "WS-05"
    verification:
      - kind: unit
        ref: "__tests__/migration-183.test.ts — 'the named Member sees their own claim; workspace-side reads require an active role (D-05)'"
        status: pass
    human_judgment: true
    human_judgment_note: "Full two-account inertness smoke (Account A cannot see Account B's projects/tracks/documents while proposed) is the owner's Task 3 checkpoint step 6, deferred to the batched 183-185 push."
  - id: D2
    description: "A Member may hold live roster relationships with any number of workspaces — no uniqueness constraint spans workspaces"
    requirement: "WS-05"
    verification:
      - kind: unit
        ref: "__tests__/migration-183.test.ts — 'a Member may hold roster relationships across any number of workspaces (D-15)'"
        status: pass
    human_judgment: false
  - id: D3
    description: "Agreement evidence carries a rights-holder-declared scope and an optional expiry; no column asserts Funūn validated the document"
    requirement: "WS-06"
    verification:
      - kind: unit
        ref: "__tests__/migration-183.test.ts — 'authority lapse is compute-on-read, never a stored state or a cron job (D-16, D-39)', 'no column, default, or identifier claims Funūn validated a document (D-37)'"
        status: pass
    human_judgment: false
  - id: D4
    description: "A block row prevents the same workspace re-proposing the same Member; blocks are member-private"
    requirement: "WS-26"
    verification:
      - kind: unit
        ref: "__tests__/migration-183.test.ts — 'workspace_roster_blocks_select never lets a workspace enumerate who blocked it (D-51)'"
        status: pass
    human_judgment: false
  - id: D5
    description: "The stored relationship state column holds exactly five lifecycle values; document-supported is not one of them"
    requirement: "WS-05"
    verification:
      - kind: unit
        ref: "__tests__/migration-183.test.ts — 'workspace_roster_relationships.state matches ROSTER_RELATIONSHIP_STATE_VALUES'"
        status: pass
    human_judgment: false

# Metrics
duration: 35min
completed: 2026-09-05
status: complete
---

# Phase 38 Plan 04: Migration 183 — Workspace Roster Relationships Summary

**Migration 183 ships Slice B's storage — `workspace_roster_relationships` (inert on creation, date-windowed, unilaterally endable), `workspace_agreement_evidence` (the declared-scope, compute-on-read evidence ladder), and `workspace_roster_blocks` (the member-side refusal that sticks) — plus the `workspace_roster_relationship_is_live` SECURITY DEFINER predicate migration 186 will join through, authored and text-tested, awaiting the batched 183–185 owner push.**

## Performance

- **Duration:** ~35 min (context reading — types.ts, roster.ts, evidence.ts, CONTEXT.md, PATTERNS.md correction block, migration 182, migration 136, migration-182 test — plus authoring and verification)
- **Tasks:** 2 of 3 (Task 3 is the blocking human checkpoint, correctly not executed)
- **Files modified:** 2 (both new)

## Accomplishments

- `supabase/migrations/183_workspace_roster_relationships.sql` — three new tables, each RLS-enabled with the guest-list write lockdown (078/136/182 posture):
  - `workspace_roster_relationships`: born `proposed` (D-05), a partial unique index on `(workspace_id, member_user_id) WHERE state IN ('proposed', 'accepted')` so multiplicity across workspaces is structurally unconstrained (D-15), a `CHECK` guaranteeing `terminates_on > effective_from` when both are set, and a `BEFORE UPDATE` trigger wired to the existing `public.update_updated_at()`.
  - `workspace_agreement_evidence`: `declared_scope NOT NULL`, `expires_at`/`superseded_at` for the compute-on-read authority-lapse ladder, `witnessed_by_signature` as the sole observation column — no stored validated-status column anywhere (D-36, D-37, D-39).
  - `workspace_roster_blocks`: a member-private `UNIQUE (workspace_id, member_user_id)` list (D-51).
- `public.workspace_roster_relationship_is_live(uuid, uuid)` — the SQL twin of `isWorkspaceAccessLive` in `lib/workspaces/roster.ts`; true only for an `accepted` row inside its open date window, evaluated per-query with no cached column to go stale.
- `public.workspace_agreement_evidence_visible(uuid, uuid)` — a new SECURITY DEFINER helper (evidence has no `workspace_id` of its own) joining `relationship_id -> workspace_roster_relationships -> workspace_id`, avoiding the 018/064/078/136/182 recursion shape.
- Three non-recursive SELECT policies: the named Member always sees their own relationship row (D-05); evidence visibility routes through the new helper; blocks are visible only to the blocking Member, with no `workspace_member_role` reference at all (D-51, T-38-04-05).
- `__tests__/migration-183.test.ts` — 47 tests asserting table shape, the state `CHECK` built from `ROSTER_RELATIONSHIP_STATE_VALUES`, D-15 multiplicity, D-05 own-row visibility, D-16/D-39 compute-on-read (no `document_supported`, no scheduler), D-37 vocabulary (no `verified`/`approved` in comment-stripped SQL), the write lockdown, helper-pair shape, scalar-subselect wrapping, D-51 block privacy, and a battery of negative assertions (no touch to `project_members`, `work_members`, or any migration-182 table/function).

## Task Commits

Each task was committed atomically:

1. **Task 1: Author migration 183 — roster relationships, agreement evidence, blocks** - `dffca468` (feat)
2. **Task 2: Paired string-assertion test for migration 183** - `9dc2325c` (test)
3. **Task 3: [BLOCKING] Owner reviews and pushes migration 183** - NOT EXECUTED, per this plan's explicit `<CRITICAL_DO_NOT_PUSH>` instruction and the owner decision below.

**Plan metadata:** committed with this SUMMARY (worktree mode — orchestrator finalizes STATE.md/ROADMAP.md after merge)

## Files Created/Modified

- `supabase/migrations/183_workspace_roster_relationships.sql` — the three Slice B tables, write lockdown, helper pair, three SELECT policies, schema-cache reload
- `__tests__/migration-183.test.ts` — the paired string-assertion test

## Verification Performed

- `node -e ...` structural verify script from Task 1's `<verify>` block: **PASS** ("183 structure OK")
- `npx jest __tests__/migration-183.test.ts`: **PASS** — 47/47 tests
- `npx tsc --noEmit`: **PASS** — clean, no errors
- `ls supabase/migrations | grep -oE '^[0-9]+' | sort -n | uniq -d`: **PASS** — no collisions
- Manual grep confirmed `verified`/`approved`/`document_supported` are present in the raw file's `--` comments but absent from the comment-stripped executable SQL (the exact split the plan's discipline markers and the D-37 test both require).

## Cross-Worktree Verification (per this wave's hazard note)

Read the real shipped files rather than guessing any symbol owned by earlier plans:

- `lib/workspaces/types.ts` (38-01) — confirmed `ROSTER_RELATIONSHIP_STATE_VALUES` is exactly `['proposed', 'accepted', 'refused', 'blocked', 'ended']` (5 members, `document-supported` deliberately absent) and imported it directly into the test rather than restating the literals.
- `lib/workspaces/roster.ts` (38-02) — confirmed `isWorkspaceAccessLive`'s exact boundary semantics (`now >= end` treats a `terminates_on` equal to today as already ended) before writing the SQL predicate's `terminates_on > CURRENT_DATE` (strict), so the two are provably identical rather than assumed identical.
- `lib/workspaces/evidence.ts` (38-02) — confirmed `resolveAuthorityTier`'s exact evidence-qualification rules (non-empty `declaredScope`, unexpired, not superseded) before shaping `workspace_agreement_evidence`'s columns to supply exactly those facts.
- `supabase/migrations/182_workspaces_foundation.sql` and `__tests__/migration-182.test.ts` (38-03, LIVE) — read in full for header style, lockdown posture, helper-pair conventions, and the comment-stripping test technique this file's test reuses.
- No symbol was guessed or stubbed. Nothing was found missing that this plan depends on.

This plan does not own or touch anything under `lib/workspaces/` or `app/api/workspaces/` (38-05's territory) — no cross-worktree drift risk of the kind Wave 2's 38-03 encountered with `WORKSPACE_OWNER_FLOOR_MESSAGE`, because migration 183 introduces no new TypeScript-side constant that a sibling plan must also export byte-identically.

## Deviations from Plan

### Auto-fixed Issues

None — Task 1 and Task 2 were executed exactly as the plan's `<action>` blocks specified.

## Owner Decision Taken During Execution (2026-09-05)

Migrations 183, 184 and 185 are **batched into a single owner push sitting before Wave 6** (recorded in `.planning/ROADMAP.md` via commit `90e8e3c5`, "record batched push cadence for migrations 183-185"). Per that decision and this plan's explicit instruction, Task 3's push checkpoint is **not executed** here — it is deferred to that batched sitting, where the owner reviews 183, 184 and 185 together before running a single `supabase db push`. Migration 182 (plan 38-03) is confirmed **already live** (local matches remote through 182, per commit `57cd7b5c`, "migration 182 live, wave 2 closed").

## Known Blocker

None. Unlike plan 38-03's cross-worktree `WORKSPACE_OWNER_FLOOR_MESSAGE` situation, every TypeScript symbol this migration and its test depend on (`ROSTER_RELATIONSHIP_STATE_VALUES` from 38-01, `isWorkspaceAccessLive`/`resolveAuthorityTier`'s semantics from 38-02) was already present and readable in this worktree at execution time, and both `npx jest` and `npx tsc --noEmit` ran clean with no stubbing required.

## Issues Encountered

None beyond the routine worktree git-command-complexity guard, which was satisfied by running single-purpose `git` commands rather than compound shell expressions.

## User Setup Required

None for Tasks 1–2. Task 3 requires the owner's action at the batched 183–185 sitting — see "CHECKPOINT REACHED" below.

## Next Phase Readiness

- Migration 183's SQL and its paired test are both authored and structurally verified. They are NOT yet pushed to any database (correctly — this is a human-gated migration, executor agents never run `supabase db push`).
- Plans 38-06 and 38-07 (roster proposal/acceptance/block routes) and migration 186 (plan 38-11's three-hop RLS branch) both depend on migration 183 being live before their own work can be pushed or verified against a real database.
- No stubs. No threat-surface additions beyond what this plan's own `<threat_model>` already registers — all eight threats (T-38-04-01 through T-38-04-08) are mitigated by the authored SQL and asserted by the migration test, except T-38-04-08 (package installs), which is accepted with no new package proposed.

## Self-Check: PASSED

Both created files verified present on disk:
- `FOUND: supabase/migrations/183_workspace_roster_relationships.sql`
- `FOUND: __tests__/migration-183.test.ts`

Both commit hashes verified present in `git log`:
- `FOUND: dffca468`
- `FOUND: 9dc2325c`

---

## CHECKPOINT REACHED

**Type:** human-verify (gate: blocking)
**Plan:** 38-04
**Progress:** 2/3 tasks complete (Task 3 is this checkpoint itself)

### Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Author migration 183 — roster relationships, agreement evidence, blocks | `dffca468` | `supabase/migrations/183_workspace_roster_relationships.sql` |
| 2 | Paired string-assertion test for migration 183 | `9dc2325c` | `__tests__/migration-183.test.ts` |

### Current Task

**Task 3:** [BLOCKING] Owner reviews and pushes migration 183
**Status:** DEFERRED — not executed by this agent, per the plan's `<CRITICAL_DO_NOT_PUSH>` instruction and the owner's 2026-09-05 decision to batch 183, 184 and 185 into a single push sitting before Wave 6.
**Blocked by:** requires the project owner's `supabase db push`, performed once alongside migrations 184 and 185 at the batched sitting — not before.

### Checkpoint Details

`supabase/migrations/183_workspace_roster_relationships.sql` creates three new tables (`workspace_roster_relationships`, `workspace_agreement_evidence`, `workspace_roster_blocks`), a three-table write lockdown, two SECURITY DEFINER helpers (`workspace_roster_relationship_is_live`, `workspace_agreement_evidence_visible`) and three non-recursive SELECT policies. Paired test `__tests__/migration-183.test.ts` is green (47/47) against the real, already-shipped `lib/workspaces/types.ts`. Additive only — nothing pre-existing (including migration 182's four live tables and helper pair) is altered.

**What the owner will need to verify at the batched 183–185 sitting (for 183 specifically):**

1. Read `supabase/migrations/183_workspace_roster_relationships.sql` end to end.
2. Confirm `supabase migration list` shows LOCAL = REMOTE through **182** before pushing.
3. Run `supabase db push` (batched with 184 and 185 per the owner's own decision).
4. Confirm `supabase migration list` now shows LOCAL = REMOTE through **183** (and 184, 185).
5. Confirm the schema cache reloaded: an authenticated query against `workspace_roster_relationships` returns an empty array, not a schema-cache error.
6. **The D-05 inertness smoke, as two real accounts:** as the service role, insert a workspace owned by Account A and a `proposed` roster relationship naming Account B. Then, authenticated as Account A, confirm no query returns any of Account B's projects, tracks or documents. Then, authenticated as Account B, confirm the proposed relationship row **is** visible to them.
7. Confirm no existing behavior changed: personal Vault, Writer's Room and Contract Locker load as before.

Migration 186 must **not** be batched with 183–185 — it is the only file in this phase editing already-live RLS policies.

### Awaiting

The project owner's review of `supabase/migrations/183_workspace_roster_relationships.sql` at the batched 183–185 sitting, and the `supabase db push` + verification steps above. Type "approved" once `supabase migration list` shows 183 (with 184/185) live and the D-05 inertness smoke passed, or describe what failed.

---
*Phase: 38-member-organization-team-workspaces*
*Completed: 2026-09-05*
