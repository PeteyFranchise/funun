---
phase: 16-gtm-beta-buyer-portal
plan: 06
subsystem: deals
tags: [nextjs, api-route, zod, rls, typescript, react, license-requests, buyer-portal]

# Dependency graph
requires:
  - license_requests / license_request_tracks / project_license_terms (migration 081, plan 16-02) — the deal substrate this plan writes to
  - lib/deals/schema.ts, lib/deals/matching.ts, lib/deals/notifications.ts (plan 16-02)
  - buyer_orgs / buyer_members + lib/buyers/permissions.ts (migration 080, plan 16-01)
  - app/(buyer-portal)/layout.tsx + components/buyer/BuyerPortalNav.tsx (plan 16-03) — the portal shell and its /buyers/requests URL contract
provides:
  - POST /api/buyer/requests — validated, server-matched license request creation
  - GET /api/buyer/requests/[id] — org-scoped single-request read
  - lib/deals/request-target.ts (authorizeRequestTarget) — shared rights-ready + Phase 13 visibility + block gate for the buyer request pathway
  - app/(buyer-portal)/buyers/requests/{page,new/page,[id]/page}.tsx — org dashboard, composer, and detail views
  - components/buyer/{RequestComposer,OrgRequestDashboard}.tsx
affects: [16-07-admin-negotiation-queue, 16-08-stripe-application-fee, 16-09-esign-completion, 16-10-gtm-metrics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "authorizeRequestTarget (lib/deals/request-target.ts) runs on the SERVICE-ROLE client because tracks/vault_documents RLS (migration 078) scopes SELECT to project owner-or-member — a buyer session read would return zero rows even for an eligible project. Shared by the POST route and the composer's project lookup so both apply the identical rights-ready + Phase 13 visibility + block gate."
    - "Mismatch reasons from matchesPreclearedTerms() are written into license_requests.admin_notes — no dedicated column exists on migration 081's schema for this, and admin_notes is the correct admin-only fit since buyers can never SELECT it (column-grant allowlist excludes it)."
    - "Zod .strict() object schema as the authority-field firewall: stage/owner_id/commission_pct/gross_fee_cents/artist_net_cents/matched_precleared have no home in the schema, so any client attempt to set them fails the whole parse rather than being silently dropped."
    - "Compensating delete on partial insert failure: if the license_request_tracks child insert fails after the license_requests parent succeeds, the parent row is deleted so no orphaned zero-track request persists."
    - "Buyer-portal pages placed under app/(buyer-portal)/buyers/requests/* (not the plan's literal app/(buyer-portal)/requests/* path) to match the /buyers/requests URL contract components/buyer/BuyerPortalNav.tsx already established in 16-03."

key-files:
  created:
    - app/api/buyer/requests/route.ts
    - app/api/buyer/requests/[id]/route.ts
    - lib/deals/request-target.ts
    - components/buyer/RequestComposer.tsx
    - components/buyer/OrgRequestDashboard.tsx
    - app/(buyer-portal)/buyers/requests/page.tsx
    - app/(buyer-portal)/buyers/requests/new/page.tsx
    - app/(buyer-portal)/buyers/requests/[id]/page.tsx
  modified: []

key-decisions:
  - "[Rule 1 — routing bug fix] Plan's files_modified listed app/(buyer-portal)/requests/{page,new/page,[id]/page}.tsx, which would resolve at /requests, /requests/new, /requests/[id] — dead links relative to BuyerPortalNav.tsx's existing static href /buyers/requests (set in 16-03, explicitly documented there as \"the URL contract Wave 3 pages should implement\"). Built all three routes under app/(buyer-portal)/buyers/requests/* instead so the nav actually resolves. Plan 16-05 (buyer catalog, not yet executed) has the identical app/(buyer-portal)/catalog/page.tsx / app/(buyer-portal)/shortlists/page.tsx mismatch against the same nav's /buyers/catalog and /buyers/shortlists hrefs — its future executor should apply the same correction."
  - "[Rule 2 — missing shared authorization] Extracted lib/deals/request-target.ts (authorizeRequestTarget), not named in the plan's files_modified list. The plan's Task 1 action prose requires the POST route to re-run \"the same rights-ready and Phase 13 visibility/block checks the catalog route applies,\" but lib/deals/catalog.ts (plan 16-05's isRightsReady) does not exist yet at this execution time — 16-06 depends only on 16-02/16-03, not 16-05, and both are wave-3 plans with no ordering guarantee. Implemented the equivalent gate directly from the underlying primitives already shipped (computeStage3 from lib/vault/stage3.ts, isProfileVisibleTo from lib/trust-safety/contracts.ts, isBlockedRelativeTo from lib/trust-safety/block-check.ts) as a new shared helper, reused by both the POST route and the composer's new/page.tsx project lookup — duplicating this security-critical check inline in two files would risk drift, which is itself the kind of correctness gap Rule 2 exists to close."
  - "[Plan-schema gap, not a deviation from a stated instruction] Task 1 says to \"store the mismatch reasons so the admin queue in plan 16-07 can show exactly which dimensions are out of band,\" but migration 081's license_requests has no dedicated mismatch-reasons column. Stored the formatted reasons string in admin_notes (TEXT, admin-only per the column-grant allowlist) rather than requesting a new migration — no architectural change needed, and the field's existing purpose (internal negotiation notes) is a semantic match."
  - "budget_cents and term_months made REQUIRED (not nullable) in the POST route's Zod schema, even though both DB columns are nullable. matchesPreclearedTerms() treats a null budget/term as an automatic pass on that dimension — leaving either optional would let a buyer bypass an artist's minimum-fee or max-term pre-clearance floor simply by omitting the field. The DB columns stay nullable for admin-side edits in a later plan; this route's input validation is stricter than the schema."
  - "POST /api/buyer/requests never re-selects its own insert from the DB for the response — the client-safe response body is hand-assembled from already-validated input plus the minimal id/created_at/updated_at returned by the insert's own .select(), so there is no code path where admin_notes (freshly written with the mismatch reasons) could accidentally leak back to the buyer's own request confirmation."
  - "matched_precleared is never rendered in either buyer-facing UI (OrgRequestDashboard, request detail page) even though migration 081's column-grant technically allows a buyer session to SELECT it — the threat model states the match result is admin-facing only (T-16-25), and that is honored at the UI layer, not just the composer specifically."

requirements-completed: [PORTAL-04, PORTAL-05, DEAL-05]

coverage:
  - id: D1
    description: "A verified buyer submits a structured license request (project, tracks, usage, territory, term, exclusivity, budget, need-by, notes) with no email or manual step, and the server rejects any client-supplied stage/owner/commission/matched-flag field."
    requirement: "PORTAL-04"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit && npm run lint (route + Zod .strict() schema, static verification)"
        status: pass
      - kind: automated_ui
        ref: "npm run build — /api/buyer/requests, /buyers/requests/new compile into the route manifest"
        status: pass
    human_judgment: true
    rationale: "End-to-end submission (a real buyer session posting a request, confirming the row lands with the correct matched_precleared value and admin_notes mismatch text, and that a raw stage/owner_id/commission_pct field in the body is rejected) requires a live Supabase project and a live buyer + artist account pair — not exercised by this execution session, matching the same DEFERRED-behavioral-check precedent recorded against 16-02's/16-04's SUMMARYs."
  - id: D2
    description: "Requests targeting a private, unready, non-owned, or blocking artist's project are rejected before insert (T-16-23), via the shared authorizeRequestTarget gate reused by both the POST route and the composer's project lookup."
    requirement: "PORTAL-04"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit && npm run lint (lib/deals/request-target.ts, static verification of the gate composition)"
        status: pass
    human_judgment: true
    rationale: "No unit test suite exists for authorizeRequestTarget in this plan (not TDD-scoped) and no live database is available in this session to exercise the private/unready/blocked-project rejection paths against real rows — needs a live Supabase project with seeded fixtures."
  - id: D3
    description: "Every org member sees every request the org has submitted, with its deal stage, on a read-only dashboard; a request id from another org 404s (never 403)."
    requirement: "PORTAL-05"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit && npm run lint && grep -Eq buyer_org_id|buyer_members app/api/buyer/requests/[id]/route.ts"
        status: pass
      - kind: automated_ui
        ref: "npm run build — /buyers/requests, /buyers/requests/[id] compile into the route manifest"
        status: pass
    human_judgment: true
    rationale: "The org-wide visibility claim and the cross-org 404 (not 403) behavior require two live buyer accounts in different orgs against a real Supabase project — not exercised in this session."
  - id: D4
    description: "Submitting a request emits a best-effort Phase 10 notification to the artist via createNotification/buildLicenseRequestNotification, wrapped so a notification failure never fails request creation."
    requirement: "DEAL-05"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit && npm run lint && grep -Eq createNotification app/api/buyer/requests/route.ts"
        status: pass
    human_judgment: true
    rationale: "Confirming the notification actually lands in the artist's Deals room requires a live Supabase project with a real artist account — not exercised in this session; the try/catch placement and payload construction are statically verified only."

# Metrics
duration: ~30min
completed: 2026-08-03
status: complete
---

# Phase 16 Plan 06: Buyer Request Pathway & Org Dashboard Summary

**Structured "Request License" composer with server-side pre-cleared-terms matching and Phase-13-aware target authorization, plus a read-only org-wide deal-stage dashboard — all on the live license_requests/license_request_tracks schema (migration 081) and the 16-03 buyer portal shell.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 3 completed
- **Files created:** 8

## Accomplishments
- `POST /api/buyer/requests` — a strict Zod schema over the D-07 dimensions (project, tracks, usage, territory, term, exclusivity, budget, need-by, notes) that gives client-supplied `stage`/`owner_id`/`commission_pct`/`gross_fee_cents`/`artist_net_cents`/`matched_precleared` no home to land in, so any attempt fails the whole parse rather than being silently dropped.
- `lib/deals/request-target.ts` (`authorizeRequestTarget`) — a shared rights-ready + Phase 13 visibility + block gate, running on the service-role client because tracks/vault_documents RLS excludes buyers entirely. Reused by both the POST route and the composer's project lookup so a hand-typed project id can never surface tracks (or accept a submission) for a private, unready, non-owned, or blocking artist's project.
- Server-computed `matched_precleared` via `matchesPreclearedTerms()`; mismatch reasons land in `admin_notes` (the closest admin-only fit on migration 081's schema — no dedicated column exists) for the 16-07 negotiation queue to read.
- `license_requests` + `license_request_tracks` inserted via the service-role client (migration 081 revoked client writes entirely) with a compensating delete if the child-row insert fails, so no zero-track request can persist.
- Best-effort artist notification via `createNotification`/`buildLicenseRequestNotification`, wrapped in try/catch after the primary insert (`lib/social/activity-emit.ts` convention) — never fails request creation.
- `components/buyer/RequestComposer.tsx` — guided form over every D-07 dimension with a track multi-select scoped to the pre-selected project; renders no pre-cleared terms, no match verdict, and no messaging/contact affordance anywhere.
- `components/buyer/OrgRequestDashboard.tsx` — org-wide, stage-filterable list showing submitter attribution (D-13a), requested-terms summary, stage badge, and quoted gross fee once one exists; no `matched_precleared` rendering (admin-facing only, T-16-25) and no stage-mutation control anywhere.
- `GET /api/buyer/requests/[id]` + the detail page — scoped to the caller's own `buyer_org_id`, 404 (never 403) for a request belonging to another org.

## Task Commits

Each task was committed atomically:

1. **Task 1: POST /api/buyer/requests — validated creation with pre-cleared-terms matching** — `dec4a63` (feat) — `app/api/buyer/requests/route.ts`, `lib/deals/request-target.ts`.
2. **Task 2: Request composer UI** — `aabfe53` (feat) — `components/buyer/RequestComposer.tsx`, `app/(buyer-portal)/buyers/requests/new/page.tsx`.
3. **Task 3: Org request dashboard with deal stages + request detail** — `c7f131a` (feat) — `app/api/buyer/requests/[id]/route.ts`, `components/buyer/OrgRequestDashboard.tsx`, `app/(buyer-portal)/buyers/requests/page.tsx`, `app/(buyer-portal)/buyers/requests/[id]/page.tsx`.

_No TDD tasks in this plan — all three are `type="auto"` without `tdd="true"`._

## Files Created/Modified
- `app/api/buyer/requests/route.ts` — POST: strict-Zod validation, target authorization, track-ownership verification, server-side matching, insert with compensating delete, best-effort notification.
- `app/api/buyer/requests/[id]/route.ts` — GET: org-scoped single-request read, 404-not-403.
- `lib/deals/request-target.ts` — `authorizeRequestTarget`: rights-ready + visibility + block gate shared across the pathway.
- `components/buyer/RequestComposer.tsx` — client composer form.
- `components/buyer/OrgRequestDashboard.tsx` — client dashboard list with stage filter.
- `app/(buyer-portal)/buyers/requests/page.tsx` — org dashboard server component.
- `app/(buyer-portal)/buyers/requests/new/page.tsx` — composer server component (project resolved via `?project=` query param).
- `app/(buyer-portal)/buyers/requests/[id]/page.tsx` — request detail server component.

## Decisions Made
See `key-decisions` in frontmatter for the full rationale on each. Summary:
- Routes built under `app/(buyer-portal)/buyers/requests/*` to match the nav's established `/buyers/requests` URL contract (Rule 1).
- New shared `lib/deals/request-target.ts` helper to avoid duplicating the security-critical authorization gate across two call sites (Rule 2), standing in for 16-05's not-yet-built `isRightsReady`.
- Mismatch reasons stored in the existing `admin_notes` column rather than requesting a new migration.
- `budget_cents`/`term_months` made required in this route's input validation (stricter than the nullable DB columns) to close a pre-clearance-bypass-by-omission gap.
- `matched_precleared` never rendered in buyer-facing UI, honoring "admin-facing only" (T-16-25) beyond just the composer.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — routing bug] Composer/dashboard/detail routes moved under `app/(buyer-portal)/buyers/requests/*`**
- **Found during:** Task 2 (Request composer UI)
- **Issue:** The plan's `files_modified` lists `app/(buyer-portal)/requests/page.tsx`, `.../requests/new/page.tsx`, `.../requests/[id]/page.tsx` — which Next.js resolves at `/requests`, `/requests/new`, `/requests/[id]`. `components/buyer/BuyerPortalNav.tsx` (built in 16-03) already has a static `href="/buyers/requests"` link, explicitly documented in 16-03's SUMMARY as "the URL contract Wave 3 pages should implement under the `(buyer-portal)` route group." Following the plan's literal path would have shipped a dead nav link.
- **Fix:** Built all three pages under `app/(buyer-portal)/buyers/requests/{page,new/page,[id]/page}.tsx`, resolving at `/buyers/requests`, `/buyers/requests/new`, `/buyers/requests/[id]` — matching the nav.
- **Files modified:** `app/(buyer-portal)/buyers/requests/page.tsx`, `app/(buyer-portal)/buyers/requests/new/page.tsx`, `app/(buyer-portal)/buyers/requests/[id]/page.tsx`.
- **Verification:** `npm run build` shows all three routes compiled at the corrected paths (`/buyers/requests`, `/buyers/requests/new`, `/buyers/requests/[id]`).
- **Committed in:** `aabfe53` (new/page.tsx), `c7f131a` (page.tsx, [id]/page.tsx) — part of each task commit.

**2. [Rule 2 — missing shared functionality] Added `lib/deals/request-target.ts`**
- **Found during:** Task 1 (POST /api/buyer/requests)
- **Issue:** The plan instructs the POST route to reuse "the same rights-ready and Phase 13 visibility/block checks the catalog route applies," but `lib/deals/catalog.ts` (plan 16-05's `isRightsReady`) does not exist on disk — 16-06 depends only on 16-02/16-03, and 16-05 (same wave, no ordering guarantee) had not been executed at this session's start. The composer's project/track lookup (Task 2) also needs the identical gate, since tracks/vault_documents RLS excludes buyer sessions entirely.
- **Fix:** Added `lib/deals/request-target.ts` exporting `authorizeRequestTarget`, composed from already-shipped primitives (`computeStage3`, `isProfileVisibleTo`, `isBlockedRelativeTo`), reused by both the POST route and the composer's `new/page.tsx`.
- **Files modified:** `lib/deals/request-target.ts` (new), consumed by `app/api/buyer/requests/route.ts` and `app/(buyer-portal)/buyers/requests/new/page.tsx`.
- **Verification:** `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean; both call sites compile against the same exported type.
- **Committed in:** `dec4a63` (helper + POST route), consumed again in `aabfe53`.

---

**Total deviations:** 2 auto-fixed (1 Rule 1 routing fix, 1 Rule 2 missing shared functionality).
**Impact on plan:** Both were necessary for correctness — the routing fix prevents a dead nav link the plan's own dependency (16-03) already shipped, and the shared authorization helper closes a security-relevant DRY gap between the plan's two check sites (POST route and composer). No scope creep beyond what the plan's own must-haves required.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None — no external service configuration required. No new migration in this plan (writes go through the service-role route against migration 081's already-live tables).

## Outstanding / Not Executed

Live-database behavioral checks were not run in this session — no Supabase live-DB commands were executed, matching the same DEFERRED precedent already recorded against 16-02's, 16-04's, and 16-05's (pending) SUMMARYs:

- A real buyer session POSTing a request end-to-end, confirming `matched_precleared`/`admin_notes` land correctly and that a raw `stage`/`owner_id`/`commission_pct` field in the body is rejected.
- `authorizeRequestTarget` rejecting a private, unready, non-owned, and blocking-artist project against real seeded rows.
- Cross-org 404 (not 403) on `GET /api/buyer/requests/[id]` with two live buyer accounts in different orgs.
- The artist notification actually landing in the recipient's Deals room.

These fold into the same outstanding Wave 2/3 behavioral-adversarial-check list already tracked against this phase's prior SUMMARYs, to be executed once a live buyer account and a live artist project with pre-cleared terms both exist against a real Supabase instance.

## Pre-existing Documentation Gap (not fixed by this executor)

`requirements mark-complete PORTAL-04 PORTAL-05 DEAL-05` returned `not_found` for all three — REQUIREMENTS.md still has no Phase 16 section registering these IDs. This is the same gap already recorded against 16-00/16-01/16-02/16-03/16-04/16-11 and deferred to a future `/gsd-docs-update` pass.

## Next Phase Readiness

Plan 16-07 (admin negotiation queue) can now read `admin_notes` (mismatch reasons), `matched_precleared`, and every `license_requests`/`license_request_tracks` row this plan creates, and is the first surface with authority to mutate `stage`/`owner_id`/`commission_pct`. Plan 16-05 (buyer catalog), when it lands, should point its "Request" card links at `/buyers/requests/new?project=<id>` — the exact query-param contract this plan's composer page already reads — and its future executor should apply the same `app/(buyer-portal)/buyers/*` path correction this plan applied (see Decision 1). No blockers.

---
*Phase: 16-gtm-beta-buyer-portal*
*Completed: 2026-08-03*

## Self-Check: PASSED

All 8 created artifacts confirmed present on disk (`lib/deals/request-target.ts`, `app/api/buyer/requests/route.ts`, `app/api/buyer/requests/[id]/route.ts`, `components/buyer/RequestComposer.tsx`, `components/buyer/OrgRequestDashboard.tsx`, `app/(buyer-portal)/buyers/requests/page.tsx`, `app/(buyer-portal)/buyers/requests/new/page.tsx`, `app/(buyer-portal)/buyers/requests/[id]/page.tsx`). All 3 task commits (`dec4a63`, `aabfe53`, `c7f131a`) confirmed in git log. `npx tsc --noEmit`, `npm run lint`, `npx jest` (103 suites / 1299 tests, zero regressions), and `npm run build` all green — routes verified compiled at the corrected `/buyers/requests` paths.
