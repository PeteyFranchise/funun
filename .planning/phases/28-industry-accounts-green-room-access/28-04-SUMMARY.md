---
phase: 28-industry-accounts-green-room-access
plan: 04
subsystem: ui
tags: [nextjs, navigation, curators, pitchplug]

# Dependency graph
requires:
  - phase: 28-industry-accounts-green-room-access
    provides: "prior plans in this phase establish the Industry-account model this navigation change sits alongside"
provides:
  - "Discoverable /curators link from the artist-facing PitchPlug page header"
  - "Admin /admin/curators nav entry relabeled as PitchPlug-associated ('PitchPlug · Curators')"
  - "Regression test guarding both the link and the relabel"
affects: [pitchplug, curators, admin-nav]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Source-assertion regression tests (readFileSync + string/regex match on page/layout source) for navigation/placement guarantees — mirrors __tests__/migration-061.test.ts"

key-files:
  created:
    - __tests__/curator-directory-relocation.test.ts
  modified:
    - app/(admin)/layout.tsx
    - app/(artist)/tools/pitchplug/page.tsx

key-decisions:
  - "Kept curators table/data path untouched — PitchPlug link is a plain next/link Link with zero data wiring, per owner decision that curators is CRM data living under PitchPlug in name only"
  - "Admin curators route (/admin/curators) left unchanged; only the visible label/grouping changed to avoid disturbing any other admin references to that href"

patterns-established:
  - "Navigation/placement-only plans use source-assertion tests (readFileSync on the target page/layout, regex/substring match) rather than rendering tests — cheap, deterministic guard against regressions in link presence and label text"

requirements-completed: [INDUSTRY-05]

coverage:
  - id: D1
    description: "PitchPlug page (/tools/pitchplug) surfaces a discoverable link to the curator directory (/curators)"
    requirement: "INDUSTRY-05"
    verification:
      - kind: unit
        ref: "__tests__/curator-directory-relocation.test.ts#adds a discoverable /curators link from the PitchPlug page"
        status: pass
      - kind: unit
        ref: "__tests__/curator-directory-relocation.test.ts#does not wire curator data or the pitch composer into PitchPlug"
        status: pass
    human_judgment: false
  - id: D2
    description: "Admin /admin/curators nav entry reads as PitchPlug-associated (relabel/grouping only, href unchanged)"
    requirement: "INDUSTRY-05"
    verification:
      - kind: unit
        ref: "__tests__/curator-directory-relocation.test.ts#labels the admin /admin/curators nav entry as PitchPlug-associated"
        status: pass
      - kind: unit
        ref: "__tests__/curator-directory-relocation.test.ts#keeps the /admin/curators route unchanged"
        status: pass
    human_judgment: true
    rationale: "Visual placement/grouping quality (does the label read naturally as PitchPlug-associated in the actual admin sidebar) is a judgment call the source-assertion test cannot fully capture — recorded as Manual-Only verification per the plan's <verification> block."

# Metrics
duration: 12min
completed: 2026-08-06
status: complete
---

# Phase 28 Plan 04: Curator Directory Relocation Under PitchPlug Summary

**Made the orphaned `/curators` artist directory discoverable from PitchPlug, and relabeled the admin curators nav entry as PitchPlug-associated — navigation-only, zero change to curator data/logic.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-06T00:53:00Z
- **Completed:** 2026-08-06T01:05:47Z
- **Tasks:** 2 completed
- **Files modified:** 3 (1 new test, 2 modified)

## Accomplishments
- Added a "Browse the curator directory" link (`/curators`) to the PitchPlug page header, surfacing a previously URL-only-reachable route from the tool that actually pitches those contacts.
- Relabeled the `/admin/curators` sidebar entry to "PitchPlug · Curators" so it no longer reads as a standalone curator system in the admin nav.
- Added `__tests__/curator-directory-relocation.test.ts`, a source-assertion regression test (mirroring `migration-061.test.ts`'s pattern) that pins both the PitchPlug link and the admin label, and explicitly asserts PitchPlug's page source never imports `CuratorDirectory`, `PitchComposer`, or references `pitch_history`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Failing relocation regression test + admin nav relabel** - `1a63b2c` (test)
2. **Task 2: Add a discoverable curator-directory link/section to the PitchPlug page (INDUSTRY-05)** - `7c6c30f` (feat)

**Plan metadata:** _pending_ (docs: complete plan — committed in final_commit step)

_Note: TDD task 1 wrote the test RED (2 failing assertions: pitchplug-link, admin-label) and applied the admin relabel in the same commit per the plan's task boundary; task 2 completed GREEN._

## Files Created/Modified
- `__tests__/curator-directory-relocation.test.ts` - Source-assertion regression test: PitchPlug page links to `/curators`; PitchPlug page never imports `CuratorDirectory`/`PitchComposer`/`pitch_history`; admin `/admin/curators` label contains "PitchPlug"; admin href unchanged.
- `app/(admin)/layout.tsx` - `/admin/curators` Link label changed from "Curators" to "PitchPlug · Curators"; href, position, and all other admin nav links unchanged.
- `app/(artist)/tools/pitchplug/page.tsx` - Added a `Link` to `/curators` ("Browse the curator directory →") beneath the existing header copy, styled to match the page's indigo (`#818CF8`/`#A5B4FC`) idiom. No data fetching or curator-module imports added; DEMO branch untouched.

## Decisions Made
- No new decisions beyond what's already locked in `28-CONTEXT.md` (curators lives under PitchPlug for now, nav/placement move only) and `28-PATTERNS.md` (PitchPlug has no code link to the curators table — none introduced here either).

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their `<action>` and `<acceptance_criteria>` without requiring auto-fixes.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Manual-Only Verification (record per plan `<verification>`)

- From `/tools/pitchplug`, the curator-directory link is visible in the header and opens `/curators` — confirmed via source (link markup added, matches route) and `npm run build` succeeding for both `/tools/pitchplug` and `/curators` routes. A human should still eyeball the rendered page for visual placement/spacing.
- Admin nav (`/admin`) shows the curators entry labeled "PitchPlug · Curators" — confirmed via source assertion; a human should verify the label reads naturally in the actual sidebar.

## Next Phase Readiness

The curator directory is now discoverable from both the artist (PitchPlug) and admin surfaces without any change to the underlying `curators` table, RLS, or the Launchpad `PitchComposer`/`pitch_history` send flow. No blockers for subsequent Phase 28 plans; this was a leaf navigation change with `depends_on: []`.

---
*Phase: 28-industry-accounts-green-room-access*
*Completed: 2026-08-06*

## Self-Check: PASSED

All created/modified files found on disk; both task commits (`1a63b2c`, `7c6c30f`) verified present in `git log`.
