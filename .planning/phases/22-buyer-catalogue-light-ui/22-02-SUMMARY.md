---
phase: 22-buyer-catalogue-light-ui
plan: 02
subsystem: ui
tags: [deals, buyer, license-requests, zod, react, forms]

requires:
  - phase: 16-deal-room-negotiation-queue
    provides: "POST /api/buyer/requests (RequestBodySchema .strict(), authorizeRequestTarget, canSubmitRequest) — the real license-request write path reused unmodified"
  - phase: 22-buyer-catalogue-light-ui (22-01)
    provides: "Buyer catalogue browse UI (slices 1/2a/2b) with the demo-toast License modal stub this plan replaces"
provides:
  - "Pure, unit-tested buildRequestBody(form, row) mapper (lib/deals/request-payload.ts)"
  - "CatalogRow view-model enriched with vaultProjectId + tracks (real ids on live rows, synthetic ids on the fixture)"
  - "License modal wired to POST /api/buyer/requests with a required track selector and real enum selects"
affects: [22-buyer-catalogue-light-ui, deal-room, buyer-portal]

tech-stack:
  added: []
  patterns:
    - "Pure form-to-API-body mapper pattern (buildRequestBody) — modal never trusts row data, route re-authorizes server-side"
    - "Modal form state resets via useEffect keyed on the id opening the modal, with single-track rows default-selected"

key-files:
  created:
    - lib/deals/request-payload.ts
    - lib/deals/request-payload.test.ts
  modified:
    - lib/deals/catalog-sample.ts
    - components/buyer/CatalogBrowserLight.tsx

key-decisions:
  - "buildRequestBody strips currency formatting and rounds to integer cents rather than requiring a pre-cleaned numeric input, matching the modal's free-text Offer field"
  - "Media folds into buyer_notes as a 'Media: {value}' line (omitted for '' or the 'All media' sentinel) since license_requests has no media column — avoids a schema change"
  - "Term select stores integer months directly in state (not a label string) so no client-side re-parsing is needed before building the body"
  - "Fixture rows (SAMPLE_CATALOG_ROWS) get synthetic vaultProjectId/tracks so the track selector renders in demo mode; a submit over the fixture is expected to 404 at the route's authorizeRequestTarget gate by design"

patterns-established:
  - "Client payload mappers for buyer-facing write paths must be pure functions with a dedicated unit-test file locking the exact wire contract (mirrors lib/deals/matching.ts / matching.test.ts)"

requirements-completed: [license-request-wiring]

coverage:
  - id: D1
    description: "Pure buildRequestBody(form, row) mapper converts modal form state to the route's exact .strict() body, using real UsageType/Territory enum values"
    requirement: "license-request-wiring"
    verification:
      - kind: unit
        ref: "lib/deals/request-payload.test.ts#buildRequestBody maps the happy path to the route contract"
        status: pass
      - kind: unit
        ref: "lib/deals/request-payload.test.ts#buildRequestBody offer/term/required-field validation (14 additional cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Mapper output never contains server-owned fields (buyer_org_id/created_by/stage/owner_id/commission_pct/gross_fee_cents/matched_precleared)"
    requirement: "license-request-wiring"
    verification:
      - kind: unit
        ref: "lib/deals/request-payload.test.ts#buildRequestBody never emits server-owned fields"
        status: pass
    human_judgment: false
  - id: D3
    description: "CatalogRow carries vaultProjectId + tracks; live rows map real vault_projects/track ids, fixture rows carry synthetic ids"
    requirement: "license-request-wiring"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (strict type check across catalog-sample.ts + CatalogBrowserLight.tsx)"
        status: pass
    human_judgment: false
  - id: D4
    description: "License modal Send button POSTs a real request to /api/buyer/requests with a required track selector, real-enum selects, and submitting/error state; success closes the modal + shows a toast, error surfaces inline and keeps the modal open"
    requirement: "license-request-wiring"
    verification:
      - kind: unit
        ref: "grep gates: fetch('/api/buyer/requests' present, buildRequestBody wired, demo-toast stub literal absent"
        status: pass
      - kind: manual_procedural
        ref: "No real buyer account / live rights-ready project exists yet (same outstanding Phase 16 UAT gap) — a real buyer over a live rights-ready project must submit the modal and confirm a license_requests row is created with the mapped dimensions; a submit over the fixture must surface the authorization 404 inline"
        status: unknown
    human_judgment: true
    rationale: "End-to-end submission against the real route requires a live buyer session and a rights-ready public project, neither of which exists in this environment yet — deferred UAT, same gap noted in Phase 16's own verification section"

duration: 45min
completed: 2026-08-04
status: complete
---

# Phase 22 Plan 02: License Request Wiring Summary

**Replaced the License modal's demo success toast with a real `POST /api/buyer/requests` flow via a pure, unit-tested payload mapper — the buyer catalogue's conversion action now creates real license requests through the existing Phase 16 pipeline.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-08-04T07:19:35Z
- **Completed:** 2026-08-04T07:23:30Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- Pure `buildRequestBody(form, row)` mapper converts the modal's form state into the exact `.strict()` body `app/api/buyer/requests/route.ts` accepts, using real `UsageType`/`Territory` enum values from `lib/deals/schema.ts` — never free text
- 17 unit tests lock the mapping contract: happy path, offer parsing (currency-formatted/bare/cents), term validation, required-field errors, `buyer_notes` composition, and the absence of every server-owned field (`buyer_org_id`, `created_by`, `stage`, `owner_id`, `commission_pct`, `gross_fee_cents`, `matched_precleared`)
- `CatalogRow` enriched with `vaultProjectId` + `tracks` — live rows carry the real `vault_projects` id and real track ids from `CatalogCard`; every `SAMPLE_CATALOG_ROWS` fixture row carries a synthetic project id + one synthetic track so the modal's new track selector renders in demo mode
- License modal rebuilt against the real contract: a required track selector (checkboxes, single-track rows default-selected), Use type/Territory selects rendering `USAGE_TYPE_VALUES`/`TERRITORY_VALUES`, a Term select storing integer months, an Exclusivity boolean select, and an async `submitRequest` that calls `buildRequestBody` then POSTs to `/api/buyer/requests` — success closes the modal and fires the existing toast, any error (validation or non-2xx) surfaces inline and keeps the modal open
- The route (`app/api/buyer/requests/route.ts`) was read but **not modified** — org derivation, `.strict()` schema rejection of extra fields, and `authorizeRequestTarget`'s rights-ready/visibility/block re-gate all stay exactly as Phase 16 built them

## Task Commits

Each task was committed atomically:

1. **Task 1a: RED — failing tests for buildRequestBody** - `8a9195d` (test)
2. **Task 1b: GREEN — implement buildRequestBody** - `84aa429` (feat)
3. **Task 2: Enrich CatalogRow with vaultProjectId + tracks** - `a1295b3` (feat)
4. **Task 3: Wire the modal to the real pipeline** - `4917ede` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/deals/request-payload.ts` - Pure `buildRequestBody` mapper: modal form + row → route POST body or a validation error
- `lib/deals/request-payload.test.ts` - 17 unit tests locking the mapping contract (enum values, cents/months coercion, track-required, forbidden-field absence)
- `lib/deals/catalog-sample.ts` - `mapCardsToLightRows` now populates `vaultProjectId`/`tracks` from live `CatalogCard`; `SAMPLE_CATALOG_ROWS` fixture rows carry synthetic equivalents
- `components/buyer/CatalogBrowserLight.tsx` - `CatalogRow` type extended; License modal rebuilt with a track selector, real-enum selects, async submit wired to `buildRequestBody` + `fetch('/api/buyer/requests')`, `submitting`/`error` state

## Decisions Made
- Offer parsing strips currency symbols/grouping commas via regex then rounds to integer cents (`Math.round(dollars * 100)`), covering `'$4,500'`, `'4500'`, and `'$4,500.50'` inputs
- Media has no home in the route's schema, so it folds into `buyer_notes` as an optional `'Media: {value}'` line rather than triggering a migration — the plan's explicit direction
- Term select stores the integer month count directly as its option `value` (not a display label), so `buildRequestBody` receives an already-coerced number
- Fixture rows deliberately keep synthetic `vaultProjectId`s — a submit over the fixture is expected to 404 at `authorizeRequestTarget`, which is correct-by-construction per the plan's T-22-02-02 mitigation, not a bug to work around

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The License modal's Send action is now real; slice 1.5 (enriching the live catalogue query with artist/energy/length/mood/vocal/instruments) and 22-05 (live-data gating) are unaffected by this plan and remain open per the phase plan
- **Deferred UAT (same outstanding gap noted in Phase 16):** end-to-end verification — a real buyer submitting the modal against a live rights-ready project and confirming the resulting `license_requests` row — requires a live buyer account and a rights-ready public project that do not exist in this environment yet. Track as a human-verify item before this slice is considered fully proven in production.

---
*Phase: 22-buyer-catalogue-light-ui*
*Completed: 2026-08-04*

## Self-Check: PASSED

All created/modified files exist on disk; all 4 task commits (`8a9195d`, `84aa429`, `a1295b3`, `4917ede`) verified present in `git log`.
