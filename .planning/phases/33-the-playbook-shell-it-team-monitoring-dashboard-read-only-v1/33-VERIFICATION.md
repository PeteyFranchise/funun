---
phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1
verified: 2026-08-18T02:09:31Z
status: passed
score: 27/27 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 33: The Playbook shell + IT Team monitoring dashboard (read-only v1) Verification Report

**Phase Goal:** Introduce The Playbook as a new internal Team-Member admin surface using a double-sidebar nav — a "The Playbook" item on the main admin sidebar (visible to all staff) opens a secondary sidebar of rooms/sub-rooms. Ship the IT Team room read-only: render the existing `docs/observability/` docs as pages, with a live single-pane Monitoring Dashboard as its opening page — READ-ONLY, role-gated to leadership + the new `it` StaffRole.

**Verified:** 2026-08-18T02:09:31Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (merged across all 8 plans' `must_haves.truths`, cross-checked against ROADMAP goal + Scope Boundary)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `getStaffRole({app_metadata:{staff_role:'it'}})` returns `'it'` | ✓ VERIFIED | `lib/admin/staff-role.ts:27-47`; test `staff-role-it.test.ts` passes ("returns it for app_metadata.staff_role = it") |
| 2 | `ALL_STAFF_ROLES` contains `it` and still contains leadership/ae/bd/anr | ✓ VERIFIED | `lib/admin/staff-role.ts:29` `['leadership','ae','bd','anr','it']`; test asserts length 5 + all 5 members |
| 3 | `requireStaffPage(['leadership','it'])` returns `{user,staffRole}` for it/leadership and redirects everyone else (fail closed) | ✓ VERIFIED | `lib/admin/gate.ts:66-77`; behavioral tests: it-caller passes, leadership-caller passes, ae-caller redirects to `/`, no-session redirects to `/signin` — all 4 pass in `staff-role-it.test.ts` |
| 4 | `is_admin=true` still resolves to `'leadership'` (owner bootstrap unaffected) | ✓ VERIFIED | `lib/admin/staff-role.ts:45`; test "returns leadership when is_admin === true" passes |
| 5 | Migration 114 widens `funun_staff.staff_role` CHECK to `('leadership','ae','bd','anr','it')`, owner-run, decoupled from code verification | ✓ VERIFIED | `supabase/migrations/114_it_staff_role.sql:49-52`; mirrors 108_anr_staff_role.sql exactly; not applied (by design — see Known Context below), does not block any of the above |
| 6 | `readObservabilityDoc('RUNBOOK.md')` returns the file's markdown string; missing file throws descriptively | ✓ VERIFIED | `lib/playbook/read-doc.ts:23-34`; test `playbook-read-doc.test.ts` passes |
| 7 | `MarkdownDoc` renders via react-markdown + remark-gfm through a components map (no raw-HTML injection) | ✓ VERIFIED | `components/playbook/MarkdownDoc.tsx` — `ReactMarkdown` + `remarkGfm` + `markdownComponents`; no `dangerouslySetInnerHTML` anywhere in `lib/playbook/` or `components/playbook/` (grep confirmed) |
| 8 | `next.config.mjs outputFileTracingIncludes` ships `docs/observability/**` into the deployed bundle, verified against `.next/server/**/*.nft.json` | ✓ VERIFIED | `next.config.mjs:20-23`; live build artifact `.next/server/app/(admin)/playbook/it/{vendor-directory,runbook,operating-rhythm}/page.js.nft.json` exists (re-verified by this run, fresh build post-dating last source edit) |
| 9 | `nav.ts` is the single source for the 6 Rail-2 rooms (5 ghosts + role-conditional IT room) and 5 ordered IT sub-pages | ✓ VERIFIED | `lib/playbook/nav.ts:20-27` (`PLAYBOOK_ROOMS`), `:44-50` (`IT_SUBPAGES`); test `playbook-nav.test.ts` passes |
| 10 | `nav.ts` maps the 4 doc pages to their exact `docs/observability` filenames (D-10) | ✓ VERIFIED | `lib/playbook/nav.ts:55-60` `DOC_PAGE_FILE`; matches D-10 exactly; test `playbook-docs-render.test.ts` asserts the exact map and resolves non-empty content for all 4 |
| 11 | `Rail2` renders IT room row only when `canSeeItRoom` is true; 5 non-IT rooms always render as inert ghosts | ✓ VERIFIED | `components/playbook/Rail2.tsx:50-60` (`if (room.itGated) { if (!canSeeItRoom) return null ... }`); `GhostRoom` renders a `<div>` (not `<a>`/`<button>`, no tabindex) |
| 12 | `PlaybookNavLink` is active when path starts with `/admin/playbook` | ✓ VERIFIED | `components/playbook/PlaybookNavLink.tsx:20-21` |
| 13 | Rail 1 shows "The Playbook" link to ALL staff, first nav item, outside the isLeadership block | ✓ VERIFIED | `app/(admin)/layout.tsx:46-51` — `<PlaybookNavLink />` sits before `{isLeadership && (...)}`, with an explicit comment confirming the placement |
| 14 | `/admin/playbook` renders Rail 2 (double-sidebar) inside the existing admin shell | ✓ VERIFIED | `app/(admin)/playbook/layout.tsx:49-58` — `.pb-shell` renders `<Rail2>` beside `{children}` |
| 15 | Nested layout computes `canSeeItRoom = role is leadership or it`, server-side, passed to Rail2 | ✓ VERIFIED | `app/(admin)/playbook/layout.tsx:46-47` |
| 16 | `/admin/playbook` redirects leadership/it to `/admin/playbook/it/dashboard`; other staff see coming-soon landing | ✓ VERIFIED | `app/(admin)/playbook/page.tsx:20-22` |
| 17 | Each of the 4 doc pages calls `requireStaffPage(['leadership','it'])` BEFORE reading any doc content (fail closed) | ✓ VERIFIED | Read all 4 page files directly — `requireStaffPage()` is the literal first statement in each function body, `readObservabilityDoc()` called only after; textually precedes in vendor-directory, runbook, operating-rhythm, thresholds pages |
| 18 | Each doc page renders its `docs/observability/*.md` source via MarkdownDoc | ✓ VERIFIED | Same 4 files — each calls `MarkdownDoc` with the result of `readObservabilityDoc(DOC_PAGE_FILE[slug])` |
| 19 | Page-to-file map matches D-10 exactly | ✓ VERIFIED | Confirmed by direct read of all 4 pages + `nav.ts` + docs directory listing (`VENDOR-DIRECTORY.md`, `RUNBOOK.md`, `OPERATING-RHYTHM.md`, `THRESHOLDS-AND-SEVERITY.md` all exist) |
| 20 | `getDashboardHealth()` re-checks `/api/health` in-process, returns healthy/degraded/unknown, never throws | ✓ VERIFIED | `lib/playbook/digest.ts:23-31` — `import { GET as checkHealth }`, try/catch → `'unknown'` on exception |
| 21 | `buildDigestTodayRow(status)` is pure, classifies via `classifyThreshold`, does not send email | ✓ VERIFIED | `lib/playbook/digest.ts:61-68` — no I/O, no email import anywhere in `digest.ts` (grep confirmed no `fanOutAlert`/`resend` reference) |
| 22 | `StatusBanner` renders 3 states: healthy (emerald pulsing), degraded (rose steady), unknown (rose steady, "treat as degraded") | ✓ VERIFIED | `components/playbook/StatusBanner.tsx:21-65`; behavioral test `playbook-status-banner.test.tsx` passes for all 3 states |
| 23 | `ThresholdsPanel` renders exactly 7 rows from THRESHOLDS, excluding `monthly_spend_usd` and `uptime_consecutive_failures` | ✓ VERIFIED | `components/playbook/ThresholdsPanel.tsx:13-21` — 7-row explicit allowlist; test `playbook-thresholds-panel.test.tsx` passes |
| 24 | Dashboard page calls `requireStaffPage(['leadership','it'])` BEFORE any health re-check/render | ✓ VERIFIED | `app/(admin)/playbook/it/dashboard/page.tsx:24-26` — guard is literal first statement, `getDashboardHealth()` called after |
| 25 | App Health tile + global status banner reflect the live in-process `/api/health` re-check | ✓ VERIFIED | `app/(admin)/playbook/it/dashboard/page.tsx:26-27,38,43-50` |
| 26 | Uptime tile/panel are a Better Stack link-out to `https://funun.betteruptime.com` — no fabricated %s/sparklines | ✓ VERIFIED | `app/(admin)/playbook/it/dashboard/page.tsx:52-62,82-114` — link-out only, "No live per-route data in v1" copy, no percentage/sparkline markup found |
| 27 | `VendorsGrid` has 10 cells with real deep-links; site-critical vendors carry the rose dot | ✓ VERIFIED | `components/playbook/VendorsGrid.tsx:27-55` — 10 entries; Vercel/Supabase/DNS all `dot:'crit'` → `bg-[#F43F5E]` (rose) |

**Score:** 27/27 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/admin/staff-role.ts` | `it` StaffRole added | ✓ VERIFIED | Union + ALL_STAFF_ROLES + getStaffRole branch, wired |
| `lib/admin/gate.ts` | `requireStaffPage()` export | ✓ VERIFIED | New export, distinct redirect-based shape from `requireStaff()` |
| `__tests__/staff-role-it.test.ts` | Wave-0 lock test | ✓ VERIFIED | 9 tests, all pass |
| `supabase/migrations/114_it_staff_role.sql` | Owner-run CHECK widen | ✓ VERIFIED | Present, mirrors 108 template; unapplied by design (see below) |
| `lib/playbook/read-doc.ts` | Fail-fast doc reader | ✓ VERIFIED | Wired, tested |
| `lib/playbook/markdown-components.tsx` | react-markdown components map | ✓ VERIFIED | Uses real `.fncon` tokens (--ink/--ink-2/--ink-3/--border/--panel/--panel-2/--indigo), not mockup aliases |
| `components/playbook/MarkdownDoc.tsx` | RSC markdown wrapper | ✓ VERIFIED | Server Component, no client JS |
| `next.config.mjs` | `outputFileTracingIncludes` entry | ✓ VERIFIED | Present, build-trace confirmed against live `.nft.json` output |
| `lib/playbook/nav.ts` | Room/sub-page/doc-file source | ✓ VERIFIED | Matches D-05/D-06/D-10 exactly |
| `components/playbook/PlaybookNavLink.tsx` | Rail 1 active link | ✓ VERIFIED | Wired into `app/(admin)/layout.tsx` |
| `components/playbook/Rail2.tsx` | Room list w/ ghosts + IT room | ✓ VERIFIED | DOM-omission (not locked/greyed) confirmed |
| `components/playbook/ItRoomTopBar.tsx` | Shared crumb + access chip | ✓ VERIFIED | Used identically on all 5 IT-room pages |
| `app/(admin)/layout.tsx` | Rail 1 entry mount | ✓ VERIFIED | `<PlaybookNavLink />` outside isLeadership block, first item |
| `app/(admin)/playbook/layout.tsx` | Nested Rail-2 layout | ✓ VERIFIED | Resolves role independently, passes `canSeeItRoom` |
| `app/(admin)/playbook/page.tsx` | Index redirect / coming-soon | ✓ VERIFIED | Redirects authorized staff; coming-soon copy for others |
| `app/(admin)/playbook/it/{vendor-directory,runbook,operating-rhythm,thresholds}/page.tsx` | 4 doc pages | ✓ VERIFIED (×4) | Each self-guards then renders via MarkdownDoc |
| `lib/playbook/digest.ts` | Health re-check + digest row | ✓ VERIFIED | In-process import, no self-HTTP, no email |
| `components/playbook/StatusBanner.tsx` | 3-state banner | ✓ VERIFIED | Tested |
| `components/playbook/DigestPanel.tsx` | Digest today-row | ✓ VERIFIED | Renders `buildDigestTodayRow()`; see Anti-Patterns for a cosmetic token issue |
| `components/playbook/ThresholdsPanel.tsx` | 7-row thresholds table | ✓ VERIFIED | Tested; see Anti-Patterns for a cosmetic token issue |
| `components/playbook/VendorsGrid.tsx` | 10-cell vendor grid | ✓ VERIFIED | Uses correct `.fncon` tokens |
| `components/playbook/QuickLinks.tsx` | 4-card jump-to panel | ✓ VERIFIED | Uses correct `.fncon` tokens |
| `app/(admin)/playbook/it/dashboard/page.tsx` | Monitoring Dashboard | ✓ VERIFIED | Guard-first, composes all live-signal + reference components |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `requireStaffPage()` | `getStaffRole()` | single authority read of `app_metadata.staff_role` | ✓ WIRED | `lib/admin/gate.ts:66-77` |
| Migration 114 CHECK | `lib/admin/staff-role.ts` StaffRole union | DB display-copy kept in sync | ✓ WIRED | Both list `('leadership','ae','bd','anr','it')` |
| `MarkdownDoc` | `markdownComponents` map | element-level styling | ✓ WIRED | `components/playbook/MarkdownDoc.tsx:18` |
| `read-doc.ts` fs read | `next.config.mjs outputFileTracingIncludes` | deploy-time bundling | ✓ WIRED | Confirmed via live `.nft.json` build artifacts containing `docs/observability` paths |
| `nav.ts IT_SUBPAGES` | 5 route segments under `/admin/playbook/it/*` | href match | ✓ WIRED | All 5 hrefs match actual route files that exist |
| `nav.ts DOC_PAGE_FILE` | `docs/observability/*.md` | filename match | ✓ WIRED | All 4 referenced files exist on disk |
| `playbook/layout.tsx getStaffRole(user)` | `canSeeItRoom` → `Rail2` prop | render-time visibility | ✓ WIRED | `app/(admin)/playbook/layout.tsx:46-53` |
| `PlaybookNavLink` | `app/(admin)/layout.tsx` Rail 1 | all staff | ✓ WIRED | Mounted, confirmed by grep |
| Doc page | `requireStaffPage` (33-01) before `readObservabilityDoc()` | fail closed | ✓ WIRED (×4) | Confirmed by direct file read on all 4 pages |
| Dashboard page | `requireStaffPage` before `getDashboardHealth` | fail closed | ✓ WIRED | `app/(admin)/playbook/it/dashboard/page.tsx:24-26` |
| Dashboard page | `StatusBanner`/`DigestPanel`/`ThresholdsPanel`/`VendorsGrid`/`QuickLinks`/`ItRoomTopBar` | composition | ✓ WIRED | All imported and rendered |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| Dashboard page | `health` | `getDashboardHealth()` → in-process `checkHealth()` → `/api/health` route's own logic | Yes | ✓ FLOWING |
| `StatusBanner` | `status` prop | passed from dashboard page's live `health` | Yes | ✓ FLOWING |
| `DigestPanel` | `status` prop → `buildDigestTodayRow()` | same live `health` value | Yes | ✓ FLOWING |
| `ThresholdsPanel` | `THRESHOLDS[metric]` | `lib/observability/config.ts` real config values | Yes | ✓ FLOWING |
| Doc pages | `md` | `readObservabilityDoc()` → real `.md` file content, verified non-empty by test | Yes | ✓ FLOWING |
| `VendorsGrid`/`QuickLinks` | static array | hardcoded, correctly labeled as static deep-links (not claimed live) | N/A (by design) | ✓ FLOWING (honest static) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All Playbook Wave-0 tests pass | `npx jest __tests__/staff-role-it.test.ts __tests__/playbook-read-doc.test.ts __tests__/playbook-nav.test.ts __tests__/playbook-docs-render.test.ts __tests__/playbook-digest.test.ts __tests__/playbook-status-banner.test.tsx __tests__/playbook-thresholds-panel.test.tsx` | 7 suites / 46 tests passed | ✓ PASS |
| Project-wide typecheck passes with the widened `StaffRole` union | `npx tsc --noEmit -p tsconfig.json` | No output (clean) | ✓ PASS |
| Production build's file trace includes `docs/observability/**` for the IT-room routes | `find .next -name "*.nft.json" \| xargs grep -l "docs/observability"` | 4 matching `.nft.json` files (one per doc route) | ✓ PASS |
| Build is fresh (post-dates last Playbook source commit) | `.next/BUILD_ID` mtime vs. last commit touching `app/(admin)/playbook` | Build generated same second as last commit | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|-------------|--------|----------|
| PLAYBOOK-01 | 33-01, 33-02 | `it` StaffRole + owner-run migration 114 | ✓ SATISFIED | Code path recognizes `it` without the migration applied, as designed |
| PLAYBOOK-02 | 33-04, 33-05 | Rail 1 "The Playbook" entry, all staff | ✓ SATISFIED | Confirmed live in `app/(admin)/layout.tsx` |
| PLAYBOOK-03 | 33-04, 33-05 | Rail 2 double-sidebar, 6 rooms, role-conditional IT room | ✓ SATISFIED | `Rail2.tsx` + `nav.ts` match exactly |
| PLAYBOOK-04 | 33-01, 33-06, 33-08 | Every IT-room page self-guards inline before any content read | ✓ SATISFIED | All 5 pages confirmed |
| PLAYBOOK-05 | 33-03, 33-06 | 4 doc pages render from `.md` via react-markdown/remark-gfm | ✓ SATISFIED | Confirmed, no raw-HTML injection |
| PLAYBOOK-06 | 33-03, 33-06 | `outputFileTracingIncludes` ships docs into deployed bundle | ✓ SATISFIED | Build-trace confirmed against live `.nft.json` |
| PLAYBOOK-07 | 33-07, 33-08 | Live App Health tile + global status banner | ✓ SATISFIED | In-process re-check confirmed |
| PLAYBOOK-08 | 33-07, 33-08 | One live daily-digest "today" row, no email sent | ✓ SATISFIED | `digest.ts` has no email/alert-fanout import |
| PLAYBOOK-09 | 33-07, 33-08 | Real-values thresholds panel, 7-row allowlist, v2 badge on readings | ✓ SATISFIED | Confirmed and tested |
| PLAYBOOK-10 | 33-08 | Better Stack link-out, vendors grid, v2-badged placeholders | ✓ SATISFIED | Confirmed |

**Tracking-format gap (reported per task instructions, not a gap in implementation):** `.planning/REQUIREMENTS.md` lists PLAYBOOK-01..10 in a coverage table with status **"Planned"** for all 10 IDs — there is no `- [ ]`/`- [x]` checkbox markup for this phase's requirements to flip to "done," and the coverage table was not updated after execution. All 10 requirements are satisfied in code (see above); this is a documentation/tracking gap only, not a functional gap. Recommend a follow-up edit to REQUIREMENTS.md's coverage table (rows 700-709) to mark PLAYBOOK-01..10 as "Shipped"/"Complete" per whatever convention the table otherwise uses, so the table doesn't misrepresent phase status to future readers.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `components/playbook/StatusBanner.tsx`, `DigestPanel.tsx`, `ThresholdsPanel.tsx` | multiple | Reference undefined CSS custom properties `--hair`, `--lavdim`, `--card2` (mockup-alias names) instead of the real `.fncon` tokens (`--border`, `--ink-3`, `--panel-2`) that `markdown-components.tsx`, `VendorsGrid.tsx`, `QuickLinks.tsx`, `Rail2.tsx`, and `ItRoomTopBar.tsx` all correctly use | ⚠️ Warning | Cosmetic-only in the default dark theme (`--card` happens to numerically equal `--panel`'s dark value at `:root` in `app/globals.css`, and `color` is an inherited CSS property so `--lavdim`-styled text inherits the ambient `--ink` color rather than rendering illegibly). **Confirmed NOT cosmetic-only in the admin console's opt-in light theme** (`lib/admin/theme.ts`/`AdminThemeToggle` — light mode is a real, user-reachable toggle): `--card`'s dark hardcoded value (`#0e0d1e`) has no light-theme override in `app/globals.css`, so `ThresholdsPanel`/`DigestPanel` would render a dark near-black background against an otherwise light-themed page for a leadership/it staffer who has switched to light mode. No functional/access-control impact — this is a rendering-fidelity defect, already self-identified and logged by the executor in `deferred-items.md` with a specific 3-line fix (`--hair`→`--border`, `--lavdim`→`--ink-3`, `--card2`→`--panel-2`) explicitly out of scope for 33-08's file set. Does not block the phase goal (a working, gated, read-only IT room + live dashboard) but should be fixed promptly since it is currently visible to any staffer using light mode. |

No debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) found in any Phase 33 file. The only "coming soon" occurrences are the intentional D-05 ghost-room copy, not implementation debt.

### Human Verification Required

None required to reach a `passed` verdict — all must-haves have direct code/test evidence. The following is optional but recommended manual confirmation, not blocking:

1. **Light-theme visual check on ThresholdsPanel/DigestPanel**
   **Test:** As a leadership/it staffer, toggle the admin console to light theme (`AdminThemeToggle`) and open `/admin/playbook/it/dashboard`.
   **Expected:** ThresholdsPanel and DigestPanel should visually match the light theme (light background, readable secondary text).
   **Why human:** Confirms the severity/visual impact of the CSS custom-property gap documented above; grep/static analysis can identify the undefined properties but not the rendered visual result.

### Deferred Items (from `deferred-items.md`, informational only)

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | CSS custom-property mismatch in 33-07's StatusBanner/DigestPanel/ThresholdsPanel | Suggested follow-up fix-forward plan (not yet scheduled to a numbered phase) | `deferred-items.md` — logged by executor per Scope Boundary rule; assessed above as cosmetic-only in default dark theme, real-but-non-blocking in opt-in light theme |

### Gaps Summary

None. All 27 derived must-have truths across the 8 plans are verified against the actual codebase (not SUMMARY claims): the `it` StaffRole and `requireStaffPage()` primitives are implemented and behaviorally tested; migration 114 is correctly authored and — per D-01/D-02's explicit design — decoupled from code verification (its non-application is not a failure); the double-sidebar shell (Rail 1 entry + Rail 2 rooms, ghosts, role-conditional IT room) is wired end-to-end; all 4 doc pages self-guard before reading, render from the real `.md` files via a safe markdown pipeline, and are backed by a build-trace-verified `outputFileTracingIncludes` entry; the Monitoring Dashboard self-guards first, then composes a live in-process health signal, a real-values thresholds table, a 10-cell vendor grid with correct site-critical marking, and honestly-badged v2 placeholders with no fabricated live numbers (the one explicit honesty constraint from CONTEXT.md). All 7 Playbook-related Jest test suites (46 tests) pass, and `tsc --noEmit` is clean across the whole project. One cosmetic CSS-token defect (self-identified by the executor, isolated to 3 files, non-blocking, already has a scoped fix documented) and one documentation-tracking gap in REQUIREMENTS.md's coverage table (rows not marked complete) are noted as warnings but do not block phase completion.

---

_Verified: 2026-08-18T02:09:31Z_
_Verifier: Claude (gsd-verifier)_
