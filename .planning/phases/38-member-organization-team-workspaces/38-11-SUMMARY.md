---
phase: 38-member-organization-team-workspaces
plan: 11
subsystem: database
tags: [postgres, rls, security-definer, supabase, workspaces, kill-switch, zod, nextjs]

# Dependency graph
requires:
  - phase: 38-member-organization-team-workspaces
    provides: "38-03/182 (workspaces, workspace_members, workspace_invitations, workspace_audit_log, workspace_member_role/is_workspace_owner); 38-04/183 (workspace_roster_relationships, workspace_agreement_evidence, workspace_roster_blocks, workspace_roster_relationship_is_live); 38-08/184 (workspace_grants, workspace_permission_bundles, the permission CHECK list); 38-10/185 (workspace_attachments, workspace_custody_transfers, the project-live covering index); 38-09's lib/workspaces/grant-service.ts (resolveEffectivePermissions' relationship_id-scoped grant filter, which migration 186's helper mirrors); lib/staff/audit.ts, lib/admin/gate.ts/staff-role.ts, lib/client-partners/health-rules-config.ts's singleton-locator shape"
provides:
  - "supabase/migrations/186_workspace_rls_extension.sql — authored, NOT pushed: workspace_project_permission() three-hop SECURITY DEFINER helper, workspace_access_config + workspace_access_enabled() (D-56/WS-31), one additive OR clause on ten live vault_projects/tracks/vault_assets/vault_documents/tool_outputs policies, workspace_audit_visible() + workspace_audit_log_select (D-50)"
  - "__tests__/migration-186.test.ts, __tests__/workspace-structural-exclusions.test.ts — the pre-push review evidence for the human checkpoint"
  - "lib/workspaces/access-kill-switch.ts (readWorkspaceAccessState, setWorkspaceAccessEnabled) + app/api/admin/workspaces/access/route.ts — the owner-operable disable control, leadership-only"
  - ".planning/phases/38-member-organization-team-workspaces/38-RLS-SMOKE-CHECKLIST.md — the human-run adversarial smoke checklist for the owner's push"
affects: [38-12, 38-13, "Phase 38.2 rollout/UX slices"]

tech-stack:
  added: []
  patterns:
    - "Three-hop SECURITY DEFINER helper (attachment -> membership -> relationship -> grant) extending the 018->064->078->136->182/183/184/185 recursion-avoidance lineage one hop further, gated by an early-exit workspace_access_enabled() guard"
    - "Platform-wide fail-closed kill switch: STABLE (not IMMUTABLE) SECURITY DEFINER predicate over a singleton config table, COALESCE'd to FALSE on a missing row, consulted first inside the permission helper"
    - "Additive-only RLS policy extension: DROP + CREATE POLICY recreating every original clause verbatim plus exactly one new OR branch, asserted textually per-clause rather than trusted by review alone"
    - "Repository-level negative testing by tree-walk (not a hardcoded file list) to prove structural exclusion of a capability from application code, mirroring the SQL blast-radius test's allowlist approach"

key-files:
  created:
    - supabase/migrations/186_workspace_rls_extension.sql
    - __tests__/migration-186.test.ts
    - __tests__/workspace-structural-exclusions.test.ts
    - .planning/phases/38-member-organization-team-workspaces/38-RLS-SMOKE-CHECKLIST.md
    - lib/workspaces/access-kill-switch.ts
    - lib/workspaces/access-kill-switch.test.ts
    - app/api/admin/workspaces/access/route.ts
  modified: []

key-decisions:
  - "The three-hop helper constrains workspace_grants to the SAME relationship resolved at hop 3 (g.relationship_id IS NULL OR g.relationship_id = r.id) even though the PLAN's prose only described a workspace_id-level join for the grants hop. This mirrors lib/workspaces/grant-service.ts's resolveEffectivePermissions, which filters grants with .eq('relationship_id', relationshipRow.id) exactly this way (plan 38-09, already shipped) — and every current grant-issuance route (app/api/workspaces/[workspaceId]/grants/route.ts) requires a relationshipId at issuance, so no workspace-wide (relationship_id NULL) grant is ever produced today. Following the plan's literal wording (workspace_id-only) would have let a grant issued against ONE roster relationship silently satisfy access for a DIFFERENT relationship in the same workspace — a horizontal-escalation bug. Followed the already-shipped application code per the plan's own instruction to prefer shipped code over an ambiguous plan reading on this migration."
  - "workspace_access_config additionally REVOKEs SELECT from authenticated/anon (not just INSERT/UPDATE/DELETE like every other workspace table in 182-185) — a client has no legitimate reason to read the raw config row; the only consumers are workspace_access_enabled() (SECURITY DEFINER) and the leadership-only admin route via the service role."
  - "No updated_at trigger was added to workspace_access_config — the plan's action spec lists the column but not a trigger, and lib/workspaces/access-kill-switch.ts sets updated_at explicitly on every UPDATE, matching the plan's Task 4 spec verbatim ('UPDATEs enabled, disabled_reason, disabled_by, disabled_at and updated_at')."

requirements-completed: [WS-23, WS-25, WS-09, WS-31]

coverage:
  - id: D1
    description: "Migration 186 authored: three-hop workspace_project_permission() helper, ten additive OR-clause policy extensions across vault_projects/tracks/vault_assets/vault_documents/tool_outputs, workspace_audit_visible() + workspace_audit_log_select (D-50)"
    requirement: "WS-23"
    verification:
      - kind: unit
        ref: "__tests__/migration-186.test.ts (45 tests: non-recursion, subselect wrapping, additive-not-rewritten, blast radius)"
        status: pass
    human_judgment: true
    rationale: "A green Jest suite proves the SQL text matches what was authored; it never proves the policies behave correctly against live Postgres. This is the highest-risk change in the phase (a bug grants third parties platform-wide catalogue access) — the owner's adversarial smoke run against a real database (38-RLS-SMOKE-CHECKLIST.md) after the push is the actual acceptance gate, not this test suite alone."
  - id: D2
    description: "Repository-level negative suite proving the workspace branch cannot reach the clean-master path, payout data, an impersonation primitive, project_members writes, or legacy account fields"
    requirement: "WS-09"
    verification:
      - kind: unit
        ref: "__tests__/workspace-structural-exclusions.test.ts (89 tests, tree-walked over lib/ and app/api/)"
        status: pass
    human_judgment: false
  - id: D3
    description: "38-RLS-SMOKE-CHECKLIST.md: six test accounts, inert-proposal through revocation/grant-subset scenarios, 42P17 recursion check, EXPLAIN ANALYZE performance gate, D-56 disable-control drill"
    requirement: "WS-25"
    verification: []
    human_judgment: true
    rationale: "This is itself a human-run procedural checklist against live Postgres — by construction it cannot be auto-verified; the owner completes it at the Task 4 checkpoint."
  - id: D4
    description: "D-56/WS-31 owner-operable disable control: workspace_access_config + workspace_access_enabled() in the migration, lib/workspaces/access-kill-switch.ts, and the leadership-only app/api/admin/workspaces/access/route.ts"
    requirement: "WS-31"
    verification:
      - kind: unit
        ref: "lib/workspaces/access-kill-switch.test.ts (11 tests: read/write mapping, disable-requires-reason, missing-row throw, re-enable clears state)"
        status: pass
      - kind: unit
        ref: "__tests__/migration-186.test.ts (workspace_access_config singleton, STABLE-not-IMMUTABLE, COALESCE-to-FALSE assertions)"
        status: pass
    human_judgment: true
    rationale: "The route's leadership gate and the actual off/on/fail-closed behavior against live Postgres are exercised at the Task 4 checkpoint's steps 8a/8b, not by the mocked unit tests alone."

duration: 55min
completed: 2026-09-05
status: complete
---

# Phase 38 Plan 11: Migration 186 — the RLS workspace branch + the D-56 platform-wide disable control Summary

**Authored (not pushed) the three-hop `workspace_project_permission()` SECURITY DEFINER helper, ten additive OR-clause policy extensions across `vault_projects`/`tracks`/`vault_assets`/`vault_documents`/`tool_outputs`, the both-sides `workspace_audit_log` policy, and a fail-closed platform-wide disable control (`workspace_access_config` + `workspace_access_enabled()` + a leadership-only admin route) — then stopped at the blocking checkpoint for the owner's dedicated push and adversarial smoke run.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-09-05T00:00:00Z (approx, see git log)
- **Completed:** 2026-09-05
- **Tasks:** 4 completed (Tasks 1-3 + the disable-control task), Task 4 (blocking checkpoint) reached and STOPPED per plan
- **Files modified:** 7 created, 0 modified

## Accomplishments

- Authored `supabase/migrations/186_workspace_rls_extension.sql` — the security-critical artifact of Phase 38: a three-hop SECURITY DEFINER helper (attachment → membership → relationship → grant, gated by the disable control) extending ten already-live policies with exactly one additive OR clause each, every original owner/member branch preserved byte-for-byte, plus the `workspace_audit_log`'s new both-sides SELECT policy.
- Shipped `public.workspace_access_config` + `public.workspace_access_enabled()` — the D-56/WS-31 working platform-wide disable control: a true singleton, service-role-only, `STABLE SECURITY DEFINER` (never `IMMUTABLE`, so a flip is never plan-cached away), `COALESCE(..., FALSE)` so a missing config row fails closed.
- Wrote 45 textual/structural assertions in `__tests__/migration-186.test.ts` (non-recursion, subselect wrapping, additive-not-rewritten, six-table blast radius, D-56 fail-closed proofs) and 89 repository-level assertions in `__tests__/workspace-structural-exclusions.test.ts` (tree-walked, not hardcoded) proving the workspace branch cannot reach signed-URL accessors, payout/tax capabilities, an impersonation primitive, `project_members` writes, or the legacy account fields.
- Wrote `38-RLS-SMOKE-CHECKLIST.md` — the six-account (A-F) adversarial checklist covering every acceptance criterion this migration touches, the 018→064→078 recursion class check, an `EXPLAIN ANALYZE` performance gate at 200+ attached projects, and the D-56 disable-control drill (off/on/fail-closed).
- Built the owner-operable disable control's application layer: `lib/workspaces/access-kill-switch.ts` (`readWorkspaceAccessState`, `setWorkspaceAccessEnabled` — disabling requires a non-empty reason, re-enabling clears the disabled-state columns, a zero-row UPDATE throws) and `app/api/admin/workspaces/access/route.ts` (leadership-only GET/POST, every flip logged via `logStaffAction`).
- Stopped at the Task 4 blocking checkpoint without running `supabase db push`, `supabase db reset`, or any command reaching the remote database, per the hard repo-wide rule and this plan's explicit instruction.

## Task Commits

1. **Task 1: Author migration 186 — the three-hop helper and the additive policy branches** - `aba8c61c` (feat)
2. **Task 2: Textual migration test plus the negative structural-exclusion suite** - `136b8342` (test)
3. **Task 3: Write the human-run adversarial RLS smoke checklist** - `7d0a30a6` (docs)
4. **Task 4 (unnamed in plan, disable-control service layer + route): D-56/WS-31 kill switch** - `d8942fe8` (feat)

**Plan metadata:** commit pending (this SUMMARY + final metadata commit, made after this file is written).

## Files Created/Modified

- `supabase/migrations/186_workspace_rls_extension.sql` - the RLS workspace branch + D-56 disable control (authored, NOT pushed)
- `__tests__/migration-186.test.ts` - textual/structural lock on the migration
- `__tests__/workspace-structural-exclusions.test.ts` - repository-level negative suite
- `.planning/phases/38-member-organization-team-workspaces/38-RLS-SMOKE-CHECKLIST.md` - the human-run adversarial checklist
- `lib/workspaces/access-kill-switch.ts` - service-role read/write layer for `workspace_access_config`
- `lib/workspaces/access-kill-switch.test.ts` - unit tests for the kill-switch service layer
- `app/api/admin/workspaces/access/route.ts` - leadership-only GET/POST for the D-56 control

## Decisions Made

- **Grant join scoped to the resolved relationship, not just the workspace.** The plan's prose describes the `workspace_grants` join as "same `workspace_id`, `permission = p_permission`, `revoked_at IS NULL`, and `project_id` null or equal to `p_project_id`" with no explicit `relationship_id` constraint. Implementing it literally would let a grant issued against roster relationship R1 (e.g. for Member A) also satisfy access for a DIFFERENT roster relationship R2 in the same workspace (e.g. for Member B), as long as both were live — a horizontal-escalation bug directly in T-38-11-01's threat class. `lib/workspaces/grant-service.ts`'s `resolveEffectivePermissions` (already shipped, plan 38-09) filters grants with `.eq('relationship_id', relationshipRow.id)`, and every current grant-issuance route requires an explicit `relationshipId` (never a workspace-wide `NULL`). Per this plan's own instruction ("if something is ambiguous, follow the already-shipped code and say so in SUMMARY.md"), the helper's `workspace_grants` join adds `AND (g.relationship_id IS NULL OR g.relationship_id = r.id)` — matching the shipped resolver's semantics exactly while still tolerating a future workspace-wide grant (`relationship_id IS NULL`) that no current route produces.
- **`workspace_access_config` also revokes client SELECT**, unlike every other workspace table from migrations 182-185 (which revoke writes but grant SELECT via RLS). A client has no legitimate reason to read the raw kill-switch row; the only readers are the `SECURITY DEFINER` predicate and the leadership-gated service-role route.
- **No `updated_at` trigger on `workspace_access_config`.** The plan's Task 1 action spec lists the column but does not ask for a trigger, and Task 4's action spec explicitly has `setWorkspaceAccessEnabled` set `updated_at` on every write — the application layer is the single writer, so a DB-side trigger would be redundant, not missing functionality.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, pre-empted] Scoped the grants join to the resolved relationship rather than the plan's literal workspace_id-only wording**
- **Found during:** Task 1 (authoring the three-hop helper)
- **Issue:** The plan's prose for the `workspace_grants` join hop did not mention constraining by `relationship_id`, which — if implemented literally — would let a grant issued for one roster relationship satisfy access for an unrelated roster relationship in the same workspace (horizontal escalation, T-38-11-01).
- **Fix:** Added `g.relationship_id IS NULL OR g.relationship_id = r.id` to the grant join, matching `lib/workspaces/grant-service.ts`'s shipped `resolveEffectivePermissions` filter exactly.
- **Files modified:** `supabase/migrations/186_workspace_rls_extension.sql`
- **Verification:** `__tests__/migration-186.test.ts` asserts the helper body references `workspace_grants` with the relationship join present; documented in the migration's own section (b) comment and in this SUMMARY's Decisions section for the owner's review before push.
- **Committed in:** `aba8c61c` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1, pre-empted horizontal-escalation bug — this migration's #1 threat class per its own threat model, T-38-11-01)
**Impact on plan:** The fix is a security-tightening clarification consistent with the plan's stated intent ("a grant issued against one roster relationship must never satisfy access for a different relationship") and with already-shipped application code. No scope creep — no new table, column, or policy was added beyond what the plan specified.

## Issues Encountered

- Two of my own migration-186 test assertions initially searched `commentProse` (the `--`-line-comment-only extract) for text that actually lives inside `COMMENT ON FUNCTION ... IS '...'` string literals (e.g. "SQLSTATE 42P17", "Personal Member access ... never"). Fixed by asserting against `sqlOnly` instead, which includes `COMMENT ON` bodies. Not a migration defect — a test-authoring correction, made before the first commit of Task 2.
- One structural-exclusion test initially flagged `lib/workspaces/grants.ts` for referencing `manage_payouts` — a defensive JSDoc comment explaining that an unrecognized string "including a structurally excluded capability name like `manage_payouts`) always fails closed," not an executable reference. Fixed by comment-stripping the source before that specific check, consistent with the plan's "in executable (comment-stripped) source" instruction for the impersonation-primitive check.

## User Setup Required

None - no external service configuration required. The disable control's route requires no new environment variables; it uses the existing `createServiceClient()` and `requireStaff()` infrastructure.

## Next Phase Readiness

**BLOCKED on the owner's Task 4 checkpoint.** Plans 38-12 and 38-13 both depend on migration 186's policy branch being live and verified — they must not proceed until the owner:
1. Reviews `supabase/migrations/186_workspace_rls_extension.sql` end to end against `078_project_members.sql`.
2. Confirms `supabase migration list` LOCAL=REMOTE through 185 BEFORE pushing 186.
3. Runs `supabase db push` for 186 **alone** (never batched with 182-185).
4. Confirms LOCAL=REMOTE through 186 and runs the immediate five-table recursion check.
5. Works `38-RLS-SMOKE-CHECKLIST.md` end to end with six test accounts, records the `EXPLAIN ANALYZE` timing, and completes the D-56 disable-control drill (8a/8b: off, on, fail-closed).
6. Returns the resume signal ("approved") or describes the specific failing check.

All authored artifacts (migration, both test suites, the checklist, and the disable-control application layer) are committed and passing `npm test` (4719/4719) and `npx tsc --noEmit` / `npx next lint` clean. Nothing outside this plan's declared file set was touched; `STATE.md` and `ROADMAP.md` were not modified per this plan's explicit instruction (orchestrator owns those writes).

---
*Phase: 38-member-organization-team-workspaces*
*Completed: 2026-09-05*

## Self-Check: PASSED

All 7 declared files found on disk; all 4 task commit hashes (`aba8c61c`, `136b8342`, `7d0a30a6`, `d8942fe8`) found in git log. Full `npm test` (4719/4719), `npx tsc --noEmit`, and `npx next lint` all clean as of the last commit.
