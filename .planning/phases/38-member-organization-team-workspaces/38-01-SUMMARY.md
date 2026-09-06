---
phase: 38-member-organization-team-workspaces
plan: 01
subsystem: auth
tags: [typescript, permissions, rbac, pure-functions, jest]

# Dependency graph
requires: []
provides:
  - "lib/workspaces/types.ts — the single source of truth for workspace vocabulary (type, role, membership state, verification state, roster relationship state, authority tier, invitation state, capability flags)"
  - "lib/workspaces/permissions.ts — the 19-permission catalogue, tier split, editable preset bundles, and the structural payout/tax exclusion"
  - "lib/workspaces/grants.ts — isSubsetGrant / filterGrantableByAuthority / assertGrantIsIssuable, the single grant-time-and-use-time subset check (D-49)"
affects: [38-02, 38-03, 38-04, 38-05, 38-06, 38-07, 38-08, 38-09, 38-10, 38-11, 38-12, 38-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure, zero-I/O const-map + resolver module (no @/lib/supabase import) — house convention from lib/client-partners/health.ts, lib/staff/scope.ts, lib/selects/stage-machine.ts"
    - "*_VALUES const array + derived union type + *_LABELS record — house convention from lib/vault/membership.ts, lib/selects/types.ts, lib/accounts/account-context.ts"
    - "Structural exclusion via a separate, non-member union rather than a permission defaulting to false"

key-files:
  created:
    - lib/workspaces/types.ts
    - lib/workspaces/permissions.ts
    - lib/workspaces/permissions.test.ts
    - lib/workspaces/grants.ts
    - lib/workspaces/grants.test.ts
  modified: []

key-decisions:
  - "manage_payouts and view_tax_information live in STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES, a union deliberately separate from WorkspacePermission, per planner decision 1 (D-42) — not a permission defaulting to false"
  - "document-supported is NOT a stored ROSTER_RELATIONSHIP_STATE_VALUES member; it is the WorkspaceAuthorityTier 'authority' value, resolved on read in plan 38-02 (planner decision 2)"
  - "Four preset bundles (read_only, day_to_day, full_operational, operational_plus_authority) are exported as plain data, keyed by neutral capability-shaped names, never a workspace role name (D-19)"
  - "assertGrantIsIssuable checks unknown-value, then structural exclusion, then authority tier, then granter subset, in that fixed order, so the failure reason always names the specific offending permission"

patterns-established:
  - "Workspace permission/grant logic ships as pure lib/ modules with paired *.test.ts files BEFORE any migration references their shape — RESEARCH's explicit anti-pattern guard"

requirements-completed: [WS-07, WS-08, WS-20, WS-24, WS-30]

coverage:
  - id: D1
    description: "Workspace vocabulary types (type, role, membership state, verification state, roster relationship state, authority tier, invitation state, capability flags) compile under strict TypeScript with zero Supabase imports"
    requirement: "WS-07"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D2
    description: "19-permission catalogue with tier assignment, labels, and four editable preset bundles, none containing a bundle-excluded permission"
    requirement: "WS-07"
    verification:
      - kind: unit
        ref: "lib/workspaces/permissions.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Two-tier operational/authority split with bundle-excluded sensitive permissions (clean masters, private rights identifiers, earnings) never present in any bundle"
    requirement: "WS-08"
    verification:
      - kind: unit
        ref: "lib/workspaces/permissions.test.ts#lib/workspaces/permissions WORKSPACE_PERMISSION_BUNDLES (D-19, D-40) never contains a bundle-excluded permission in any bundle"
        status: pass
    human_judgment: false
  - id: D4
    description: "Payout/tax capabilities are structurally excluded from WorkspacePermission — empty set intersection proven by test, not merely untested"
    requirement: "WS-20"
    verification:
      - kind: unit
        ref: "lib/workspaces/permissions.test.ts#lib/workspaces/permissions structural payout/tax exclusion (D-42) shares no member between STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES and WORKSPACE_PERMISSION_VALUES"
        status: pass
    human_judgment: false
  - id: D5
    description: "Grant subset check (isSubsetGrant, filterGrantableByAuthority, assertGrantIsIssuable) fails closed on empty, unknown, structurally excluded, over-tier and over-granter requests, naming the offending permission"
    requirement: "WS-24"
    verification:
      - kind: unit
        ref: "lib/workspaces/grants.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "act_on_behalf modeled only as a named, grantable authority-tier permission — no impersonation/session-substitution primitive introduced"
    requirement: "WS-30"
    verification:
      - kind: unit
        ref: "lib/workspaces/permissions.test.ts#lib/workspaces/permissions PERMISSION_TIER assigns authority tier to exactly the five authority permissions"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-09-05
status: complete
---

# Phase 38 Plan 01: Pure Workspace Permission Core Summary

**19-permission workspace catalogue with a structurally payout-excluded grantable union, four editable bundles, and one grant-time/use-time subset-check function (`isSubsetGrant`) shared by every future workspace route.**

## Performance

- **Duration:** ~6 min (commit timestamps 20:10:27 → 20:13:45)
- **Tasks:** 3
- **Files modified:** 5 (all new)

## Accomplishments
- `lib/workspaces/types.ts` — seven `*_VALUES`/derived-union pairs (workspace type, role, membership state, verification state, roster relationship state, authority tier, invitation state) plus `WorkspaceCapabilityFlags`, all zero-I/O and byte-mirror-ready for migrations 182–186
- `lib/workspaces/permissions.ts` — the 19-permission catalogue in matrix order, `PERMISSION_TIER` (5 authority / 14 operational per D-21), `PERMISSION_LABELS`, `isBundleExcluded` (D-40's three high-sensitivity permissions), four preset bundles as plain data, and `STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES` as a genuinely separate, non-member union (D-42)
- `lib/workspaces/grants.ts` — `isSubsetGrant`, `filterGrantableByAuthority`, and `assertGrantIsIssuable`, the one module plan 38-09 will call identically at grant time and at use time (D-49)

## Task Commits

Each task was committed atomically:

1. **Task 1: Workspace domain vocabulary types** - `72c58402` (feat)
2. **Task 2: Permission catalogue, tiers, bundles, and the structural payout exclusion** - `b270afce` (feat)
3. **Task 3: Grant subset check — one function, both checkpoints** - `6ad16ca5` (feat)

**Plan metadata:** committed with this SUMMARY (worktree mode — orchestrator finalizes STATE.md/ROADMAP.md after merge)

## Files Created/Modified
- `lib/workspaces/types.ts` - Workspace vocabulary: `WorkspaceType`, `WorkspaceRole`, `WorkspaceMembershipState`, `WorkspaceVerificationState`, `RosterRelationshipState`, `WorkspaceAuthorityTier`, `WorkspaceInvitationState`, `WorkspaceCapabilityFlags`
- `lib/workspaces/permissions.ts` - `WORKSPACE_PERMISSION_VALUES`, `PERMISSION_TIER`, `PERMISSION_LABELS`, `isBundleExcluded`, `WORKSPACE_PERMISSION_BUNDLES`, `STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES`, `isStructurallyExcludedCapability`
- `lib/workspaces/permissions.test.ts` - 14 tests, all iteration-based per the plan's own "fails when a permission is added without a tier/label/bundle audit" contract
- `lib/workspaces/grants.ts` - `isSubsetGrant`, `filterGrantableByAuthority`, `assertGrantIsIssuable`
- `lib/workspaces/grants.test.ts` - 21 tests covering every behavior bullet plus a raw-string `manage_payouts`/`view_tax_information` refusal case

## Decisions Made
- Followed both planner decisions verbatim: (1) payout/tax capabilities live in a genuinely separate union rather than a false-defaulting permission; (2) `document-supported` is not a stored roster state, it is the derived `authority` value of `WorkspaceAuthorityTier`
- `assertGrantIsIssuable`'s check order (unknown value → structural exclusion → authority tier → granter subset) was implemented exactly as the plan's `<action>` block specified, so a payout-name string always fails on the structural-exclusion branch with the offending name in the reason, distinct from a truly unrecognized string

## Deviations from Plan

None — plan executed exactly as written. All five `must_haves.truths`, all six D-42/D-40/D-49/D-19/D-22 hard constraints from the phase-level prompt, and all `<behavior>` bullets in Tasks 2 and 3 are covered by passing tests.

## Issues Encountered

None. `npx tsc --noEmit`, `npx jest lib/workspaces`, and `npx next lint` on the five new files were all clean on first pass; no auto-fixes were needed.

## User Setup Required

None - no external service configuration required. No database, no route, no component — pure TypeScript only, per the plan's explicit output boundary.

## Next Phase Readiness

- `lib/workspaces/types.ts`, `permissions.ts`, and `grants.ts` are green, unit-tested, and importable by plan 38-02's roster state machine (`lib/workspaces/roster.ts`) and any later migration/route work in this phase without further changes.
- `WORKSPACE_PERMISSION_VALUES` is ready to be the literal source migration 184's CHECK constraint mirrors; `isSubsetGrant`/`assertGrantIsIssuable` are ready to be the single function plan 38-09's issuance route and use-time re-check both call.
- No blockers. No stubs. No threat-surface additions beyond what the plan's own `<threat_model>` already registers (all five threats mitigated by tests in this plan; T-38-01-06 accepted — no new package installed).

---
*Phase: 38-member-organization-team-workspaces*
*Completed: 2026-09-05*
