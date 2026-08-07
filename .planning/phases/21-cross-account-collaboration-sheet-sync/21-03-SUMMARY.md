---
phase: 21-cross-account-collaboration-sheet-sync
plan: 03
subsystem: ui
tags: [react, nextjs, supabase, rls, vault]

# Dependency graph
requires:
  - phase: 21-01
    provides: project_members table + membership-aware RLS (migration 078, live), lib/vault/membership.ts role helpers
provides:
  - SharedProjectBadge presentational component (owner name + viewer's own role, degrades on null owner)
  - VaultCard type extended with optional sharedBy/viewerRole fields
  - "Shared with me" vault lane: parallel project_members query + separate render section on app/(artist)/vault/page.tsx
affects: [dashboard-rework, sheet-project-sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "react-dom/server renderToStaticMarkup for node-environment component tests (no jsdom/testing-library needed)"
    - "Parallel query pattern for cross-account visibility: owned query stays untouched, shared query is separate and post-filtered"

key-files:
  created:
    - components/vault/SharedProjectBadge.tsx
    - components/vault/SharedProjectBadge.test.tsx
  modified:
    - components/vault/VaultProjectCard.tsx
    - app/(artist)/vault/page.tsx

key-decisions:
  - "SharedProjectBadge is rendered from the opposite corner (top-right) of the existing status chip (top-left) so neither idiom collides with the readiness ring (bottom-right)"
  - "Shared lane excludes memberships via BOTH role='owner' filter and an ownedProjectIds set-difference (belt-and-suspenders per plan instruction), even though the project_members UNIQUE(project_id, user_id) constraint makes double-exclusion redundant in practice"
  - "First .test.tsx in the repo — no jsdom/testing-library installed (jest testEnvironment is 'node'); used react-dom/server's renderToStaticMarkup + string assertions instead of installing new test dependencies (Rule 3 package-install exclusion: no new packages added)"

patterns-established:
  - "Component tests in this repo render via renderToStaticMarkup and assert on the HTML string, avoiding a jsdom/RTL dependency addition"

requirements-completed: ["③-mine-vs-shared"]

coverage:
  - id: D1
    description: "SharedProjectBadge renders 'Shared · {owner}'s project' + 'You're a {role}', degrades to 'Shared project' on null owner, no throw"
    requirement: "③-mine-vs-shared"
    verification:
      - kind: unit
        ref: "components/vault/SharedProjectBadge.test.tsx#SharedProjectBadge"
        status: pass
    human_judgment: false
  - id: D2
    description: "Vault page renders a separate 'Shared with me' section (project_members-driven) beneath the owned grid, badged per role, with the owned .eq('user_id', me) query and grid completely unchanged"
    requirement: "③-mine-vs-shared"
    verification:
      - kind: other
        ref: "npx tsc --noEmit && npm run build (clean); grep confirms .eq('user_id', user?.id ?? '') intact on the vault_projects query"
        status: pass
    human_judgment: true
    rationale: "Full manual verification requires a live second account with a viewer membership row to visually confirm the lane, badge text, and absence of an edit CTA — not exercisable by the automated suite alone (no seeded shared-membership fixture in this repo)."

# Metrics
duration: 8min
completed: 2026-08-02
status: complete
---

# Phase 21 Plan 03: Shared-with-me Vault Lane Summary

**Added a separate "Shared with me" vault lane fed by a parallel `project_members` query, with a `SharedProjectBadge` showing the owner's name and the viewer's own role — the owned grid and its `.eq('user_id', me)` query are untouched.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-02T04:50:00Z
- **Completed:** 2026-08-02T04:58:00Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `SharedProjectBadge` component renders "Shared · {ownerName}'s project" + "You're a {role}", degrading gracefully to "Shared project" when the owner name is unknown
- `VaultCard` type gained two OPTIONAL fields (`sharedBy`, `viewerRole`) so every existing owned-card caller keeps compiling unchanged
- Vault page (`app/(artist)/vault/page.tsx`) now runs a second, parallel `project_members` query (role != owner, project not already owned) and renders a distinct "Shared with me" section beneath the owned `VaultBrowser` grid — never mixed into it
- Owner display name for each shared card is resolved from `vault_projects.user_id` → `user_profiles.artist_name`; viewer's own role comes from their own `project_members` row (per migration 078's least-privilege SELECT policy — a member only ever sees their own membership row, which is exactly what the badge needs)

## Task Commits

Each task was committed atomically (Task 1 followed the TDD RED/GREEN cycle per its `tdd="true"` flag):

1. **Task 1: SharedProjectBadge component + VaultCard shared fields**
   - `1d024f9` (test) — RED: failing `SharedProjectBadge.test.tsx` (module doesn't exist yet)
   - `536df34` (feat) — GREEN: `SharedProjectBadge.tsx` implementation + `VaultCard` optional fields; test suite passes, `tsc --noEmit` clean
2. **Task 2: "Shared with me" query + render section on the vault page** - `c955943` (feat)

**Plan metadata:** (this commit, following SUMMARY.md write)

_Note: Task 1 is a `tdd="true"` task; RED and GREEN each landed as their own commit per the TDD execution protocol._

## Files Created/Modified
- `components/vault/SharedProjectBadge.tsx` - Presentational badge: owner's project name + viewer's own role, via `PROJECT_ROLE_LABELS`
- `components/vault/SharedProjectBadge.test.tsx` - Three behaviors: composed text, null-owner degrade, role mapping (renders via `react-dom/server`)
- `components/vault/VaultProjectCard.tsx` - `VaultCard` type gains optional `sharedBy`/`viewerRole`; renders `SharedProjectBadge` from the opposite corner of the status chip when `sharedBy` is present
- `app/(artist)/vault/page.tsx` - Added parallel `project_members` query, shared-card mapping (owner name as `artist`, `sharedBy`/`viewerRole` populated), and a new "Shared with me" render section; owned query and grid untouched

## Decisions Made
- **Badge placement:** top-right corner (opposite the existing top-left status chip), so the new badge never disturbs the existing status-chip/readiness-ring idioms on the card — matches the plan's "do not disturb" constraint without needing a new card variant.
- **Double exclusion of owner-role rows:** the shared query filters out memberships both by `role != 'owner'` and by set-difference against the owned query's project IDs. The `project_members` `UNIQUE(project_id, user_id)` constraint makes these two filters redundant in the current schema (a user can only have one role row per project), but the plan explicitly called for both, so both are implemented as defense-in-depth against any future relaxation of that constraint.
- **Test approach without new dependencies:** this is the first `.test.tsx` file in the repo. `jest.config.js` runs `testEnvironment: 'node'` with no `@testing-library/react`/`jsdom` installed. Rather than trigger the package-install-is-not-auto-fixable exclusion (Rule 3) by adding a new test dependency, `SharedProjectBadge.test.tsx` uses `react-dom/server`'s `renderToStaticMarkup` (already a transitive dependency of `react-dom`, which is already a direct dependency) to render to an HTML string and assert on its content. No new packages were added.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their `must_haves`/`acceptance_criteria` without requiring architectural changes or auto-fixes beyond the TDD RED/GREEN sequencing itself (which is prescribed by the plan's `tdd="true"` flag, not a deviation).

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. This plan builds entirely on migration 078 (already live per 21-01) and introduces no new schema, environment variables, or provider integration.

## Next Phase Readiness
- The "Shared with me" lane is live and ready for a real cross-account viewer-membership row to exercise end-to-end (currently unverified against a live second-account fixture — flagged as `human_judgment: true` in the coverage block above).
- No blockers for the remaining Wave 2/Wave 3 plans (auto-membership trigger, sheet↔project sync, dashboard action feed) — this plan only touches the vault list page and `VaultProjectCard`, both leaf UI surfaces with no shared state other than the `VaultCard` type.

---
*Phase: 21-cross-account-collaboration-sheet-sync*
*Completed: 2026-08-02*

## Self-Check: PASSED

All created/modified files and all three task commits (`1d024f9`, `536df34`, `c955943`) verified present on disk / in `git log`.
