---
phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1
plan: 06
subsystem: ui
tags: [nextjs, react, typescript, jest, playbook, admin-nav, markdown]

# Dependency graph
requires:
  - "lib/admin/gate.ts requireStaffPage() (33-01)"
  - "lib/playbook/read-doc.ts + components/playbook/MarkdownDoc.tsx (33-03)"
  - "lib/playbook/nav.ts DOC_PAGE_FILE / IT_SUBPAGES (33-04)"
  - "components/playbook/ItRoomTopBar.tsx (33-04)"
provides:
  - "4 IT-room doc pages: /admin/playbook/it/{vendor-directory,runbook,operating-rhythm,thresholds}"
affects: ["33-05 (shell layout — Rail 2 IT sub-nav links to these routes)", "33-08 (Monitoring Dashboard, sibling IT-room page)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Page-level fail-closed guard: requireStaffPage(['leadership','it']) as the first statement, always before any content read"
    - "Filename resolved from DOC_PAGE_FILE (nav.ts) keyed by slug, never a hardcoded string literal per page"

key-files:
  created:
    - app/(admin)/playbook/it/vendor-directory/page.tsx
    - app/(admin)/playbook/it/runbook/page.tsx
    - app/(admin)/playbook/it/operating-rhythm/page.tsx
    - app/(admin)/playbook/it/thresholds/page.tsx
    - __tests__/playbook-docs-render.test.ts
  modified: []

key-decisions:
  - "Each page's crumb label is pulled from IT_SUBPAGES (nav.ts) by slug lookup rather than a second hardcoded label string, keeping nav.ts the single source for page labels as well as filenames"
  - "No page title extraction/special-casing — the .md file's own leading '# Title' + first paragraph render as h1/lede via markdownComponents styling, per UI-SPEC 'Page title simplification'"

requirements-completed: [PLAYBOOK-04, PLAYBOOK-05, PLAYBOOK-06]

coverage:
  - id: D1
    description: "All 4 doc pages exist under app/(admin)/playbook/it/ and each calls requireStaffPage(['leadership','it']) before readObservabilityDoc()"
    requirement: "PLAYBOOK-04"
    verification:
      - kind: other
        ref: "grep -n \"requireStaffPage|readObservabilityDoc\" on all 4 page files — guard call precedes the read call in every file (line 16 vs line 18)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each page reads its filename from DOC_PAGE_FILE (nav.ts), never a hardcoded literal; no page passes ALL_STAFF_ROLES"
    requirement: "PLAYBOOK-04"
    verification:
      - kind: other
        ref: "grep -n ALL_STAFF_ROLES on all 4 page files — zero live-code matches (only in a code comment)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The 4 pages render their docs/observability/*.md source via MarkdownDoc inside the UI-SPEC 900px container — the .md stays the single source of truth"
    requirement: "PLAYBOOK-05"
    verification:
      - kind: unit
        ref: "__tests__/playbook-docs-render.test.ts (DOC_PAGE_FILE map + readObservabilityDoc content resolution)"
        status: pass
    human_judgment: true
    rationale: "Full RSC render + visual container/typography check needs a rendered browser pass with a real leadership/it session (33-05's layout wires these routes into the shell) — no isolated RSC render test exists for these Server Components in this repo's suite."
  - id: D4
    description: "The D-10 page-to-file map (vendor-directory=VENDOR-DIRECTORY.md, runbook=RUNBOOK.md, operating-rhythm=OPERATING-RHYTHM.md, thresholds=THRESHOLDS-AND-SEVERITY.md) is locked by an automated test"
    requirement: "PLAYBOOK-06"
    verification:
      - kind: unit
        ref: "__tests__/playbook-docs-render.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "npx tsc --noEmit reports no new errors from the 4 page files"
    requirement: "PLAYBOOK-04"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (clean, zero output)"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-08-18
status: complete
---

# Phase 33 Plan 06: IT-room doc pages Summary

**The 4 remaining IT-room pages — Vendor Directory, Incident Runbook, Operating Rhythm, Thresholds & Severity — each a Server Component that self-guards to leadership+it before reading and rendering its `docs/observability/*.md` source via `MarkdownDoc`, locked to the D-10 filename map by a new Wave 0 test.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-18T01:35:00Z (approx)
- **Completed:** 2026-08-18T01:47:11Z
- **Tasks:** 2 completed
- **Files modified:** 5 (all new)

## Accomplishments
- 4 doc pages under `app/(admin)/playbook/it/{vendor-directory,runbook,operating-rhythm,thresholds}/page.tsx`, each: guards first (`requireStaffPage(['leadership','it'])`), renders `ItRoomTopBar` (no Live chip), reads its filename via `DOC_PAGE_FILE[slug]` (nav.ts), and renders the markdown through `MarkdownDoc`
- `__tests__/playbook-docs-render.test.ts` — Wave 0 test locking the D-10 page-to-file map (`toEqual` on `DOC_PAGE_FILE`) plus a parameterized content-resolution check across all 4 real docs, importing the pages' actual wiring (`DOC_PAGE_FILE` + `readObservabilityDoc`), not a duplicate map
- Verified via grep on all 4 files: the guard call textually precedes the read call, and no page passes `ALL_STAFF_ROLES`

## Task Commits

1. **Task 1: 4 IT doc pages** — `d2a39ad` (feat)
2. **Task 2: Wave 0 render test** — `4ae49b4` (test)

## Files Created/Modified
- `app/(admin)/playbook/it/vendor-directory/page.tsx` - guard → top bar → `readObservabilityDoc('VENDOR-DIRECTORY.md')` → `MarkdownDoc`
- `app/(admin)/playbook/it/runbook/page.tsx` - guard → top bar → `readObservabilityDoc('RUNBOOK.md')` → `MarkdownDoc`
- `app/(admin)/playbook/it/operating-rhythm/page.tsx` - guard → top bar → `readObservabilityDoc('OPERATING-RHYTHM.md')` → `MarkdownDoc`
- `app/(admin)/playbook/it/thresholds/page.tsx` - guard → top bar → `readObservabilityDoc('THRESHOLDS-AND-SEVERITY.md')` → `MarkdownDoc`
- `__tests__/playbook-docs-render.test.ts` - D-10 map assertion + 4 content-resolution checks (5 tests, all pass)

## Decisions Made
- Pulled each page's `ItRoomTopBar` crumb label from `IT_SUBPAGES.find(...)` in `nav.ts` rather than a second hardcoded string, so nav.ts stays the single source for both filenames and display labels.
- No markdown title-extraction logic added — relied entirely on `markdownComponents`' existing h1/p styling (already built in 33-03) to satisfy the UI-SPEC's "Page title simplification" contract, since the source `.md` files already open with `# Title` + a descriptive paragraph.

## Deviations from Plan

None - plan executed exactly as written. `app/(admin)/playbook/layout.tsx` and `app/(admin)/playbook/it/dashboard/page.tsx` (33-05/33-08, sibling Wave 2 plans) do not yet exist in this worktree at time of execution — this is expected per the plan's dependency scope (only 33-01/33-03/33-04 are prerequisites) and does not block these 4 pages, which have no import dependency on the layout or the dashboard page.

## Issues Encountered
None.

## Next Phase Readiness
- All 4 doc pages are ready to be linked from Rail 2's IT sub-nav once 33-05's shell layout merges.
- Manual UAT (an `it`/`leadership` account sees rendered doc content; an `ae`/`bd` account is redirected away from `/admin/playbook/it/*`) still needs to run against the merged shell — not exercisable in isolation without the layout route wiring.

---
*Phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1*
*Completed: 2026-08-18*

## Self-Check: PASSED

All 6 created files verified present on disk (4 IT-room page.tsx files,
`__tests__/playbook-docs-render.test.ts`, this SUMMARY.md). All 3 task/doc
commits verified present in `git log` (`d2a39ad`, `4ae49b4`, `30051c3`).
`npx jest __tests__/playbook-docs-render.test.ts` and `npx tsc --noEmit`
both pass clean.
