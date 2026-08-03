---
phase: 16-gtm-beta-buyer-portal
plan: 04
subsystem: deals
tags: [nextjs, api-route, rls, typescript, react, license-requests, deals-room]

# Dependency graph
requires:
  - license_requests / license_request_tracks / project_license_terms (migration 081, plan 16-02)
  - lib/deals/schema.ts (DEAL_STAGE_LABELS, USAGE_TYPE_VALUES/LABELS, TERRITORY_VALUES/LABELS, LicenseRequest, ProjectLicenseTerms types)
  - buyer_orgs / buyer_members (migration 080, plan 16-01) — buyer company name lookup
  - existing rights page (app/(artist)/vault/[projectId]/rights/page.tsx) — pre-cleared terms mount point
  - existing ArtistNav item shape (components/nav/ArtistNav.tsx) — Deals sidebar entry
provides:
  - GET/PATCH /api/vault/[projectId]/licensing (project_license_terms 1:1 upsert, ownership-gated)
  - components/vault/PreclearedTermsForm.tsx (Marmoset-five editor)
  - app/(artist)/deals/page.tsx + components/deals/ArtistDealsList.tsx (D-15b Deals room)
  - Deals entry in ArtistNav + DealsIcon in components/nav/icons.tsx
affects: [16-06-buyer-request-route, 16-07-admin-negotiation-queue]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ownership-then-service-role write split: session client verifies vault_projects ownership (explicit column list, 404 on non-owned/nonexistent — no existence leak), service-role client performs the actual write only after that check passes, since migration 081 revoked client INSERT/UPDATE on project_license_terms"
    - "Deals room artist-visibility scoping resolves the caller's OWNED vault_projects id set first, then filters license_requests to that set — never a bare vault_project_id IN (SELECT id FROM vault_projects) subquery, since migration 078 widened vault_projects' own SELECT to owner-OR-member (C4)"
    - "Buyer company/requester enrichment on the Deals page reads through the service-role client deliberately: buyer_orgs' own RLS scopes SELECT to org members (which an artist is not), and buyer accounts have no user_profiles row at all (migration 080's handle_new_user() buyer branch is an early-return), so the requester's display name is resolved via auth.admin.getUserById().user_metadata.display_name — the same lookup already used by the admin buyer-orgs members route"
    - "PreclearedTermsForm sources every option list from lib/deals/schema.ts (USAGE_TYPE_VALUES/LABELS, TERRITORY_VALUES/LABELS) — the same module the buyer request composer (16-06) and matching.ts read, so vocabulary can never drift between the pre-clearance form and match logic"

key-files:
  created:
    - app/api/vault/[projectId]/licensing/route.ts
    - components/vault/PreclearedTermsForm.tsx
    - app/(artist)/deals/page.tsx
    - components/deals/ArtistDealsList.tsx
  modified:
    - app/(artist)/vault/[projectId]/rights/page.tsx
    - components/nav/ArtistNav.tsx
    - components/nav/icons.tsx

key-decisions:
  - "[C4, applied verbatim per plan] Deals page resolves the artist's owned project id set via an explicit vault_projects.user_id = auth.uid() query BEFORE querying license_requests, then filters with .in('vault_project_id', ownedProjectIds) — never a bare RLS-visible subquery. Migration 078 widened vault_projects' own SELECT policy to owner-OR-member; a naive read would leak requests on merely-collaborated projects."
  - "Licensing route follows the app/api/connections PATCH precedent (10-03): ownership check returns 404, not 403, for a non-owned or nonexistent project, so the route reveals nothing about project existence to a caller who doesn't own it."
  - "GET /api/vault/[projectId]/licensing returns the raw project_license_terms row or null — never a default-shaped empty object — so the UI (and D-15a's routing decision) can distinguish 'no terms set' from 'set to empty'."
  - "PATCH upsert only writes the columns present in the sanitized allowlist, relying on upsert(...).onConflict('vault_project_id') to leave unspecified columns untouched on an existing row (partial-PATCH semantics) while still producing a valid insert with DB column defaults on first write."
  - "Deals room deliberately renders no reply/message/accept/decline control anywhere — the only actionable link on a request row points to the project's pre-cleared terms editor, consistent with D-14b (admin-mediated beta communication) and D-15 (pre-clear, don't approve individual requests)."
  - "Requester individual name resolved via service.auth.admin.getUserById(id).user_metadata.display_name rather than any table read, because buyer accounts have no user_profiles row (D-11's fully-separate-account model, migration 080's early-return handle_new_user() buyer branch)."

# Metrics
duration: ~35min
completed: 2026-08-03
status: complete
---

# Phase 16 Plan 04: Artist Pre-Cleared Terms & Deals Room Summary

**Gives artists the two consent-model surfaces: a per-project pre-cleared-terms editor (the Marmoset five) mounted on the existing rights page, and a dedicated `/deals` sidebar room listing every license request across their projects with deal stage and buyer-company attribution — no messaging affordance anywhere, matching the admin-mediated beta communication model.**

## What Was Built

- **`app/api/vault/[projectId]/licensing/route.ts`** — GET/PATCH on `project_license_terms`. Ownership is verified on the session client via an explicit `id, user_id` column read before any write; non-owned/nonexistent projects return 404 (never 403 — no existence leak). PATCH accepts only the five allowlisted dimensions (`min_fee_cents`, `allowed_usage_types`, `territories`, `exclusivity_allowed`, `max_term_months`) with vocabulary validation against `lib/deals/schema.ts` and numeric clamping (negative or absurdly large values rejected with a descriptive error); unknown keys are silently dropped. The write itself runs on the service-role client — migration 081 revoked client INSERT/UPDATE on this table entirely — but only after the ownership check on the session client has already passed. GET returns the raw row or `null`, keeping "not set" distinguishable from "set to empty."
- **`components/vault/PreclearedTermsForm.tsx`** — client component with one control per Marmoset dimension: a dollar-denominated minimum-fee input, chip multi-selects for usage types and territories (options sourced from `lib/deals/schema.ts`), a three-way exclusivity toggle (Yes / No / Unset), and a maximum-term-months input. Explainer copy frames what pre-clearing does and states plainly that leaving terms unset is a valid choice. PATCHes the licensing route and calls `router.refresh()` on success, following the existing `RightsStatusPatch` convention.
- **`app/(artist)/vault/[projectId]/rights/page.tsx`** — extended with a new "Pre-Cleared Licensing Terms" section (not a competing route) mounting the form; current terms are fetched server-side via the session client (RLS already scopes the read to the owning artist) and passed as props.
- **`app/(artist)/deals/page.tsx`** — server component. Resolves the artist's owned `vault_projects` id set explicitly, then queries `license_requests` filtered to that id set with a column-explicit select restricted to migration 081's client-granted columns (never `admin_notes`/`owner_id`/`commission_pct`/`artist_net_cents`). Buyer company names and requester display names are resolved via the service-role client (buyer_orgs' own RLS excludes non-members; buyer accounts have no `user_profiles` row at all, so the requester name comes from `auth.admin.getUserById().user_metadata.display_name`).
- **`components/deals/ArtistDealsList.tsx`** — presentational list. Each row shows the buyer company prominently plus the individual requester (D-13a), the project, usage/territory/term/exclusivity summary, budget, need-by date, and a stage badge from `DEAL_STAGE_LABELS`. Empty state explains when rows will appear. No reply/message/accept/decline control anywhere — the only link on a row points to that project's pre-cleared terms editor.
- **`components/nav/ArtistNav.tsx` / `components/nav/icons.tsx`** — added a `Deals` entry (`/deals`, artist-capability-gated, alongside Sound Vault/Contract Locker) and a new handshake `DealsIcon`.

## Deviations from Plan

### None beyond the plan's own explicit instructions

The C4 explicit-ownership scoping and the granted-column-only discipline were written into this plan's Task 1/Task 3 action prose as mandatory corrections, not discovered mid-execution — recorded here as posture decisions honored verbatim, not Rule 1-4 deviations.

One minor addition not explicitly named in the plan: `/deals` redirects to `/vault` when `NEXT_PUBLIC_VAULT_DEMO=true` (Rule 3 — no demo-data source exists for `license_requests`, matching the existing precedent already set by the rights page for the same reason).

## Pre-existing Documentation Gap (not fixed by this executor)

`requirements mark-complete ARTIST-01 ARTIST-02` returned `not_found` for both — REQUIREMENTS.md still has no Phase 16 section registering these IDs. This is the same gap already recorded against 16-00/16-01/16-02/16-03/16-11 and deferred to a future `/gsd-docs-update` pass.

## Task Commits

1. **Task 1: Pre-cleared terms API** — `aeaa85f` (feat) — GET/PATCH `app/api/vault/[projectId]/licensing/route.ts`.
2. **Task 2: Pre-cleared terms form + rights page mount** — `47779bd` (feat) — `components/vault/PreclearedTermsForm.tsx`, `app/(artist)/vault/[projectId]/rights/page.tsx`.
3. **Task 3: Artist Deals room + sidebar entry** — `b90a219` (feat) — `app/(artist)/deals/page.tsx`, `components/deals/ArtistDealsList.tsx`, `components/nav/ArtistNav.tsx`, `components/nav/icons.tsx`.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` (`eslint . --max-warnings=0`) — clean.
- `npx jest` — 103 suites / 1299 tests passed, zero regressions.
- `npm run build` — clean; `/deals` and `/api/vault/[projectId]/licensing` both compile into the route manifest.
- Plan's per-task automated verify greps (getUser/project_license_terms present; `PreclearedTermsForm` mounted on the rights page; `'/deals'` present in `ArtistNav.tsx`; `app/(artist)/deals/page.tsx` exists) — all passed.

## Outstanding / Not Executed

Live-database behavioral checks (terms round-trip via a real PATCH-then-GET call against a live Supabase instance; a live artist session confirming a merely-shared project's requests are excluded from `/deals`) were not run — this plan required no new migration and made no live-DB calls itself. These fold into the same outstanding Wave 2 behavioral-adversarial-check list already recorded against 16-02's SUMMARY (buyer-cannot-UPDATE-stage, admin-column exclusion, artist-ownership-scoping smoke test), now joined by: PATCH-then-GET round-trip on `project_license_terms`, and a real second-artist-collaborator smoke test against the Deals room's C4 scoping.

## Threat Flags

None beyond the plan's own threat model (T-16-13 through T-16-16), which are addressed by the artifacts above. No new surface introduced outside the plan's scope.

## Self-Check

- `app/api/vault/[projectId]/licensing/route.ts` — FOUND
- `components/vault/PreclearedTermsForm.tsx` — FOUND
- `app/(artist)/vault/[projectId]/rights/page.tsx` — FOUND (modified)
- `app/(artist)/deals/page.tsx` — FOUND
- `components/deals/ArtistDealsList.tsx` — FOUND
- `components/nav/ArtistNav.tsx` — FOUND (modified)
- `components/nav/icons.tsx` — FOUND (modified)
- Commit `aeaa85f` — FOUND in git log
- Commit `47779bd` — FOUND in git log
- Commit `b90a219` — FOUND in git log

---
*Phase: 16-gtm-beta-buyer-portal*
*Completed: 2026-08-03*

## Self-Check: PASSED

All listed artifacts and task commits confirmed present on disk / in git log. tsc/lint/jest/build all green.
