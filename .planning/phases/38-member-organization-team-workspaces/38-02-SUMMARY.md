---
phase: 38-member-organization-team-workspaces
plan: 02
subsystem: auth
tags: [typescript, state-machine, pure-functions, jest, workspaces]

# Dependency graph
requires:
  - phase: 38-member-organization-team-workspaces
    provides: "38-01's lib/workspaces/types.ts vocabulary (WorkspaceMembershipState, WorkspaceRole, RosterRelationshipState, WorkspaceAuthorityTier) and lib/workspaces/permissions.ts (deliberately not imported by this plan)"
provides:
  - "lib/workspaces/membership.ts -- workspace membership state machine (pending/active/suspended/expired/removed), role capability predicates, and the never-zero-owners predicate shared with migration 182's trigger message"
  - "lib/workspaces/roster.ts -- roster relationship state machine (proposed/accepted/refused/blocked/ended), inertness, proposal eligibility, and the effective-end/live-access-window resolvers"
  - "lib/workspaces/evidence.ts -- compute-on-read agreement evidence ladder resolving WorkspaceAuthorityTier, plus neutral provenance description"
affects: [38-03, 38-04, 38-05, 38-06, 38-07, 38-08, 38-09, 38-10, 38-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure, zero-I/O LEGAL_EDGES map + isLegalXTransition resolver (house convention from lib/selects/stage-machine.ts), reused for two independent state machines in one plan"
    - "Injectable now: number defaulting to Date.now() for compute-on-read time-dependent resolvers (house convention from lib/client-partners/health.ts)"
    - "Shared message constant between a TypeScript assertion and a planned DB trigger's RAISE EXCEPTION text (WORKSPACE_OWNER_FLOOR_MESSAGE)"

key-files:
  created:
    - lib/workspaces/membership.ts
    - lib/workspaces/membership.test.ts
    - lib/workspaces/roster.ts
    - lib/workspaces/roster.test.ts
    - lib/workspaces/evidence.ts
    - lib/workspaces/evidence.test.ts
  modified: []

key-decisions:
  - "Followed the plan's task actions and 38-01's already-committed lib/workspaces/types.ts (5-state ROSTER_RELATIONSHIP_STATE_VALUES with no document-supported member) rather than 38-RESEARCH.md's Code Examples draft and 38-PATTERNS.md's line-221 pointer, both of which still sketch a 6-state machine with a stored document-supported state. The plan's own Task 2 <read_first> and <action> explicitly flag this as Open Question 2's resolved compute-on-read recommendation superseding the earlier draft, so lib/workspaces/roster.ts implements 4 legal edges (proposed->accepted/refused/blocked, accepted->ended) and lib/workspaces/evidence.ts owns the derived authority tier instead."
  - "canRemoveMember checks assertOwnerFloorHolds before canManageWorkspaceMembers, so the floor is provably not bypassable by an owner's own privilege (tested with an owner actor and remainingActiveOwnersAfterRemoval: 0)"
  - "resolveAuthorityTier's qualifying-evidence predicate requires ALL THREE of: non-empty declaredScope, not-yet-expired, not-yet-superseded -- a superseded row is excluded even though the plan's behavior list states it as a separate bullet from the declaredScope/expiresAt bullets"
  - "evidence.ts's header and all D-37 vocabulary discussion use only `//` line comments (never /** */ blocks) so the module can discuss why 'verified'/'approved' are forbidden without tripping the comment-stripped source grep in its own acceptance criteria"

patterns-established:
  - "Two independent LEGAL_EDGES state machines (membership, roster) can share the same guard-order convention (unknown-value check, same-state refusal, edge lookup) without sharing any code, keeping each domain's terminal-state rules provably separate"

requirements-completed: [WS-03, WS-05, WS-06]

coverage:
  - id: D1
    description: "Workspace membership state machine (pending/active/suspended/expired/removed) with removed as a provably terminal state, driven by iterating WORKSPACE_MEMBERSHIP_STATE_VALUES"
    requirement: "WS-03"
    verification:
      - kind: unit
        ref: "lib/workspaces/membership.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Never-zero-owners predicate (assertOwnerFloorHolds, WORKSPACE_OWNER_FLOOR_MESSAGE) checked before the actor's role in canRemoveMember, so an owner cannot remove the last active owner"
    requirement: "WS-03"
    verification:
      - kind: unit
        ref: "lib/workspaces/membership.test.ts#lib/workspaces/membership canRemoveMember (D-13) refuses when the target is the last active owner, even for an owner actor"
        status: pass
    human_judgment: false
  - id: D3
    description: "Roster relationship state machine: proposed is inert (grants nothing), accepted/refused/blocked/ended are the only reachable states, and refused/blocked/ended are provably terminal"
    requirement: "WS-05"
    verification:
      - kind: unit
        ref: "lib/workspaces/roster.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Roster multiplicity permitted across workspaces (D-15) and unilateral revocation always beats a later scheduled termination date (D-17, D-18)"
    requirement: "WS-05"
    verification:
      - kind: unit
        ref: "lib/workspaces/roster.test.ts#lib/workspaces/roster canWorkspaceProposeRoster D-15 and #lib/workspaces/roster resolveEffectiveEnd D-18"
        status: pass
    human_judgment: false
  - id: D5
    description: "Compute-on-read authority tier: none for non-accepted relationships, authority only for a live declared-scope evidence row, operational when evidence is absent, scope-less, expired, or superseded -- expiry demotes rather than ends (D-39)"
    requirement: "WS-06"
    verification:
      - kind: unit
        ref: "lib/workspaces/evidence.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "Provenance description never emits a validated-status judgement word (verified/approved) anywhere in a returned string literal, source-level enforced via comment-stripped grep"
    requirement: "WS-06"
    verification:
      - kind: unit
        ref: "grep -v \"^\\s*//\" lib/workspaces/evidence.ts | grep -ci \"verified|approved\" -> 0"
        status: pass
    human_judgment: false

# Metrics
duration: 3min
completed: 2026-09-05
status: complete
---

# Phase 38 Plan 02: Membership, Roster, and Evidence State Machines Summary

**Three pure state machines -- workspace membership (with a never-zero-owners predicate shared with the future DB trigger's exact message), roster relationships (inert-until-accepted, unilateral revocation always wins), and compute-on-read agreement evidence (authority lapses automatically, operational access survives) -- all zero-I/O and importable by every route in waves 3-7.**

## Performance

- **Duration:** ~3 min (commit timestamps 20:21:55 -> 20:24:41)
- **Tasks:** 3
- **Files modified:** 6 (all new)

## Accomplishments
- `lib/workspaces/membership.ts` -- `LEGAL_MEMBERSHIP_EDGES`/`isLegalMembershipTransition` (5-state machine, `removed` terminal), `canManageWorkspaceMembers`/`canManageRoster`/`canConfigureWorkspace`/`isTimeBoxedRole` role predicates, and `assertOwnerFloorHolds`/`canRemoveMember` with `WORKSPACE_OWNER_FLOOR_MESSAGE` as the shared API/DB-trigger sentence (D-13)
- `lib/workspaces/roster.ts` -- `LEGAL_ROSTER_EDGES`/`isLegalRosterTransition` (5-state machine matching 38-01's already-committed vocabulary, 3 terminal states), `isInertState` (D-05), `canWorkspaceProposeRoster` (D-15/D-51), `resolveEffectiveEnd` and `isWorkspaceAccessLive` (D-17/D-18)
- `lib/workspaces/evidence.ts` -- `resolveAuthorityTier` (compute-on-read, D-16/D-39) and `describeProvenance` (two neutral labels only, D-37)

## Task Commits

Each task was committed atomically:

1. **Task 1: Workspace membership state machine + never-zero-owners predicate** - `71c82d0b` (feat)
2. **Task 2: Roster relationship state machine** - `92ace030` (feat)
3. **Task 3: Compute-on-read agreement evidence ladder and authority tier** - `800d4173` (feat)

**Plan metadata:** committed with this SUMMARY (worktree mode -- orchestrator finalizes STATE.md/ROADMAP.md after merge)

## Files Created/Modified
- `lib/workspaces/membership.ts` - Membership transitions, role predicates, owner floor
- `lib/workspaces/membership.test.ts` - 17 tests, including a full-matrix iteration over `WORKSPACE_MEMBERSHIP_STATE_VALUES`
- `lib/workspaces/roster.ts` - Roster transitions, inertness, proposal eligibility, effective-end/live-access resolvers
- `lib/workspaces/roster.test.ts` - 26 tests, including named D-15 and D-18 assertions
- `lib/workspaces/evidence.ts` - Compute-on-read authority tier resolver + provenance description
- `lib/workspaces/evidence.test.ts` - 13 tests, including a named D-39 expiry-demotion assertion and a regex-based judgement-word guard on returned labels

## Decisions Made
- Implemented `lib/workspaces/roster.ts` against the plan's Task 2 `<action>` and 38-01's already-committed `lib/workspaces/types.ts` (5-state, no `document-supported` member), not against 38-RESEARCH.md's Code Examples draft or 38-PATTERNS.md's line-221 pointer -- both of those documents still show an earlier 6-state sketch with a stored `document-supported` state that Open Question 2 explicitly recommends resolving as compute-on-read instead. The plan's own `<read_first>` for Task 2 names this exact supersession, so no deviation from the plan occurred; this note exists only to flag that the RESEARCH/PATTERNS documents themselves are stale on this one point for any future reader.
- `canRemoveMember` checks `assertOwnerFloorHolds` before `canManageWorkspaceMembers`, exactly as the plan specifies, so the floor cannot be bypassed by an owner's own privilege
- `resolveAuthorityTier`'s qualifying predicate requires non-empty `declaredScope` AND not-expired AND not-superseded as one combined condition, satisfying all three separately-stated behavior bullets (D-36, D-39, and the superseded-row bullet) with a single `isLiveQualifyingEvidence` helper
- `evidence.ts` restricts every mention of "verified"/"approved" (in the header's explanation of why those words are forbidden) to `//` line comments so the comment-stripped source grep in the task's own acceptance criteria passes without needing a suppression marker

## Deviations from Plan

None -- plan executed exactly as written. All five `must_haves.truths`, all seven phase-level `<phase_38_hard_constraints>` (pure/zero-I/O, D-11 expired state, D-05 inertness, D-18 unilateral revocation, D-17 auto-end-persists-as-history, D-16 compute-on-read evidence ladder, D-15 no exclusivity enforcement), and every `<behavior>` bullet across all three tasks are covered by passing tests.

## Issues Encountered

One near-miss caught by the plan's own acceptance criterion: the first draft of `describeProvenance`'s JSDoc docblock used `/** ... */` and explicitly named "verified"/"approved" while explaining why those words are forbidden -- since `grep -v "^\s*//"` does not strip `/** */` blocks, this would have failed the negative acceptance criterion. Rewrote the docblock as `//` line comments before running the grep check; no test or behavior was affected. `npx tsc --noEmit`, `npx jest lib/workspaces` (5 suites, 91 tests), and targeted `npx eslint` on all six new files were otherwise clean on first pass.

## User Setup Required

None - no external service configuration required. No database, no route, no component -- pure TypeScript only, per the plan's explicit output boundary.

## Next Phase Readiness

- `lib/workspaces/membership.ts`, `roster.ts`, and `evidence.ts` are green, unit-tested, and importable by plan 38-03's migrations (182/183 CHECK constraints mirror `LEGAL_MEMBERSHIP_EDGES`/`LEGAL_ROSTER_EDGES` and `WORKSPACE_OWNER_FLOOR_MESSAGE`) and by plan 38-09's `assertGrantIsIssuable` (`resolveAuthorityTier` is the single input to its `relationshipTier` argument, per this plan's `key_links`).
- No blockers. No stubs. No threat-surface additions beyond the plan's own `<threat_model>`, all seven of which (T-38-02-01 through T-38-02-07) are mitigated by tests in this plan; T-38-02-07 accepted (no new package installed).
- This plan touched only `lib/workspaces/`, as required by the parallel-execution boundary with 38-03 (`supabase/migrations/`, `__tests__/`).

## Self-Check: PASSED

All six created files (`lib/workspaces/membership.ts`, `membership.test.ts`, `roster.ts`, `roster.test.ts`, `evidence.ts`, `evidence.test.ts`) verified present on disk. All three task commit hashes (`71c82d0b`, `92ace030`, `800d4173`) verified present in `git log`.

---
*Phase: 38-member-organization-team-workspaces*
*Completed: 2026-09-05*
