---
phase: 16-gtm-beta-buyer-portal
plan: 07
subsystem: api
tags: [deals, admin, state-machine, next.js, supabase, zod, jest, tdd]

requires:
  - phase: 16-gtm-beta-buyer-portal
    provides: "16-02 deal notification builders (lib/deals/notifications.ts); 16-03 admin-owned app/(admin)/layout.tsx and /admin/buyer-orgs page; migration 081's license_requests/license_request_tracks/project_license_terms tables and column-grant lockdown"
provides:
  - "lib/deals/stage-machine.ts — isLegalTransition/requiredFieldsForStage/getLegalNextStages pure functions over the D-16a pipeline"
  - "Admin-gated deal APIs (GET/POST /api/admin/deals, PATCH /api/admin/deals/[id]) — queue listing, server-owned stage/owner/commission transitions, D-03 manual intake"
  - "Admin negotiation queue UI (DealsQueue) and per-deal working surface (DealDetailPanel) at /admin/deals and /admin/deals/[id]"
  - "Admin sidebar Deals + Buyer Orgs entries"
affects: [16-08-money-rails, 16-09-esign, 16-10-gtm-metrics]

tech-stack:
  added: []
  patterns:
    - "Stage machine as pure functions (no I/O) shared verbatim by the server route (gate) and the client UI (button derivation) so they can never drift."
    - "admin_notes doubles as the mismatch-reasons AND admin-created-marker store — no new migration column, consistent with the 16-06 buyer route's existing convention."
    - "Effective-row required-field check: PATCH computes required fields against current DB values merged with the same request's own updates, so an admin can quote and advance to contract in one call."

key-files:
  created:
    - lib/deals/stage-machine.ts
    - lib/deals/stage-machine.test.ts
    - app/api/admin/deals/route.ts
    - app/api/admin/deals/[id]/route.ts
    - app/(admin)/admin/deals/page.tsx
    - app/(admin)/admin/deals/[id]/page.tsx
    - components/admin/DealsQueue.tsx
    - components/admin/DealDetailPanel.tsx
  modified:
    - app/(admin)/layout.tsx

key-decisions:
  - "No migration in this plan (081 already live) — 'admin-created' manual-intake provenance is recorded as a tagged line inside admin_notes rather than a new column, since license_requests has no dedicated flag for it."
  - "Manual intake (POST /api/admin/deals) is deliberately re-implemented rather than sharing code with POST /api/buyer/requests, mirroring the existing admin-route-mirrors-member-route precedent (app/api/admin/members vs. the industry self-serve route) so the two entry points on either side of migration 081's REVOKE boundary stay independently auditable; both use the identical Zod validation shape and the same matchesPreclearedTerms/authorizeRequestTarget functions."
  - "DealDetailPanel offers 'Assign to me' / 'Unassign' rather than a full admin-picker dropdown — sufficient for a small founder-led team and avoids an extra Supabase Admin listUsers() call; the PATCH route still validates any owner_id against is_admin server-side regardless of how it's chosen."
  - "DealsQueue filters entirely client-side over the full admin-loaded queue (mirrors OrgRequestDashboard's pattern) rather than round-tripping to the API per filter change — acceptable at beta data volumes and avoids duplicating the enrichment query in a second code path."

requirements-completed: [ADMIN-01, ADMIN-02, ADMIN-03]

coverage:
  - id: D1
    description: "Deal-stage state machine enforces the D-16a pipeline: forward-only moves, decline-from-anywhere, terminal immutability, no skips, no self-transitions, fail-closed on unknown stages."
    requirement: "ADMIN-02"
    verification:
      - kind: unit
        ref: "lib/deals/stage-machine.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Admin-gated deal APIs: GET queue listing with internal fields, PATCH allowlisted stage/owner/commission transitions gated by the stage machine and requiredFieldsForStage, POST manual intake writing to the same tables as the buyer portal."
    requirement: "ADMIN-01 / ADMIN-02 / ADMIN-03"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (clean)"
        status: pass
      - kind: other
        ref: "grep verifyAdmin/isLegalTransition/computeNetFee in app/api/admin/deals/[id]/route.ts"
        status: pass
    human_judgment: true
    rationale: "No integration test exercises the live Supabase-backed routes (RLS/service-role behavior, illegal-transition 400s, notification delivery) — needs a human or an integration-test follow-up against a real database to confirm end-to-end."
  - id: D3
    description: "Admin negotiation queue UI (DealsQueue) and per-deal detail panel (DealDetailPanel) at /admin/deals and /admin/deals/[id], with sidebar entries for Deals and Buyer Orgs."
    requirement: "ADMIN-01"
    verification:
      - kind: unit
        ref: "npm run build (admin/deals and admin/deals/[id] routes compiled successfully)"
        status: pass
    human_judgment: true
    rationale: "Visual/interaction correctness (filter chips, live artist-net preview, stage-button rendering, owner assignment) has not been eyeballed in a running app — needs UAT."

duration: 14min
completed: 2026-08-03
status: complete
---

# Phase 16 Plan 07: Admin Negotiation Workspace Summary

**Deal-stage state machine (isLegalTransition/requiredFieldsForStage/getLegalNextStages) gating server-owned admin PATCH transitions, a D-03 manual-intake POST route, and an admin queue + detail UI over migration 081's license_requests table**

## Performance

- **Duration:** 14 min
- **Started:** 2026-08-03T07:04:02Z
- **Completed:** 2026-08-03T07:17:30Z
- **Tasks:** 3
- **Files modified:** 9 (8 created, 1 modified)

## Accomplishments
- Pure-function deal-stage state machine (`lib/deals/stage-machine.ts`) covering every D-16a behavior row: forward-only pipeline moves, decline-from-any-non-terminal-stage, terminal immutability, skip rejection, self-transition rejection, and fail-closed unknown-stage handling — built RED (16 failing tests) then GREEN, both committed separately.
- Admin-gated deal APIs: `GET /api/admin/deals` (filterable queue with joined buyer org/project/submitter/owner context), `PATCH /api/admin/deals/[id]` (allowlisted stage/owner/commission/fee/notes updates, gated by `isLegalTransition` + `requiredFieldsForStage` against the effective post-update row, artist net always recomputed server-side via `computeNetFee`), and `POST /api/admin/deals` (D-03 manual intake writing into the same `license_requests`/`license_request_tracks` tables through the same Zod validation and `matchesPreclearedTerms` matching as the buyer portal route).
- Admin negotiation queue UI (`DealsQueue`) defaulting to the unmatched/needs-negotiation lane oldest-first, and a per-deal working surface (`DealDetailPanel`) with owner assignment, live-computed artist net on quote edits, admin notes, and stage-advance buttons rendered only from the same `getLegalNextStages` the server enforces — plus labelled, disabled placeholders for the plan 16-08/16-09 integrations. Both `/admin/deals` and `/admin/buyer-orgs` sidebar links added to `app/(admin)/layout.tsx` (16-03 deliberately left this file for this plan).

## Task Commits

Each task was committed atomically:

1. **Task 1: Deal-stage state machine** — `9537d19` (test, RED) then `36a7219` (feat, GREEN)
2. **Task 2: Admin deal APIs** — `08fb9bf` (feat)
3. **Task 3: Negotiation queue UI + deal detail panel + admin nav** — `2761161` (feat)

**Plan metadata:** (this commit) — `docs(16-07): complete admin negotiation workspace plan`

_Note: Task 1 is a plan-level `tdd="true"` task — two commits (test → feat), no refactor commit needed._

## Files Created/Modified
- `lib/deals/stage-machine.ts` - Pure `isLegalTransition`/`requiredFieldsForStage`/`getLegalNextStages` functions over `DEAL_STAGE_VALUES`
- `lib/deals/stage-machine.test.ts` - 16 tests covering every behavior row (forward moves, decline, terminal immutability, skip/self-transition rejection, fail-closed unknowns, required fields, next-stage derivation matches the gate exactly)
- `app/api/admin/deals/route.ts` - GET queue listing (filter by stage/owner/matched, enriched with buyer org/project/user names) and POST manual intake
- `app/api/admin/deals/[id]/route.ts` - PATCH allowlisted stage/owner/commission/fee/notes update with stage-machine gating, economics recompute, and best-effort stage-change notifications
- `app/(admin)/admin/deals/page.tsx` - Server component fetching and enriching the full queue, passed to `DealsQueue`
- `app/(admin)/admin/deals/[id]/page.tsx` - Server component fetching one deal + project/submitter/owner context, passed to `DealDetailPanel`
- `components/admin/DealsQueue.tsx` - Client-side-filtered read-only queue list, links to detail pages
- `components/admin/DealDetailPanel.tsx` - Owner assignment, quote/commission editing with live net preview, notes, stage advance, placeholder actions
- `app/(admin)/layout.tsx` - Added Deals and Buyer Orgs sidebar links

## Decisions Made
- No migration for "admin-created" provenance — tagged inside `admin_notes` (see key-decisions above), matching the existing mismatch-note convention from 16-06.
- Manual intake route deliberately duplicates rather than shares code with the buyer-portal route, matching this codebase's existing admin/member route-pair precedent.
- Owner assignment is "assign to me / unassign" rather than a full admin picker.
- Queue filtering is entirely client-side over the initial server-enriched load.

(Full rationale for each is in the `key-decisions` frontmatter block above.)

## Deviations from Plan

None — plan executed exactly as written. Every truth in `must_haves` is satisfied by the committed code: `isLegalTransition`/`requiredFieldsForStage` exist and are tested; every PATCH runs through `verifyAdmin()` before `createServiceClient()`; the stage machine is enforced server-side via `stage-machine.ts`, not just UI affordance; the queue surfaces stored mismatch reasons via `admin_notes`; the manual-intake POST route writes into the same tables as the buyer portal; and `commission_pct`/`artist_net_cents` are excluded from every client-facing type/route (they're admin-only, sourced from `LicenseRequestAdmin`).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. This plan does not touch migrations (081 is already live) or introduce new environment variables.

## Next Phase Readiness
- Plan 16-08 (Stripe Connect money rails) can now read `gross_fee_cents`/`commission_pct`/`artist_net_cents` off a deal reaching the `contract`/`closed_won` stages — the triple is always internally consistent per `T-16-29`.
- Plan 16-09 (embedded e-sign) has a clearly labelled "Send for signature" placeholder in `DealDetailPanel` to wire up; `contract_document_id` is already a `requiredFieldsForStage('closed_won')` gate.
- Plan 16-10 (GTM metrics) can read the request-age clock (`created_at` ordering already oldest-first in the API), the admin-created marker convention documented above, and the stage-transition notification trail for its founder-touches metric.
- `REQUIREMENTS.md` does not yet contain `ADMIN-01`/`ADMIN-02`/`ADMIN-03` — per `ROADMAP.md`, these 34 phase-16 requirement IDs are registered by plan 16-10. This SUMMARY's `requirements-completed` records them for that registration step; no action needed from this plan.

---
*Phase: 16-gtm-beta-buyer-portal*
*Completed: 2026-08-03*

## Self-Check: PASSED

All 9 created/modified files verified present on disk; all 4 task commit hashes (9537d19, 36a7219, 08fb9bf, 2761161) verified in git log.
