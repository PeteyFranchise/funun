---
phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1
plan: 08
subsystem: ui
tags: [nextjs, react-server-components, observability, admin-dashboard, tailwind]

# Dependency graph
requires:
  - phase: 33-01
    provides: requireStaffPage(['leadership','it']) fail-closed page guard
  - phase: 33-04
    provides: ItRoomTopBar shared crumb/access-chip top bar, Playbook nav data
  - phase: 33-07
    provides: getDashboardHealth()/buildDigestTodayRow() live-signal core, StatusBanner, DigestPanel, ThresholdsPanel
provides:
  - VendorsGrid (10-cell vendor deep-link grid, site-critical marking)
  - QuickLinks (4-card "Jump to" panel)
  - /admin/playbook/it/dashboard — the bespoke Monitoring Dashboard opening page
affects: [phase-33-remaining-wave-2-plans, future-observability-dashboard-v2]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Playbook components reuse the admin .fncon wrapper's actual CSS tokens (--panel/--panel-2/--ink/--ink-2/--ink-3/--border/--indigo/--fuchsia/--green-fg) rather than the mockups' literal var names, except where UI-SPEC explicitly calls for the mockup's literal hex (rose #F43F5E, money #F4C77B)"
    - "Unconfirmed vendor URLs (VENDOR-DIRECTORY.md's [confirm] gaps) link to the internal Vendor Directory doc page instead of a fabricated external URL"

key-files:
  created:
    - components/playbook/VendorsGrid.tsx
    - components/playbook/QuickLinks.tsx
    - app/(admin)/playbook/it/dashboard/page.tsx
    - .planning/phases/33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1/deferred-items.md
  modified: []

key-decisions:
  - "VendorsGrid/QuickLinks use the .fncon token names (--panel-2/--ink-2/--ink-3/--border) rather than mirroring 33-07's StatusBanner/DigestPanel/ThresholdsPanel, which reference undefined --hair/--lavdim/--card2 custom properties (logged as a deferred item, not fixed — those files are outside this plan's scope)"
  - "DNS/Registrar and DocuSeal vendor cells link to the Vendor Directory doc page rather than a fabricated external dashboard URL, carrying forward VENDOR-DIRECTORY.md's own '[confirm]' caveat"
  - "Better Stack vendor cell links to betterstack.com (the vendor's own dashboard), matching every other vendor cell's own-dashboard convention, while the separate Uptime tile/panel and QuickLinks Status-page card link to the public funun.betteruptime.com status page"

patterns-established:
  - "Icon SVGs are inlined per-component (no shared sprite file) since no <symbol>/<use> sprite exists anywhere in the codebase yet"

requirements-completed: [PLAYBOOK-04, PLAYBOOK-07, PLAYBOOK-08, PLAYBOOK-09, PLAYBOOK-10]

coverage:
  - id: D1
    description: "VendorsGrid renders 10 real deep-link cells (GitHub excluded), Vercel/Supabase/DNS carry the site-critical rose dot, no fabricated URLs for the two VENDOR-DIRECTORY.md open-confirm vendors"
    requirement: "PLAYBOOK-10"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (clean) + manual grep for NEXT_PUBLIC_/SECRET/_KEY literals (none found)"
        status: pass
    human_judgment: false
  - id: D2
    description: "QuickLinks renders 4 'Jump to' cards; Status page card points to https://funun.betteruptime.com"
    requirement: "PLAYBOOK-10"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (clean); manual source read confirms href values"
        status: pass
    human_judgment: false
  - id: D3
    description: "Monitoring Dashboard page self-guards with requireStaffPage(['leadership','it']) BEFORE getDashboardHealth() (fail-closed ordering)"
    requirement: "PLAYBOOK-04"
    verification:
      - kind: other
        ref: "grep -n requireStaffPage|getDashboardHealth app/(admin)/playbook/it/dashboard/page.tsx (line 24 before line 26)"
        status: pass
    human_judgment: false
  - id: D4
    description: "App Health tile + StatusBanner driven by getDashboardHealth(); Uptime tile/panel are Better Stack link-outs with zero fabricated %/sparklines; Spend/Incidents carry honest v2/static badges"
    requirement: "PLAYBOOK-07"
    verification:
      - kind: other
        ref: "grep -c 'fetch(' app/(admin)/playbook/it/dashboard/page.tsx == 0; grep for 99.9%-style literal == none"
        status: pass
    human_judgment: true
    rationale: "Visual/live-data verification (healthy vs. degraded banner states, actual rendered layout) requires a running dev server + Supabase session, not available in this offline execution environment — deferred to the plan's own manual UAT step (forcing /api/health to 200 and 503)"
  - id: D5
    description: "ThresholdsPanel, VendorsGrid, DigestPanel, QuickLinks, and ItRoomTopBar (showLiveChip) are all composed on the dashboard page"
    requirement: "PLAYBOOK-08, PLAYBOOK-09"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (clean); source read of app/(admin)/playbook/it/dashboard/page.tsx"
        status: pass
    human_judgment: false

# Metrics
duration: 45min
completed: 2026-08-17
status: complete
---

# Phase 33 Plan 08: Monitoring Dashboard assembly — VendorsGrid, QuickLinks, dashboard page Summary

**Composed the bespoke Monitoring Dashboard opening page (live App Health tile/banner, Better Stack uptime link-out, real thresholds, a 10-vendor deep-link grid, a live digest row, and 4 quick-link cards) under its own D-02 inline guard.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 2
- **Files modified:** 3 new files (+ 1 deferred-items note)

## Accomplishments
- `VendorsGrid` — 10-cell 2-column vendor deep-link grid (GitHub excluded per UI-SPEC), Vercel/Supabase/DNS carry the site-critical rose dot, real dashboard URLs for 8 vendors, an honest internal-doc fallback (no fabricated URL) for the 2 VENDOR-DIRECTORY.md "[confirm]" gaps
- `QuickLinks` — 4 "Jump to" cards (Incident Runbook, Vendor Directory, Status page → funun.betteruptime.com, Operating Rhythm)
- `/admin/playbook/it/dashboard` page: `requireStaffPage(['leadership','it'])` runs before any health re-check (fail-closed, D-02); live App Health tile + StatusBanner from `getDashboardHealth()`; Uptime tile + panel replaced with Better Stack link-outs (no fabricated numbers, D-07); Spend/Incidents tiles carry honest v2/static badges; composes ThresholdsPanel, VendorsGrid, DigestPanel, QuickLinks, and ItRoomTopBar

## Task Commits

Each task was committed atomically:

1. **Task 1: VendorsGrid + QuickLinks** - `487f60a` (feat)
2. **Task 2: Monitoring Dashboard page** - `9fac06d` (feat)

_This plan's tasks were not TDD-flagged; no test-first commits required._

## Files Created/Modified
- `components/playbook/VendorsGrid.tsx` - 10-cell vendor deep-link grid with site-critical marking
- `components/playbook/QuickLinks.tsx` - 4-card "Jump to" panel
- `app/(admin)/playbook/it/dashboard/page.tsx` - the IT room's index page, self-guarded, composing all 33-07 + this plan's components
- `.planning/phases/33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1/deferred-items.md` - logs an out-of-scope CSS token discrepancy found in 33-07's components

## Decisions Made
- Used the admin `.fncon` wrapper's actual CSS custom-property names (`--panel`, `--panel-2`, `--ink`, `--ink-2`, `--ink-3`, `--border`, `--indigo`, `--fuchsia`, `--green-fg` — verified live in `components/admin/console-theme.ts` and already correctly used by `components/playbook/Rail2.tsx`/`ItRoomTopBar.tsx`) in both new components, rather than the mockup-literal names (`--hair`, `--lavdim`, `--card2`) that `StatusBanner.tsx`/`DigestPanel.tsx`/`ThresholdsPanel.tsx` (33-07) reference but that are not defined anywhere the Playbook actually renders. Per UI-SPEC's explicit "Existing tokens this phase must reuse... do not redeclare" instruction and the mapping table it provides.
- Rose/money colors use the mockup's literal hex directly (`#F43F5E`, `#F4C77B`) via Tailwind arbitrary values, per UI-SPEC's explicit instruction to not mutate the shared `ADMIN_CONSOLE_CSS` token block.
- Better Stack's vendor-grid cell links to `betterstack.com` (the vendor's own dashboard, matching every other vendor cell's convention), while the Uptime tile/panel and the QuickLinks "Status page" card link to the public `funun.betteruptime.com` status page — two different, both-real URLs for the same vendor, matching their different purposes (internal ops dashboard vs. public status page).

## Deviations from Plan

### Auto-fixed Issues

None — no bugs, missing critical functionality, or blocking issues were found in this plan's own new code.

### Logged, not auto-fixed (out of scope)

**1. [Scope Boundary] CSS custom-property mismatch in 33-07's already-shipped Playbook components**
- **Found during:** Task 1/2 implementation (checking which CSS tokens actually resolve inside the `.fncon` wrapper)
- **Issue:** `StatusBanner.tsx`, `DigestPanel.tsx`, `ThresholdsPanel.tsx` reference `var(--hair)`/`var(--lavdim)`/`var(--card2)`, which are not defined anywhere the Playbook renders (only `--card`/`--lav` happen to resolve, via `app/globals.css`'s unrelated `:root` declarations)
- **Why not fixed:** these three files are not in this plan's `files_modified` list; per the executor's Scope Boundary rule, pre-existing issues in unrelated files are logged, not fixed
- **Logged in:** `.planning/phases/33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1/deferred-items.md`

---

**Total deviations:** 0 auto-fixed; 1 logged as an out-of-scope deferred item.
**Impact on plan:** None on this plan's own deliverables — both new components use the correct token names throughout, verified against `Rail2.tsx`/`ItRoomTopBar.tsx`'s established (correct) precedent.

## Issues Encountered
- `app/(admin)/playbook/layout.tsx` and the other IT-room doc pages do not yet exist in this worktree (they are the responsibility of sibling wave-2 plans running in parallel worktrees) — this plan's dashboard page was built to stand alone under the existing `.fncon` admin layout and does not depend on any file this plan doesn't itself create. No blocker; expected given wave-2 parallel execution.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The Monitoring Dashboard page is complete and self-contained; it will render correctly once the sibling wave-2 Playbook shell/layout plan(s) land (`app/(admin)/playbook/layout.tsx`, `app/(admin)/playbook/page.tsx`) and merge in the same wave.
- Manual UAT (forcing `/api/health` to 200 and 503 to visually confirm the healthy/degraded banner and tile states) is deferred to a live environment — not executable in this offline worktree.
- The deferred CSS-token item (`deferred-items.md`) is a candidate for a small fix-forward patch in a future plan.

---
*Phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1*
*Completed: 2026-08-17*

## Self-Check: PASSED

- FOUND: components/playbook/VendorsGrid.tsx
- FOUND: components/playbook/QuickLinks.tsx
- FOUND: app/(admin)/playbook/it/dashboard/page.tsx
- FOUND commit: 487f60a
- FOUND commit: 9fac06d
