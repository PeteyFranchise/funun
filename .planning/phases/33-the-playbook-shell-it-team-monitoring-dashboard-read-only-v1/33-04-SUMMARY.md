---
phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1
plan: 04
subsystem: ui
tags: [nextjs, react, typescript, jest, tdd, playbook, admin-nav]

# Dependency graph
requires: []
provides:
  - "lib/playbook/nav.ts — single source for Rail 2 rooms, IT sub-pages, and D-10 doc-file mapping"
  - "PlaybookNavLink — Rail 1 active-aware 'The Playbook' link"
  - "Rail2 — room list with 5 inert ghosts + role-conditional IT room"
  - "ItRoomTopBar — shared crumb + access chip + optional Live chip"
affects: ["33-05 (shell layout wiring)", "33-06 (doc pages)", "33-08 (Monitoring Dashboard)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route-independent leaf primitives (no page/layout coupling) so downstream Wave 2 plans can build in parallel against one imported source of truth"
    - "Ghost/ ' Coming soon' rooms rendered as inert <div> (never <a>/<button>) — no navigable destination, no tabindex"
    - "Role-conditional DOM omission (return null) rather than locked/greyed rendering for unauthorized visibility (D-06)"

key-files:
  created:
    - lib/playbook/nav.ts
    - components/playbook/PlaybookNavLink.tsx
    - components/playbook/Rail2.tsx
    - components/playbook/ItRoomTopBar.tsx
    - __tests__/playbook-nav.test.ts
  modified: []

key-decisions:
  - "nav.ts stays pure data with zero StaffRole import — role gating is resolved by the caller (33-05 layout), not this module, per the plan's explicit decoupling requirement"
  - "Rail2 handles the IT room's 'never re-declare rooms' rule generically: any itGated room is DOM-omitted (return null) when the access prop is false, and every other room renders as a ghost — no hardcoded 'if it-team' branching"

patterns-established:
  - "Pattern: leaf UI primitives take no route/pathname props — they call usePathname() internally, keeping callers (future layouts) purely compositional"

requirements-completed: [PLAYBOOK-02, PLAYBOOK-03]

coverage:
  - id: D1
    description: "lib/playbook/nav.ts exports PLAYBOOK_ROOMS (6 rooms, 5 comingSoon, 1 itGated), IT_SUBPAGES (5, dashboard first), DOC_PAGE_FILE (4 D-10 filename mappings)"
    requirement: "PLAYBOOK-02"
    verification:
      - kind: unit
        ref: "__tests__/playbook-nav.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "PlaybookNavLink — Rail 1 link active when pathname starts with /admin/playbook"
    requirement: "PLAYBOOK-02"
    verification: []
    human_judgment: true
    rationale: "Visual active-state rendering and route-navigation behavior require a rendered browser check against the shell layout (wired in 33-05) — no automated UI test exists in this repo's suite for this component in isolation."
  - id: D3
    description: "Rail2 — 5 inert 'Coming soon' ghost <div> rooms + role-conditional IT Team room with 5 ordered sub-pages, DOM-omitted when canSeeItRoom is false"
    requirement: "PLAYBOOK-03"
    verification:
      - kind: other
        ref: "grep -n \"<a \\|<button \" components/playbook/Rail2.tsx (zero matches — no <a>/<button> wraps a ghost room)"
        status: pass
    human_judgment: true
    rationale: "Full role-conditional rendering (canSeeItRoom true/false) and active sub-row styling need a rendered check inside the real shell (33-05) with a real staff session — no isolated render test exists yet."
  - id: D4
    description: "ItRoomTopBar — shared crumb + unconditional access chip, optional Live chip"
    requirement: "PLAYBOOK-03"
    verification: []
    human_judgment: true
    rationale: "Presentational Server Component with no automated render test in this repo's suite; visual verification happens once 33-06/33-08 wire it into real pages."

duration: 5min
completed: 2026-08-18
status: complete
---

# Phase 33 Plan 04: Playbook nav + Rail chrome primitives Summary

**Single-source Playbook nav data model (`lib/playbook/nav.ts`) plus three route-independent chrome primitives — `PlaybookNavLink`, `Rail2`, `ItRoomTopBar` — built as Wave 1 leaves so 33-05/33-06/33-08 can build in parallel against one imported room/sub-page structure.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-08-18T01:21:10Z
- **Completed:** 2026-08-18T01:25:43Z
- **Tasks:** 3 completed
- **Files modified:** 5 (all new)

## Accomplishments
- `lib/playbook/nav.ts` — `PLAYBOOK_ROOMS` (6 rooms, 5 `comingSoon`, 1 `itGated`), `IT_SUBPAGES` (5, dashboard first), `DOC_PAGE_FILE` (the 4 D-10 filename mappings) — pure data, no `StaffRole` coupling
- `PlaybookNavLink` — Rail 1 client link, active when `pathname.startsWith('/admin/playbook')`, reusing the exact `NAV_LINK_CLASS` hover treatment as its permanent active state
- `Rail2` — room list built to `playbook-double-sidebar.html`: 5 inert `<div>` "Coming soon" ghosts (never `<a>`/`<button>`, no tabindex) + the role-conditional IT Team room (5 ordered sub-links, Monitoring Dashboard carries the static "Live" badge), entirely DOM-omitted for non-authorized staff
- `ItRoomTopBar` — shared crumb + unconditional `🔒 IT + Leadership` access chip + optional `Live` chip, a Server Component ready for reuse by every IT-room page

## Task Commits

Each task was committed atomically (Task 1 followed the RED/GREEN TDD cycle):

1. **Task 1: lib/playbook/nav.ts** — `40dbb39` (test, RED) → `ac0f3b3` (feat, GREEN)
2. **Task 2: PlaybookNavLink + Rail2** — `c9e4755` (feat)
3. **Task 3: ItRoomTopBar** — `2ad6121` (feat)

_Note: Task 1 is `tdd="true"` — the failing test committed first, then the minimal implementation that turns it green. No refactor commit was needed._

## Files Created/Modified
- `lib/playbook/nav.ts` - `PLAYBOOK_ROOMS`, `IT_SUBPAGES`, `DOC_PAGE_FILE` single source
- `components/playbook/PlaybookNavLink.tsx` - Rail 1 active-aware "The Playbook" link
- `components/playbook/Rail2.tsx` - Rail 2 room list (ghosts + role-conditional IT room)
- `components/playbook/ItRoomTopBar.tsx` - shared IT-room top bar
- `__tests__/playbook-nav.test.ts` - Wave 0 nav-structure test (6 assertions, all pass)

## Decisions Made
- Kept `nav.ts` fully decoupled from `StaffRole` — the plan explicitly required this so the module stays a pure leaf with no auth dependency; `Rail2`'s `canSeeItRoom` boolean prop is the only access signal it accepts, resolved by the future layout caller.
- Wrote `Rail2`'s room-mapping logic generically (`if (room.itGated) { ... } else { ghost }`) rather than hardcoding an "IT Team" special case, so the component stays correct even if `nav.ts`'s room set changes shape later.
- `PlaybookNavLink`/`ItRoomTopBar` do not import from `app/(admin)/layout.tsx` (files_modified for this plan excludes it) — `NAV_LINK_CLASS` is duplicated verbatim with a comment noting it must stay in sync until a later plan wires the link into the shared layout.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- First commit attempt for Task 3 (heredoc with the 🔒 emoji in the `-m` message) hit a bash quoting error (`unexpected EOF while looking for matching \'`) — no partial commit was created (verified via `git status`/`git log`), retried with a plain `-m "..." -m "..."` invocation and it committed cleanly. No file content was affected.

## Next Phase Readiness
- `lib/playbook/nav.ts`, `PlaybookNavLink`, `Rail2`, and `ItRoomTopBar` are ready for 33-05 (shell layout wiring into `app/(admin)/layout.tsx` + the nested `/admin/playbook/*` layout), 33-06 (doc pages consuming `ItRoomTopBar` + `DOC_PAGE_FILE`), and 33-08 (Monitoring Dashboard consuming `ItRoomTopBar` with `showLiveChip`).
- No blockers. `canSeeItRoom` computation (from `getStaffRole`) and the `it` `StaffRole` union addition (D-01) are out of this plan's scope and land in a sibling Wave 1 plan.

---
*Phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1*
*Completed: 2026-08-18*

## Self-Check: PASSED

All 5 created files verified present on disk (`lib/playbook/nav.ts`,
`components/playbook/PlaybookNavLink.tsx`, `components/playbook/Rail2.tsx`,
`components/playbook/ItRoomTopBar.tsx`, `__tests__/playbook-nav.test.ts`).
All 5 commits verified present in `git log` (`40dbb39`, `ac0f3b3`, `c9e4755`,
`2ad6121`, and this SUMMARY's own commit).
