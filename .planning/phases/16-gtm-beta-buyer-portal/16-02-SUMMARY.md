---
phase: 16-gtm-beta-buyer-portal
plan: 02
subsystem: deals
tags: [supabase, postgres, rls, typescript, jest, license-requests, commission-math]

# Dependency graph
requires:
  - buyer_orgs / buyer_members (migration 080, plan 16-01) — license_requests.buyer_org_id FK target
provides:
  - license_requests / license_request_tracks / project_license_terms tables (migration 081)
  - vault_documents.type CHECK widened to accept sync-license documents
  - lib/deals/schema.ts (DEAL_STAGE_VALUES/LABELS, LicenseRequest/LicenseRequestTrack/ProjectLicenseTerms types)
  - lib/deals/matching.ts (matchesPreclearedTerms — pure, multi-reason accumulation)
  - lib/deals/commission.ts (computeNetFee — exact-integer-cent commission math)
  - lib/deals/notifications.ts (deal-flow notification payload builders, Phase 10 shape)
affects: [16-04-artist-deals-room, 16-05-buyer-catalog-filters, 16-06-buyer-request-route, 16-07-admin-negotiation-queue, 16-08-stripe-application-fee, 16-09-esign-completion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "License request SELECT RLS: buyer-org membership OR explicit vault_projects.user_id ownership match — never a bare vault_projects-visible subquery, since migration 078 widened that table's own SELECT from owner-only to owner-OR-member (C4 review finding)"
    - "Column-grant allowlist deliberately excludes admin_notes/owner_id/commission_pct/artist_net_cents from the buyer-visible SELECT grant — RLS restricts rows, column GRANT restricts fields"
    - "matchesPreclearedTerms() accumulates ALL failing dimensions rather than short-circuiting, so the admin negotiation queue can show every out-of-band term at once"
    - "computeNetFee(): single rounding step, artist net derived by subtraction from gross so commissionCents + artistNetCents === grossCents always holds exactly"

key-files:
  created:
    - supabase/migrations/081_license_requests_deals.sql
    - lib/deals/schema.ts
    - lib/deals/matching.ts
    - lib/deals/matching.test.ts
    - lib/deals/commission.ts
    - lib/deals/commission.test.ts
    - lib/deals/notifications.ts
  modified: []

key-decisions:
  - "[C4 review finding, applied verbatim] license_requests SELECT policy's artist-ownership arm matches explicitly on `vault_projects.user_id = auth.uid()`, never a bare `vault_project_id IN (SELECT id FROM vault_projects)` subquery. Migration 078 (Phase 21) widened vault_projects' own SELECT policy from owner-only to owner-OR-member; a bare RLS-visible subquery here would therefore also surface license requests tied to a project the caller merely collaborates on (editor/viewer/co-owner), not owns — a cross-account information-disclosure leak. The explicit user_id match closes that gap by construction."
  - "Column-grant allowlist on license_requests excludes admin_notes, owner_id, commission_pct, and artist_net_cents from the buyer-visible GRANT SELECT list — a buyer may see their own quoted gross_fee_cents but never Funūn's internal negotiation notes or economics (RESEARCH Pitfall 2: RLS restricts rows, not columns)."
  - "REVOKE INSERT/UPDATE/DELETE on license_requests FROM authenticated/anon — every stage transition, owner assignment, and commission edit is a service-role-owned authority action (plan 16-07's admin route), never a client policy write."
  - "vault_documents.type CHECK widened (dropped + recreated) to add the sync-license value alongside the existing five, so signed sync licenses can land in Contract Locker (D-08) without a 23514 check_violation at e-sign completion (plan 16-09)."
  - "matchesPreclearedTerms(request, null) returns matched:false with a reason naming the absent terms — routes to admin negotiation per D-15a, rather than defaulting to a permissive match."

# Metrics
duration: unknown (continuation/finalization pass; original execution session not timed by this agent)
completed: 2026-08-03
status: complete
---

# Phase 16 Plan 02: License Requests, Deal Pipeline & Commission Math Summary

**License requests as first-class product data (migration 081: license_requests/license_request_tracks/project_license_terms), the D-16a deal-stage pipeline, exact-integer-cent commission math, and pre-cleared-terms matching — migration 081 is now live (LOCAL=REMOTE), confirmed via `supabase migration list` and a service-role schema read.**

## What Was Built

- **Migration 081** (`supabase/migrations/081_license_requests_deals.sql`): `license_requests` (full D-07 field set — tracks, usage, territory, term, exclusivity, budget, need-by, dual buyer/creator attribution, D-16a stage pipeline, owner, admin_notes, commission economics, contract link); `license_request_tracks` (multi-track join table, `UNIQUE(license_request_id, track_id)`); `project_license_terms` (1:1 per-project pre-cleared Marmoset-five terms: min fee, allowed usage, territories, exclusivity, max term). `vault_documents.type` CHECK widened to accept `sync-license`. RLS enabled on all three new tables; SELECT policy on `license_requests` scopes to buyer-org membership (via `is_buyer_org_member()` from migration 080) OR explicit project ownership (`vault_projects.user_id = auth.uid()` — the C4-corrected match); `UPDATE`/`DELETE`/`INSERT` REVOKEd from `authenticated`/`anon` on `license_requests`; column-grant allowlist excludes `admin_notes`/`owner_id`/`commission_pct`/`artist_net_cents`.
- **lib/deals/schema.ts**: `DEAL_STAGE_VALUES`/`LABELS` (D-16a pipeline), usage-type/territory vocabularies, `LicenseRequest`/`LicenseRequestTrack`/`ProjectLicenseTerms` types.
- **lib/deals/matching.ts**: `matchesPreclearedTerms()` — pure, accumulates all failing dimensions (fee/usage/territory/exclusivity/term) rather than short-circuiting; `null`/absent terms routes to unmatched (D-15a).
- **lib/deals/commission.ts**: `computeNetFee()` — exact integer-cent arithmetic, single rounding step, `commissionCents + artistNetCents === grossCents` invariant; throws descriptive Errors on invalid input.
- **lib/deals/notifications.ts**: pure payload builders mirroring `lib/social/notifications.ts`'s shape — new-request-on-project and deal-stage-change builders; request builder names the buyer's company (D-13a), not just the individual. Builders only, no I/O.
- **lib/deals/matching.test.ts** / **lib/deals/commission.test.ts**: RED-first coverage of every behavior-block case, including the no-terms-set routing case and the cent-exactness invariant.

## Deviations from Plan

### None beyond the plan's own explicit instructions

The C4 review finding (explicit `user_id` ownership match, not a bare RLS-visible subquery) was written into this plan's Task 1 action prose as a mandatory correction, not discovered mid-execution — it is recorded here as a posture decision, not a Rule 1-4 deviation, since the plan itself specified it verbatim.

## Task Commits

1. **Task 1: Author migration 081** — `30e08f1` (feat) — license_requests/license_request_tracks/project_license_terms + vault_documents type widening + RLS/column-grant/write-REVOKE lockdown.
2. **Task 2 (RED): Matching/commission tests** — `d93b763` (test) — matching.test.ts + commission.test.ts written to the behavior block first.
3. **Task 2 (GREEN): Matching/commission implementation** — `37eb471` (feat) — matching.ts/commission.ts implemented to green.
4. **Task 3: Deal notification builders** — `ffd50d1` (feat) — notifications.ts, Phase 10 payload shape reuse.

## Live Migration Push — Approved

The Task 4 checkpoint (`checkpoint:human-verify`, gate `blocking-human`) required a human to run `supabase db push` — never an executor agent. The operator pushed migrations 080, 081, and 082 together, in order:

- `supabase migration list` shows **LOCAL=REMOTE through 082**.
- PostgREST recognizes the new buyer/deal schema (service-role read returned 200 against `buyer_orgs`; `license_requests` and its siblings land in the same push).
- Operator response: **"approved."**

This confirms the migration is live **at the schema level** (service-role read, which bypasses RLS).

## Outstanding / Deferred — Behavioral Adversarial Checks

The following checks named in this plan's `<verification>` block and Task 4's `how-to-verify` steps have **NOT** been executed and are recorded here as **DEFERRED**, not passed:

- **Buyer-cannot-UPDATE-stage check**: attempting to `UPDATE stage` on a buyer's own `license_requests` row via a buyer session must fail with `42501`. This requires a live buyer account (buyer signup ships in a later Wave 2 plan) and a live license request row. Not yet executable.
- **Admin-column-not-selectable check**: a buyer session selecting `admin_notes`/`owner_id`/`commission_pct`/`artist_net_cents` must fail to return data rather than silently omit them. Requires the same live buyer session precondition.
- **Artist-ownership-scoping smoke test** (an artist can see requests on their own project but not a merely-shared project) — requires a live second account under the Phase 21 co-ownership model to test against.

These are tracked as outstanding for the phase verifier and should be executed once Wave 2 (buyer signup) ships a real buyer account and at least one artist has a live license request against a project.

## Threat Flags

None beyond the plan's own threat model (T-16-04 through T-16-08), which are addressed by the artifacts above. No new surface introduced outside the plan's scope.

## Self-Check

- `supabase/migrations/081_license_requests_deals.sql` — FOUND
- `lib/deals/schema.ts` — FOUND
- `lib/deals/matching.ts` — FOUND
- `lib/deals/matching.test.ts` — FOUND
- `lib/deals/commission.ts` — FOUND
- `lib/deals/commission.test.ts` — FOUND
- `lib/deals/notifications.ts` — FOUND
- Commit `30e08f1` — FOUND in git log
- Commit `d93b763` — FOUND in git log
- Commit `37eb471` — FOUND in git log
- Commit `ffd50d1` — FOUND in git log
- Migration 081 confirmed LOCAL=REMOTE per operator-reported `supabase migration list` output (schema-level only, not independently re-run by this agent — no live-DB commands executed per this continuation's constraints).

---
*Phase: 16-gtm-beta-buyer-portal*
*Completed: 2026-08-03*

## Self-Check: PASSED

All listed artifacts and task commits confirmed present on disk / in git log. Live migration push confirmed via operator-reported `supabase migration list` (LOCAL=REMOTE through 082) and PostgREST schema recognition — this agent did not run any live-DB command itself. Behavioral adversarial checks (buyer cannot UPDATE stage, admin columns not selectable, artist ownership scoping) remain DEFERRED pending a real buyer account (Wave 2).
