---
phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
plan: 08
subsystem: ui
tags: [dnd-kit, nextjs, supabase, cookie-persistence, team-console]

requires:
  - phase: 31-04
    provides: migration 111 (selects/selects_tracks/selects_reactions schema)
  - phase: 31-06
    provides: migration 112 (buyer_org_contacts, client_relationship_log, buyer_orgs.website)
  - phase: 31-07
    provides: buyer_briefs read access pattern + own-book scoping precedent (lib/staff/scope.ts, lib/admin/gate.ts)
provides:
  - "lib/client-partners/columns.ts — the shared column contract (COMPANIES_COLUMNS/CLIENTS_COLUMNS, pure sortRows with stable identity tiebreak, DEFAULT_SORT) the 31.1 leadership tower will import unfiltered"
  - "components/admin/ClientPartnersList.tsx — list-source-agnostic list+tabs+insight-columns component (rows + drill-in href builder in)"
  - "Rebuilt My Client Partners page reading own-book-scoped orgs/contacts enriched with Open briefs/Active Selects/Contacts counts"
  - "R5 nav gating (documented) + Crate Requests/Selects nav entries in funnel order"
affects: [31-09, 31-10, 31-11, "31.1 (Client Partners leadership tower)"]

tech-stack:
  added: []
  patterns:
    - "Column model as a pure lib module (defs + sortRows), separate from the rendering component — mirrors lib/crate-requests/ranking.ts's pure-module convention"
    - "Per-AE UI-state persistence via a client-set document.cookie, same mechanism as AdminThemeToggle.tsx (no server round-trip needed since there's no SSR-flash concern for column order)"
    - "Columns popover combines show/hide + drag-reorder in ONE sortable list (identity column excluded entirely, not just disabled) rather than making table headers themselves draggable"

key-files:
  created:
    - lib/client-partners/columns.ts
    - lib/client-partners/columns.test.ts
    - components/admin/ClientPartnersList.tsx
  modified:
    - app/(admin)/admin/my-client-partners/page.tsx
    - app/(admin)/layout.tsx

key-decisions:
  - "Identity tiebreak for sortRows is (name lowercase, then id) — documented, deterministic, independent of input array order (R2 backstop)"
  - "Columns not sourced by 31-04/31-06/31-07 (health computation, days-in-stage config, open deal, lifetime value, client-level briefs/selects-seen/deals) render the column model's defined no-data state (dash/muted-zero) rather than a fabricated value — those are explicitly R3/R6/R7/deals-room work deferred to 31.1"
  - "Leadership's My Client Partners view keeps the existing leadership-sees-all read path unchanged (no ae_user_id filter) — the true hold-queue (unassigned + coverage) variant is 31.1, not built here"
  - "Clients-tab rows source from buyer_org_contacts (the CRM-lite people layer, 31-06) scoped to the AE's own-book org ids, not from buyer auth users — contacts are CRM records, independent of any buyer login"

requirements-completed: [R1, R2, R5, A1]

coverage:
  - id: D1
    description: "Column model: 12 Companies / 10 Clients column defs, pinned isIdentity first, pure sortRows with a stable identity tiebreak, DEFAULT_SORT = Next action overdue-first"
    requirement: "R2"
    verification:
      - kind: unit
        ref: "lib/client-partners/columns.test.ts#sortRows stability — R2 backstop"
        status: pass
      - kind: unit
        ref: "lib/client-partners/columns.test.ts#COMPANIES_COLUMNS / CLIENTS_COLUMNS"
        status: pass
    human_judgment: false
  - id: D2
    description: "ClientPartnersList: Clients/Companies pill tabs, Columns popover (show/hide + dnd-kit drag-reorder), click-to-sort headers, per-AE cookie persistence, pinned identity column, defined empty states"
    requirement: "R2"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (clean)"
        status: pass
    human_judgment: true
    rationale: "Drag-reorder, click-sort, popover open/close, and cookie-restore-on-reload are interactive browser behaviors with no jsdom/testing-library in this repo (node test environment only) — needs a live-browser UAT pass to confirm the drag handle and persistence actually work end to end."
  - id: D3
    description: "Own-book scoping: non-leadership query filters .eq('ae_user_id', user.id); leadership sees all (unchanged); R5 nav gate on the leadership 'Client Partners' tower link"
    requirement: "R5"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (clean); code-inspection of app/(admin)/layout.tsx isLeadership block"
        status: pass
    human_judgment: true
    rationale: "The own-book filter and nav gate are code-inspectable and type-clean, but exercising them against a real Supabase session (AE vs leadership) needs a live-DB/browser check — no test DB in this repo, matching the established convention from 31-07's SUMMARY."
  - id: D4
    description: "Crate Requests + Selects nav entries added in funnel order, every-staff-role visible"
    requirement: "R1"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (clean); code-inspection of app/(admin)/layout.tsx every-staff-role block"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-08-16
status: complete
---

# Phase 31 Plan 08: Client Partners column model + list component + own-book page + nav gating Summary

**A pure, testable column/sort contract (12 Company / 10 Client columns, stable-tiebreak sort) backing a list-source-agnostic ClientPartnersList component with drag-reorder/show-hide/click-sort columns persisted per-AE via a cookie, wired into a rebuilt own-book My Client Partners page and R5-gated Team Console nav.**

## Performance

- **Duration:** ~7 min (task commits d383d99 → 3125713)
- **Started:** 2026-08-15T23:12:33-04:00
- **Completed:** 2026-08-15T23:17:14-04:00
- **Tasks:** 3/3
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- `lib/client-partners/columns.ts` — the shared, list-source-agnostic column contract: `COMPANIES_COLUMNS` (12), `CLIENTS_COLUMNS` (10), pinned `isIdentity` column always first, a pure `sortRows()` with a documented stable identity tiebreak (name, then id) so equal-key rows never reorder run-to-run regardless of input array order — the R2 backstop, proven by a shuffle-invariant test.
- `components/admin/ClientPartnersList.tsx` — the shared list+tabs+insight-columns UI: Clients/Companies pill tabs, a Columns popover combining checkbox show/hide + `@dnd-kit` drag-reorder (mirroring `ChecklistAdmin.tsx`'s grip-handle idiom), click-to-sort headers with a chevron, per-AE persistence via the same `document.cookie` mechanism as `AdminThemeToggle.tsx`, and the UI-SPEC's defined empty-state copy for zero clients/zero companies. Takes rows + a drill-in href builder as props — no data-fetching inside it — so the 31.1 leadership tower can reuse it unfiltered.
- Rebuilt `app/(admin)/admin/my-client-partners/page.tsx` on `ClientPartnersList`, replacing the `MyCompanies` card list. Keeps the existing own-book scope exactly, and enriches company rows with Open briefs / Active Selects / Contacts counts read from the 31-04/31-06/31-07 tables.
- `app/(admin)/layout.tsx`: the leadership-only "Client Partners" tower link was already correctly gated behind `isLeadership` — documented that R5 rationale in-code — and added the Slice-1 Crate Requests / Selects nav entries in funnel order, visible to every staff role.

## Task Commits

1. **Task 1: Column model — defs, pinned identity, pure stable sort (+ test)** - `d383d99` (feat)
2. **Task 2: ClientPartnersList component — tabs, drag-reorder columns, click-sort, per-AE persistence, empty states** - `5933dc3` (feat)
3. **Task 3: Rebuild the page (own-book) + R5 nav gating** - `3125713` (feat)

## Files Created/Modified

- `lib/client-partners/columns.ts` - Column defs (12 Company / 10 Client), pinned identity rule, pure `sortRows()` with stable tiebreak, `DEFAULT_SORT`, `resolveHealth()` (unknown-by-default guard)
- `lib/client-partners/columns.test.ts` - Pinned-identity assertions, shuffle-invariant stable-sort suite, `DEFAULT_SORT` ranking, health-defaults-to-unknown test
- `components/admin/ClientPartnersList.tsx` - The list+tabs+insight-columns component (tabs, Columns popover, sortable table, cookie persistence, empty states)
- `app/(admin)/admin/my-client-partners/page.tsx` - Rebuilt own-book list page: fetches orgs (scoped) + enriched counts + `buyer_org_contacts` rows, renders `ClientPartnersList`
- `app/(admin)/layout.tsx` - R5 nav-gate documentation on the existing leadership-only link + new Crate Requests / Selects nav entries

## Decisions Made

- Identity tiebreak for `sortRows` is `(name.toLowerCase(), then id)` — deterministic and independent of input array order (R2 backstop test asserts this explicitly).
- Columns with no Slice-1 data source (health, days-in-stage, open deal, lifetime value, client-level briefs/selects-seen/deals) render the column model's defined "no data" state (dash / muted zero) instead of a fabricated value — those signals are explicitly R3 (health engine) / R6-R7 (leadership tower + deals) work scoped to Phase 31.1, not this plan.
- Leadership's My Client Partners view keeps the pre-existing leadership-sees-all read path unchanged (no `ae_user_id` filter) — the true hold-queue (unassigned + coverage) variant is 31.1, per the plan's own Task 3 instruction.
- Clients-tab rows source from `buyer_org_contacts` (the CRM-lite people layer from 31-06), scoped to the AE's own-book org ids — contacts are independent CRM records, not tied to a buyer auth user, so there is no other correct source for "Clients" rows in Slice 1.

## Deviations from Plan

None — plan executed exactly as written. The plan's own Task 1 action text explicitly authorized the Health-column placeholder and A1 in-code comment; both are implemented as specified, not an improvised deviation.

## Known Non-Fabrication Notes (not stubs — documented, in-scope choices)

The plan's Task 3 action text scopes the enrichment to exactly three counts: "Open briefs / Active Selects / Contacts counts from 31-04/31-06/31-07 reads." Every other signal on a row (Health, Days in stage, Status, Open deal, Lifetime value, Last brief, Last touch for companies; Status, Last touch, Last brief, Briefs, Selects seen, Deals for clients) has no live Slice-1 data source — those are R3 (health engine, 31.1), R6/R7 (leadership tower + deal routing, 31.1), or a deals-room model that does not exist yet. Rather than fabricate placeholder numbers, these columns render the column model's defined "no data" treatment (a muted em-dash for money/text fields, a muted "0" for counts, the R3 dashed "Unknown" chip for health) — this is a documented, intentional Slice 1 boundary, not a stub blocking the plan's own goal (R1/R2/R5/A1 are all fully implemented and testable).

## Issues Encountered

- `npm run build` fails in this sandboxed environment on a Google Fonts network fetch (`next/font` cannot reach `fonts.gstatic.com`), unrelated to any code in this plan or the two pre-existing Phase 32 route-type files. Used `npx tsc --noEmit` as the type gate per the plan's own build note, which is clean except for the two already-tracked Phase 32 files (`app/api/cron/daily-observability-check/route.ts` `DOC_PATH`, `app/api/health/route.ts` `SUPABASE_CHECK_TIMEOUT_MS`) — out of scope, not touched.

## User Setup Required

None - no external service configuration required. This plan reads existing tables (migrations 090/106/111/112, already documented as owner-run/human-gated in prior 31-02/31-04/31-06 plans) and adds no new migration.

## Next Phase Readiness

- `lib/client-partners/columns.ts` and `components/admin/ClientPartnersList.tsx` are the exact contract 31.1's leadership tower needs to reuse unfiltered — pass an unfiltered org/contact row set + the same href builders and the tower is functionally done for R6's list surface.
- The Crate Requests (`/admin/crate-requests`) and Selects (`/admin/selects`) nav links added here point at routes that 31-11 and 31-10 (sibling wave-3 plans) build in parallel — expected to resolve once the full wave lands.
- Live-browser UAT recommended for: drag-reorder + show/hide in the Columns popover, cookie persistence across a reload, and an actual AE-vs-leadership session confirming the own-book scope and nav gate (D2/D3 above — code-inspected and type-clean, not yet exercised against a real session).

## Self-Check: PASSED

- FOUND: lib/client-partners/columns.ts
- FOUND: lib/client-partners/columns.test.ts
- FOUND: components/admin/ClientPartnersList.tsx
- FOUND: app/(admin)/admin/my-client-partners/page.tsx (modified)
- FOUND: app/(admin)/layout.tsx (modified)
- FOUND commit d383d99 (Task 1)
- FOUND commit 5933dc3 (Task 2)
- FOUND commit 3125713 (Task 3)

---
*Phase: 31-ae-client-workspace-selects-my-client-partners-client-partne*
*Completed: 2026-08-16*
