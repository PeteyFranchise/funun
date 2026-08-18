---
phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1
plan: 05
subsystem: ui
tags: [nextjs, react, server-components, rbac, admin-console]

# Dependency graph
requires:
  - phase: 33 (wave 1, 33-01)
    provides: getStaffRole / requireStaffPage in lib/admin/gate.ts
  - phase: 33 (wave 1, 33-04)
    provides: lib/playbook/nav.ts, components/playbook/Rail2.tsx, components/playbook/PlaybookNavLink.tsx
provides:
  - Rail 1 "The Playbook" nav entry visible to all staff
  - /admin/playbook nested layout rendering Rail 2 beside page content
  - /admin/playbook index redirecting authorized staff to the IT dashboard
affects: [33-06, 33-07, 33-08 (IT room pages that render inside this nested layout)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Nested layout re-resolves session/role independently of parent layout (Next.js layouts don't share request state)"
    - "Render-time visibility (canSeeItRoom) kept explicitly separate from access authority (each IT page self-guards via requireStaffPage)"
    - "Pure-CSS responsive collapse via a small scoped <style> block, no client state/JS toggle"

key-files:
  created:
    - app/(admin)/playbook/layout.tsx
    - app/(admin)/playbook/page.tsx
  modified:
    - app/(admin)/layout.tsx

key-decisions:
  - "Applied the <1000px Rail2+content stacking reflow at the layout-container level only (scoped <style> block); left Rail2.tsx's own internal sub-list collapse untouched since Rail2.tsx is outside this plan's file set (built in 33-04)"
  - "Non-authorized staff index landing uses plain Tailwind utility classes (no new shared .cwrap CSS class) since the shared content-chrome contract belongs to the IT room pages built in later plans"

patterns-established:
  - "Playbook nested layout pattern: resolve role again in the child layout, compute a narrow visibility boolean, pass to a presentational component — never treat the boolean as an access gate"

requirements-completed: [PLAYBOOK-02, PLAYBOOK-03]

coverage:
  - id: D1
    description: "Rail 1 shows 'The Playbook' as the first nav item, visible to all staff (outside isLeadership)"
    requirement: "PLAYBOOK-02"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (app/(admin)/layout.tsx) + grep for PlaybookNavLink placement"
        status: pass
    human_judgment: true
    rationale: "Visual placement/styling and role-visibility across staff accounts is best confirmed by manual UAT in the running app; static grep/tsc checks only prove the code shape, not rendered behavior for each role."
  - id: D2
    description: "/admin/playbook renders the double-sidebar Rail 2 shell with server-side canSeeItRoom"
    requirement: "PLAYBOOK-03"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (app/(admin)/playbook/layout.tsx) + grep for canSeeItRoom expression"
        status: pass
    human_judgment: true
    rationale: "Confirming the IT room is DOM-omitted for non-authorized staff and the double-sidebar renders correctly requires visiting the route as different staff roles."
  - id: D3
    description: "/admin/playbook index redirects leadership/it to the IT dashboard; other staff see a coming-soon landing"
    requirement: "PLAYBOOK-03"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (app/(admin)/playbook/page.tsx) + grep for /admin/playbook/it/dashboard redirect target"
        status: pass
    human_judgment: true
    rationale: "Redirect behavior and non-authorized landing copy are best confirmed by manual UAT; the dashboard route itself doesn't exist yet (built in a later plan), so an automated end-to-end redirect check isn't possible this plan."

# Metrics
duration: ~5min
completed: 2026-08-17
status: complete
---

# Phase 33 Plan 05: Playbook Route Shell Summary

**Wired the Playbook route shell — Rail 1 "The Playbook" entry for all staff, the nested `/admin/playbook` layout rendering Rail 2 with server-side `canSeeItRoom`, and the index redirect sending authorized staff to the IT dashboard.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-08-17T21:44:00-04:00 (approx)
- **Completed:** 2026-08-17T21:48:06Z
- **Tasks:** 3
- **Files modified:** 3 (1 modified, 2 created)

## Accomplishments
- `app/(admin)/layout.tsx` now mounts `<PlaybookNavLink />` as the first Rail 1 nav item, outside the `isLeadership` block, visible to every staff role
- New `app/(admin)/playbook/layout.tsx` re-resolves the session/role server-side, computes `canSeeItRoom = role === 'leadership' || role === 'it'`, and renders `<Rail2 canSeeItRoom={...} />` beside `{children}` inside the existing `.fncon`/`ADMIN_CONSOLE_CSS` shell — no new theme provider
- New `app/(admin)/playbook/page.tsx` redirects `leadership`/`it` staff to `/admin/playbook/it/dashboard` and renders a minimal coming-soon landing for everyone else

## Task Commits

Each task was committed atomically:

1. **Task 1: Mount PlaybookNavLink as the first Rail 1 nav item (all staff)** - `f836b56` (feat)
2. **Task 2: Nested /admin/playbook layout — Rail 2 shell + server-side canSeeItRoom** - `09f3c14` (feat)
3. **Task 3: /admin/playbook index — redirect authorized staff to the IT dashboard** - `b39f1da` (feat)

## Files Created/Modified
- `app/(admin)/layout.tsx` - Imports and renders `<PlaybookNavLink />` as the first Rail 1 nav item, before the `isLeadership` block
- `app/(admin)/playbook/layout.tsx` - New nested layout: resolves role, computes `canSeeItRoom` server-side, renders `<Rail2>` beside page content with a pure-CSS `<1000px` container reflow
- `app/(admin)/playbook/page.tsx` - New index page: redirects authorized staff to the IT dashboard, shows a coming-soon landing otherwise

## Decisions Made
- Kept `canSeeItRoom` computation entirely inside the nested layout (not lifted into a shared helper) — it's a one-line boolean derived from `getStaffRole`, and the plan's threat model explicitly frames it as render-time visibility only, not an authority worth abstracting yet
- Implemented the UI-SPEC's `<1000px` responsive collapse as a small scoped `<style>` block on the layout's outer flex wrapper (Rail 2 + content stack to a single column) rather than modifying `Rail2.tsx`'s internal markup — `Rail2.tsx` is outside this plan's `files_modified` list (it shipped in 33-04); the deeper "hide sub-room lists below 1000px" treatment stays with whichever future plan owns Rail2.tsx's own polish
- The non-authorized landing on `/admin/playbook` uses plain Tailwind utility classes sized to the UI-SPEC's `.cwrap` dimensions (max-width 900px, matching padding) rather than declaring a new shared `.cwrap` CSS class — the shared content-chrome contract (top bar, crumb, access chip) belongs to the IT room pages built in later plans, not this coming-soon stub

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The double-sidebar Playbook shell is live under `/admin/playbook` for all three tasks' acceptance criteria (verified via `npx tsc --noEmit` per-file and grep checks)
- `/admin/playbook/it/dashboard` and the other 4 IT sub-pages do not exist yet — the index redirect target is correct per D-06/CONTEXT.md but will 404 until a later wave-2 plan (33-06/33-07/33-08) creates those routes; this is expected and in-scope for those plans, not a blocker here
- Manual UAT recommended once the IT dashboard route exists: confirm a non-it/non-leadership staff account sees Rail 2 with only the five ghosts and no IT room, and that the Rail 1 active-state (`bg-[color:var(--border)] text-[color:var(--ink)] font-semibold`) applies correctly when on any `/admin/playbook/*` path

---
*Phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1*
*Completed: 2026-08-17*
