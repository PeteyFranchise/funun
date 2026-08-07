---
phase: 16-gtm-beta-buyer-portal
plan: 10
subsystem: deals
tags: [typescript, nextjs, jest, admin-dashboard, gtm-metrics, requirements-traceability]

# Dependency graph
requires:
  - phase: 16-gtm-beta-buyer-portal
    provides: "16-02 license_requests schema + lib/deals/commission.ts (computeNetFee); 16-05 lib/deals/catalog.ts (isRightsReady/CATALOG_READINESS_THRESHOLD); 16-07 admin negotiation queue + deal-stage machine + admin_notes manual-intake marker convention"
provides:
  - "lib/deals/metrics.ts — pure computeGtmMetrics/computeArtistReadinessPassRate aggregation (no Supabase client), plus mapRawDealRow raw-row mapping"
  - "GET /api/admin/deals/metrics — verifyAdmin-gated, service-role read of license_requests + distinct requested vault_projects"
  - "/admin/deals/metrics server page + GtmMetricsDashboard component — six D-10 metric families plus artist readiness pass rate, sample sizes and decision gates stated alongside every tile"
  - "REQUIREMENTS.md v1.3 Phase 16 section — all 34 requirement IDs registered with decision traceability and a Phase/Plan/Status table"
affects: [16-09-esign-signing-model, 16-08-stripe-connect-live-push]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GTM metrics as pure aggregation over an already-fetched, caller-defined GtmDealInput[] shape — no Supabase client in lib/deals/metrics.ts — so every metric definition is unit-testable in isolation, mirroring lib/deals/stage-machine.ts and lib/deals/commission.ts's existing pure-function convention"
    - "Null-versus-zero discipline: every rate (requestToQuoteHours, quoteToCloseRate, averageSyncFeeCents, adminCreatedShare, readiness passRate) returns null with zero denominator rather than 0/0 or a misleading zero; counts (closedDeals, repeatBuyerOrgs) always return a real number"
    - "requestToQuoteHours quotedAt is derived (gross_fee_cents != null ? updated_at : null) rather than read from a dedicated column — migration 081 has no first-quoted-at timestamp. Documented as an accepted approximation (overstates elapsed time for a deal that kept moving after its fee was first set) rather than silently treated as exact."
    - "Artist readiness pass rate reuses CATALOG_READINESS_THRESHOLD from lib/deals/catalog.ts rather than duplicating the number, and is a simplified isRightsReady proxy (is_public + readiness >= threshold, no full computeStage3) read against CURRENT project state — license_requests stores no point-in-time readiness snapshot, so 'at request time' is read as 'as of now', documented in-source."

key-files:
  created:
    - lib/deals/metrics.ts
    - lib/deals/metrics.test.ts
    - app/api/admin/deals/metrics/route.ts
    - app/(admin)/admin/deals/metrics/page.tsx
    - components/admin/GtmMetricsDashboard.tsx
  modified:
    - app/(admin)/layout.tsx
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Deliberate PARTIAL execution per owner decision: Task 1 (delivery unlock gate + buyer export route + DeliveryPanel) was explicitly SKIPPED this run. isDeliveryUnlocked(deal) requires a deal that is both signed (16-09, deferred — sync-license signing model undecided) and paid (16-08, paused awaiting owner Stripe setup + migration 084 push). Building delivery now would code against a signed-contract state that does not exist yet. lib/deals/delivery.ts, lib/deals/delivery.test.ts, app/api/buyer/deals/[id]/export/route.ts, and components/buyer/DeliveryPanel.tsx were NOT created."
  - "requestToQuoteHours and 'quoted' status derived from gross_fee_cents/updated_at rather than adding a migration for a dedicated quote-timestamp column — out of scope for this plan (no migration file in the task's files_modified list) and a real limitation documented in lib/deals/metrics.ts's module header rather than silently approximated."
  - "computeArtistReadinessPassRate deliberately omits the full computeStage3().canContinue check that isRightsReady() applies to buyer catalog browse — running stage3 per requested project inside an aggregate metrics call would require fetching tracks/vault_documents for every distinct project, which is out of proportion for a beta-scale founder dashboard signal. Uses the same CATALOG_READINESS_THRESHOLD constant so the beta rights-ready bar can't drift between the two call sites."
  - "GtmMetricsDashboard and the /admin/deals/metrics page duplicate the license_requests + vault_projects query rather than sharing a fetch helper — mirrors the existing GET /api/admin/deals vs. /admin/deals/page.tsx precedent already established in this codebase (both independently query and enrich)."
  - "Added a 'GTM Metrics' sidebar link to app/(admin)/layout.tsx (Rule 2 — a page unreachable from admin nav is incomplete; mirrors how 16-07 added the Deals/Buyer Orgs links)."
  - "REQUIREMENTS.md Phase 16 section uses a 4-column traceability table (Requirement | Phase | Plan | Status), matching the Phase 17/18/19 precedent already in the file. Confirmed via a dry-run diff that gsd-tools requirements mark-complete's regex expects a 3-column table and reports 'not_found' against this format without mutating the file — the 27 already-shipped IDs (BUYER-01..07, DEAL-01..07, PORTAL-01..05, ARTIST-01,02, ADMIN-01..03, METRICS-01,02) were instead marked Complete directly in the table text, which the CLI tool would have done as a no-op anyway since the rows didn't say 'Pending'. MONEY-01..03 marked Pending (16-08 authored, not live); PAPER-01..04 and DELIVERY-01 marked Deferred."
  - "ROADMAP.md's Phase 16 'Requirements' line was left untouched — it already lists all nine ID-family ranges with a note that they're 'registered in REQUIREMENTS.md by plan 16-10' (not a TBD placeholder), satisfying the plan's stated condition to skip that edit."

requirements-completed: [METRICS-01, METRICS-02]

coverage:
  - id: D1
    description: "computeGtmMetrics: closedDeals count, requestToQuoteHours (null-safe, excludes never-quoted), quoteToCloseRate (null-safe division), averageSyncFeeCents (won-only), repeatBuyerOrgs, adminCreatedShare (null-safe), empty-input safety"
    requirement: "METRICS-01"
    verification:
      - kind: unit
        ref: "lib/deals/metrics.test.ts (13 tests covering computeGtmMetrics + mapRawDealRow)"
        status: pass
    human_judgment: false
  - id: D2
    description: "computeArtistReadinessPassRate: null/zero-sample-size on empty input, correct pass rate over public+readiness-threshold projects"
    requirement: "METRICS-02"
    verification:
      - kind: unit
        ref: "lib/deals/metrics.test.ts (computeArtistReadinessPassRate describe block, 2 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /api/admin/deals/metrics is verifyAdmin-gated and reads license_requests + vault_projects via the service role; computes and returns both metric families"
    requirement: "METRICS-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (clean); grep -Eq verifyAdmin app/api/admin/deals/metrics/route.ts"
        status: pass
      - kind: other
        ref: "npm run lint --max-warnings=0"
        status: pass
    human_judgment: true
    rationale: "No integration test exercises the live Supabase-backed route (RLS/service-role behavior against real license_requests/vault_projects data, verifyAdmin 401/403 paths) — needs a human or an integration-test follow-up against a real database to confirm end-to-end."
  - id: D4
    description: "/admin/deals/metrics server page + GtmMetricsDashboard render every metric tile with its D-10 decision gate and sample size stated alongside it"
    requirement: "METRICS-02"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (clean, both files compile)"
        status: pass
    human_judgment: true
    rationale: "Visual rendering (tile layout, gate copy legibility, 'not enough data' fallback text at zero sample sizes) has not been eyeballed in a running app — needs UAT."
  - id: D5
    description: "REQUIREMENTS.md registers all 34 Phase 16 requirement IDs with decision traceability; v1.2 Green Room sections and coverage counts remain intact"
    requirement: null
    verification:
      - kind: other
        ref: "grep -Eq BUYER-01/DELIVERY-01/METRICS-02/PROFILE-01/FEED-18 .planning/REQUIREMENTS.md (plan's own verify block, all pass)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Task 1 (delivery unlock gate + buyer export route + DeliveryPanel) deliberately NOT built — deferred alongside 16-09"
    requirement: "DELIVERY-01"
    verification: []
    human_judgment: true
    rationale: "This is an intentional scope exclusion, not a completed deliverable — flagged for human awareness that lib/deals/delivery.ts, the buyer export route, and DeliveryPanel remain unbuilt and will be picked up alongside 16-09."

# Metrics
duration: ~25min (investigation + build; commit span 4min)
completed: 2026-08-03
status: partial
---

# Phase 16 Plan 10: GTM Beta Metrics + Requirements Registration Summary (PARTIAL — delivery deferred)

**GTM beta metrics module (lib/deals/metrics.ts) and admin dashboard computing all six D-10 metric families plus artist readiness pass rate from real deal data, and full REQUIREMENTS.md registration of Phase 16's 34 requirement IDs — Task 1 (export-pack delivery unlock) deliberately deferred alongside 16-09's undecided signing model**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-03 (session start)
- **Completed:** 2026-08-03T10:00:48Z (final commit)
- **Tasks:** 2 of 3 built (Task 1 explicitly skipped per owner decision)
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments
- `lib/deals/metrics.ts`: pure `computeGtmMetrics()` (closedDeals, requestToQuoteHours, quoteToCloseRate, averageSyncFeeCents, repeatBuyerOrgs, adminCreatedShare, sample sizes) and `computeArtistReadinessPassRate()`, built RED-first (15 tests) then GREEN, with no Supabase client dependency anywhere in the module.
- `GET /api/admin/deals/metrics` (verifyAdmin-gated, service-role) and `/admin/deals/metrics` server page + `GtmMetricsDashboard` component — every metric tile states its D-10 decision gate and sample size, so a 100% close rate on one deal can't be misread as a trend.
- Admin sidebar gained a "GTM Metrics" link (`app/(admin)/layout.tsx`).
- `.planning/REQUIREMENTS.md` gained a full v1.3 Phase 16 section: all 34 IDs (BUYER, DEAL, PORTAL, ARTIST, ADMIN, MONEY, PAPER, DELIVERY, METRICS families) with one-line decision-traced descriptions and a Phase/Plan/Status traceability table — 27 already-shipped IDs marked Complete, MONEY-01..03 marked Pending, PAPER-01..04 and DELIVERY-01 marked Deferred. v1.2 Green Room sections/counts confirmed untouched.
- **Task 1 (delivery unlock gate, buyer export route, DeliveryPanel) was deliberately NOT built** — see Deviations below.

## Task Commits

Each built task was committed atomically (TDD tasks split into test → feat commits):

1. **Task 2 (GTM metrics module + dashboard):**
   - `c33a8de` — `test(16-10): add failing tests for GTM metrics module`
   - `a21ea91` — `feat(16-10): GTM beta metrics module + admin dashboard`
2. **Task 3 (REQUIREMENTS.md registration):**
   - `343cf38` — `docs(16-10): register Phase 16 requirement IDs in REQUIREMENTS.md`

**Task 1 (delivery unlock): NOT ATTEMPTED — no commit exists for it.**

_Note: this plan's SUMMARY/STATE/ROADMAP metadata commit follows after this file is written._

## Files Created/Modified
- `lib/deals/metrics.ts` - pure GTM metrics aggregation + artist readiness pass rate + raw-row mapping
- `lib/deals/metrics.test.ts` - RED-first test coverage (15 tests)
- `app/api/admin/deals/metrics/route.ts` - verifyAdmin-gated admin metrics API
- `app/(admin)/admin/deals/metrics/page.tsx` - server page loading and rendering the dashboard
- `components/admin/GtmMetricsDashboard.tsx` - presentational metric tiles with decision gates + sample sizes
- `app/(admin)/layout.tsx` - added "GTM Metrics" sidebar link
- `.planning/REQUIREMENTS.md` - new v1.3 Phase 16 section + traceability table (additive; v1.2 untouched)

## Decisions Made
- Deferred Task 1 entirely per explicit owner instruction — see Deviations for the full rationale (signed-and-paid precondition doesn't exist yet).
- Derived `quotedAt` from `gross_fee_cents`/`updated_at` rather than adding a migration for a missing quote-timestamp column (documented limitation, not silent).
- Kept the artist readiness pass rate a simplified `is_public + readiness >= CATALOG_READINESS_THRESHOLD` check rather than the full `isRightsReady`/`computeStage3` gate, to avoid an expensive per-project stage3 computation inside an aggregate metrics call.
- Used a 4-column traceability table (adding a Plan column) matching the Phase 17/18/19 precedent in REQUIREMENTS.md, rather than the simpler 3-column v1.2 format.

## Deviations from Plan

### Deliberate Scope Exclusion (not a Rule 1-4 deviation — an explicit instruction from this run's objective)

**Task 1: Delivery unlock gate + buyer-scoped export route — SKIPPED, not built.**
- **Why:** `isDeliveryUnlocked(deal)` requires a deal that is BOTH signed (16-09) AND paid (16-08). 16-09 is deferred — the sync-license signing model is undecided pending owner + legal review (`.planning/deliberations/sync-license-signing-model.md`). 16-08 is paused awaiting the owner's Stripe setup and migration 084 push. Building delivery now would mean writing and testing a predicate and export route against a signed-contract/paid-deal state that cannot currently exist in the product, and the buyer export route's cross-org/locked-state behavior couldn't be meaningfully verified without it.
- **Not built:** `lib/deals/delivery.ts`, `lib/deals/delivery.test.ts`, `app/api/buyer/deals/[id]/export/route.ts`, `components/buyer/DeliveryPanel.tsx`.
- **Requirement affected:** `DELIVERY-01` — registered in REQUIREMENTS.md (Task 3) with status `Deferred`, not `Complete`.
- **Next step:** Task 1 will be built alongside 16-09 once the signing model is decided, reusing the same `verify` block and behavior spec already written in `16-10-PLAN.md`.

### Auto-fixed Issues

None beyond the deliberate scope exclusion above — Tasks 2 and 3 were built exactly to their behavior/action blocks with no bugs, missing-critical-functionality gaps, or blocking issues requiring a Rule 1–3 fix, and no architectural change (Rule 4) was needed.

---

**Total deviations:** 1 deliberate scope exclusion (owner-directed partial execution), 0 auto-fixed.
**Impact on plan:** This plan is explicitly a PARTIAL execution. Task 1/`DELIVERY-01` remains open and will be completed in a future run alongside 16-09.

## Issues Encountered
- `gsd-tools requirements mark-complete` expects a 3-column traceability table (`| ID | Phase | Status |`); this file's 4-column format (matching Phase 17/18/19 precedent) causes it to report `not_found` without mutating the file (confirmed via a dry-run on `BUYER-01` with a diff against a backup — no change resulted). Not a bug in this plan's work: the 27 already-shipped IDs were marked `Complete` directly in the table text instead, which is the same end state the CLI tool would have produced had its regex matched.

## User Setup Required
None - no external service configuration required by Tasks 2/3.

## Next Phase Readiness
- GTM beta metrics are live and admin-visible at `/admin/deals/metrics` — the founder can now read real D-10 gate evidence (closed deals, request-to-quote time, quote-to-close rate, average sync fee, repeat buyer orgs, admin-created share, artist readiness pass rate) once beta deal volume accrues.
- Phase 16 requirements are now fully traceable in REQUIREMENTS.md — 27/34 IDs Complete, 3 Pending (MONEY, awaiting live Stripe push), 4 Deferred (PAPER, blocked on signing model) + 1 Deferred (DELIVERY-01, this plan).
- **16-10 is NOT fully complete.** Task 1 (delivery unlock + buyer export route + DeliveryPanel) is the one remaining piece of this plan, blocked on the same open decision as 16-09 (sync-license signing model). Re-run 16-10's Task 1 once 16-09 is re-scoped and built.

---
*Phase: 16-gtm-beta-buyer-portal*
*Completed: 2026-08-03 (partial — Task 1/DELIVERY-01 deferred)*

## Self-Check: PASSED

All 7 created/modified files confirmed present on disk; all 3 task commits (`c33a8de`, `a21ea91`, `343cf38`) confirmed in git log.
