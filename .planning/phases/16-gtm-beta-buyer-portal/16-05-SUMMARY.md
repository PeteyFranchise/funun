---
phase: 16-gtm-beta-buyer-portal
plan: 05
subsystem: deals
tags: [nextjs, api-route, postgres-rls, jsonb-gin, typescript, react, buyer-portal, catalog]

# Dependency graph
requires:
  - phase: 16-00
    provides: "MOOD_VALUES/ENERGY_VALUES/VOCAL_VALUES descriptor vocabulary + tracks.metadata descriptors JSONB shape"
  - phase: 16-02
    provides: "license_requests/license_request_tracks schema, lib/deals/schema.ts, computeStage3 rights-ready primitives"
  - phase: 16-03
    provides: "app/(buyer-portal) shell + BuyerPortalNav.tsx's static /buyers/catalog and /buyers/shortlists URL contract"
provides:
  - "isRightsReady/buildCatalogFilter/normalizeKeySignature (lib/deals/catalog.ts) — the single tunable rights-ready + filter-vocabulary helper"
  - "GET /api/buyer/catalog — server-side-only, paged, filtered rights-ready catalog browse for both buyer tiers"
  - "GET/POST/DELETE /api/buyer/shortlists — org-shared shortlists scoped by buyer_members-derived org_id"
  - "migration 083 (buyer_shortlists table + tracks.metadata GIN index) — approved and live"
  - "app/(buyer-portal)/buyers/catalog and .../buyers/shortlists pages + CatalogBrowser/ShortlistPanel components"
affects: [16-07-admin-negotiation-queue, 16-08-stripe-application-fee, 16-10-gtm-metrics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "isRightsReady (lib/deals/catalog.ts) is the single named helper for the rights-ready definition (public AND readiness >= tunable threshold AND computeStage3().canContinue) — no parallel boolean flag column, avoiding desync with the readiness pipeline."
    - "Key/BPM/descriptor filters (D-16b/D-16c) are any-track-matches predicates evaluated against the same bounded track fetch Stage 3 already needs — no second per-project query. normalizeKeySignature canonicalizes free-form key_signature text before matching."
    - "Catalog query I/O (loadCatalogPage) lives in lib/deals/catalog-query.ts, not app/api/buyer/catalog/route.ts — a route.ts module may only export HTTP handlers plus route-config, never arbitrary helpers (Next.js route type-checking), so the extraction mirrors the 16-06 lib/deals/request-target.ts precedent for shared logic outside route files."
    - "buyer_shortlists RLS reuses migration 080's is_buyer_org_member() SECURITY DEFINER helper; writes are entirely server-owned (INSERT/UPDATE/DELETE revoked from authenticated/anon), org_id always derived from the caller's buyer_members row inside the service-role route, never from the request body (T-16-19)."
    - "Shortlist reads re-evaluate rights-readiness at render time (lib/deals/shortlists.ts loadShortlistEntries) rather than trusting the row's existence — a project that went private or fell below readiness after being saved is visibly flagged stale, never silently dropped."

key-files:
  created:
    - lib/deals/catalog.ts
    - lib/deals/catalog.test.ts
    - lib/deals/catalog-query.ts
    - lib/deals/shortlists.ts
    - supabase/migrations/083_buyer_shortlists.sql
    - app/api/buyer/catalog/route.ts
    - app/api/buyer/shortlists/route.ts
    - app/(buyer-portal)/buyers/catalog/page.tsx
    - app/(buyer-portal)/buyers/shortlists/page.tsx
    - components/buyer/CatalogBrowser.tsx
    - components/buyer/ShortlistPanel.tsx
  modified: []

key-decisions:
  - "[Rule 1 — routing bug fix] Plan's files_modified listed app/(buyer-portal)/catalog/page.tsx and .../shortlists/page.tsx, which would resolve at /catalog and /shortlists — dead links relative to BuyerPortalNav.tsx's existing static hrefs /buyers/catalog and /buyers/shortlists (established in 16-03, and flagged in 16-06's SUMMARY as the identical mismatch 16-05 would hit). Built both pages under app/(buyer-portal)/buyers/catalog/page.tsx and app/(buyer-portal)/buyers/shortlists/page.tsx instead, matching the nav exactly."
  - "[Rule 3 — blocking build fix] Extracted lib/deals/catalog-query.ts. loadCatalogPage was originally exported from app/api/buyer/catalog/route.ts so the server-rendered catalog page could reuse the identical query; npm run build failed Next.js route type-checking because a route.ts module may only export HTTP method handlers plus a small route-config set, never arbitrary helper functions. Moved the I/O half of the catalog query into lib/deals/catalog-query.ts (mirroring 16-06's lib/deals/request-target.ts precedent); the route and the page both import the same function, no behavior change."
  - "Approved live push of migration 083 (buyer_shortlists table + tracks.metadata GIN index) — operator confirmed supabase migration list shows LOCAL=REMOTE through 083 and a service-role PostgREST read on buyer_shortlists returned 200. This confirms schema-level correctness only (service-role bypasses RLS); the buyer-session behavioral adversarial check is DEFERRED (see Outstanding below), consistent with 16-01/02/04/06/11's precedent."
  - "POST /api/buyer/shortlists re-runs the same authorizeRequestTarget-equivalent rights-ready + Phase 13 visibility + block gate the catalog route applies, so a buyer cannot shortlist a project id they could not legitimately browse (closes the 'admin-curated placement later goes private' abuse case named in 16-VALIDATION)."
  - "Shortlist GET/page re-evaluates rights-readiness per entry at read time rather than trusting the stored row — a project that has since gone private or fallen below the readiness threshold is rendered with a visible stale/ineligible marker, never silently removed from the list."

requirements-completed: [PORTAL-01, PORTAL-02, PORTAL-03]

coverage:
  - id: D1
    description: "isRightsReady expresses the rights-ready definition (public AND readiness >= tunable threshold AND computeStage3().canContinue) as one named helper, green across all six behavior cases including fail-closed and boundary rows."
    requirement: "PORTAL-01"
    verification:
      - kind: unit
        ref: "lib/deals/catalog.test.ts — isRightsReady behavior cases (not-public, below-threshold, stage3-blocked, at-threshold-boundary, all-clear, missing-readiness fail-closed)"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit && npm run lint"
        status: pass
    human_judgment: false
  - id: D2
    description: "buildCatalogFilter/normalizeKeySignature/descriptor-containment matching correctly implement any-track-matches semantics for key, BPM, mood/energy/vocals, with inclusive range boundaries and null-excludes-only-when-filter-active."
    requirement: "PORTAL-01"
    verification:
      - kind: unit
        ref: "lib/deals/catalog.test.ts — key/BPM/descriptor filter behavior cases (partial-track-match, null-bpm/key exclusion vs. inclusion, boundary inclusivity, normalizeKeySignature variants)"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /api/buyer/catalog authorizes both requester and approver tiers, queries server-side only (never a direct PostgREST surface), applies is_public + Phase 13 visibility/block exclusion + isRightsReady + the full filter vocabulary on a paged/bounded fetch, and accepts no free-text query parameter."
    requirement: "PORTAL-02"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit && npm run lint && grep -Eq isRightsReady app/api/buyer/catalog/route.ts && grep -Eq computeStage3 app/api/buyer/catalog/route.ts"
        status: pass
      - kind: automated_ui
        ref: "npm run build — /api/buyer/catalog, /buyers/catalog compile into the route manifest"
        status: pass
    human_judgment: true
    rationale: "A requester-tier (non-approver) account actually receiving 200 rather than 403, and a private/blocked artist's project actually being excluded end-to-end, both require a live Supabase project with a real buyer session and seeded artist/block rows — not exercised in this session, matching the same DEFERRED-behavioral-check precedent recorded against 16-01/02/04/06/11's SUMMARYs."
  - id: D4
    description: "GET/POST/DELETE /api/buyer/shortlists: org_id always derived from the caller's buyer_members row (never the request body); both tiers may save/remove; POST rejects a project that is not currently rights-ready and visible; a stale entry (project gone private or below readiness) is flagged, not dropped; nothing is exposed to artists."
    requirement: "PORTAL-03"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit && npm run lint && grep -Eq buyer_shortlists app/api/buyer/shortlists/route.ts && grep -Eq buyer_members app/api/buyer/shortlists/route.ts"
        status: pass
      - kind: automated_ui
        ref: "npm run build — /api/buyer/shortlists, /buyers/shortlists compile into the route manifest"
        status: pass
    human_judgment: true
    rationale: "Org-wide visibility (a save by one member appearing for the whole org) and rejection of a same-org write attempting a foreign org_id both require two live buyer accounts against a real Supabase instance — not exercised in this session."
  - id: D5
    description: "Migration 083 (buyer_shortlists + tracks.metadata GIN index) pushed live; supabase migration list shows LOCAL=REMOTE through 083 and PostgREST recognizes buyer_shortlists (service-role read returns 200). Operator approved."
    requirement: "PORTAL-03"
    verification:
      - kind: manual_procedural
        ref: "Operator-run `supabase db push` + `supabase migration list` (LOCAL=REMOTE through 083) + service-role PostgREST read on buyer_shortlists (200 OK) — operator response: 'approved'"
        status: pass
    human_judgment: true
    rationale: "Live database push is a human-gated checkpoint per this plan's own Task 4; confirmed schema-level only. The buyer-session adversarial behavioral check (direct insert 42501, cross-org zero-rows) is separately tracked as D6 below and is NOT covered by this schema-level confirmation."
  - id: D6
    description: "Adversarial check as a real buyer session: a direct insert into buyer_shortlists fails with 42501, and selecting another org's shortlist rows returns zero rows."
    requirement: "PORTAL-03"
    verification: []
    human_judgment: true
    rationale: "DEFERRED — OUTSTANDING, not passed. This check requires an exercised buyer account; buyer signup exists in the portal but no real buyer account has been created and used end-to-end in this session. Schema-level confirmation (D5) only proves the service role can read the table, which bypasses RLS entirely and says nothing about buyer-session enforcement. Matches the exact precedent already recorded against 16-01/02/04/06/11's SUMMARYs for their own RLS-enforcement adversarial checks — tracked as an outstanding item for the phase verifier before Phase 16 is marked passed."

# Metrics
duration: ~12min (code) + human-gated live-push checkpoint
completed: 2026-08-03
status: complete
---

# Phase 16 Plan 05: Rights-Ready Catalog Browse & Org-Shared Shortlists Summary

**A filtered, rights-ready catalog browser (genre/mood/energy/vocals/usage-cleared/key/BPM, no free-text search) gated on isRightsReady, plus org-shared shortlists with is_buyer_org_member-scoped RLS and server-owned writes — migration 083 approved and live at the schema level, with the buyer-session adversarial RLS check recorded as outstanding.**

## Performance

- **Duration:** ~12 min of code execution (03:27–03:39) + a separate human-gated live-push checkpoint (approved)
- **Tasks:** 3 completed + 1 checkpoint (human-verify, approved)
- **Files created:** 11

## Accomplishments
- `lib/deals/catalog.ts` — `isRightsReady()` (public AND readiness ≥ one tunable named-constant threshold AND `computeStage3().canContinue`, fail-closed on missing readiness, inclusive at the boundary) as the single source of truth for the rights-ready definition; no parallel boolean flag column.
- `buildCatalogFilter()` / `normalizeKeySignature()` / descriptor-containment matchers implementing the D-16/D-16b/D-16c filter vocabulary (genre, mood, energy, vocals, usage cleared, musical key, BPM) as any-track-matches predicates with correct null-handling (excluded only when that filter is active) and inclusive range boundaries — all reusing `MOOD_VALUES`/`ENERGY_VALUES`/`VOCAL_VALUES` from `lib/metadata/schema.ts` rather than a second vocabulary.
- Migration 083: `buyer_shortlists` table (org-scoped RLS via `is_buyer_org_member()`, writes revoked from `authenticated`/`anon`, `UNIQUE(org_id, vault_project_id)`) plus a GIN index on `tracks.metadata` to serve the descriptor containment filters at scale.
- `GET /api/buyer/catalog` (via `lib/deals/catalog-query.ts`'s `loadCatalogPage`) — authorizes both requester and approver tiers, queries `vault_projects` server-side only (never a direct PostgREST surface), applies `is_public` + Phase 13 visibility/block exclusion + `isRightsReady` + the full filter vocabulary on a paged, bounded fetch reusing the same track fetch Stage 3 already needs (no second round trip for key/BPM). No free-text query parameter anywhere.
- `CatalogBrowser.tsx` — client component owning filter state and pagination; renders key/BPM on each card; links to the 16-06 request composer by href only; exposes save-to-shortlist wired to Task 3's API.
- `GET/POST/DELETE /api/buyer/shortlists` — `org_id` always derived from the caller's `buyer_members` row (never the request body, T-16-19); POST re-runs the rights-ready + visibility + block gate before allowing a save; writes go through the service-role client since migration 083 revokes client writes.
- `lib/deals/shortlists.ts`'s `loadShortlistEntries` re-evaluates rights-readiness at read time — a stale entry (project gone private or fallen below readiness since being saved) is visibly flagged, never silently dropped. `ShortlistPanel.tsx` renders dual-level attribution (who saved it, when) with no artist-facing surface, notification, or write path anywhere.
- Migration 083 pushed live and operator-approved: `supabase migration list` confirms LOCAL=REMOTE through 083, and PostgREST recognizes `buyer_shortlists` (service-role read returned 200).

## Task Commits

Each task was committed atomically:

1. **Task 1: isRightsReady helper + buyer_shortlists schema addition** — `99b800d` (test, TDD RED-then-GREEN) — `lib/deals/catalog.ts`, `lib/deals/catalog.test.ts`, `supabase/migrations/083_buyer_shortlists.sql`.
2. **Task 2: Filtered rights-ready catalog API + browse page** — `acc51d2` (feat) — `app/api/buyer/catalog/route.ts`, `app/(buyer-portal)/buyers/catalog/page.tsx`, `components/buyer/CatalogBrowser.tsx`.
3. **Rule 3 fix (within Task 2's build-verification loop):** `2542715` (fix) — extracted `lib/deals/catalog-query.ts`; `app/api/buyer/catalog/route.ts` reduced to HTTP handlers only.
4. **Task 3: Org-shared shortlists API + panel** — `5ea532d` (feat) — `app/api/buyer/shortlists/route.ts`, `app/(buyer-portal)/buyers/shortlists/page.tsx`, `components/buyer/ShortlistPanel.tsx`, `lib/deals/shortlists.ts`.
5. **Task 4: checkpoint:human-verify** — migration 083 live push. Operator ran `supabase db push`, confirmed `supabase migration list` shows LOCAL=REMOTE through 083, and confirmed PostgREST recognizes `buyer_shortlists` via a service-role 200 read. **Operator response: "approved."**

## Files Created/Modified
- `lib/deals/catalog.ts` — `isRightsReady`, `RIGHTS_READY_THRESHOLD`, `buildCatalogFilter`, `normalizeKeySignature`, descriptor/key/BPM predicate helpers.
- `lib/deals/catalog.test.ts` — RED-then-GREEN behavior cases for all of the above.
- `lib/deals/catalog-query.ts` — `loadCatalogPage`: the I/O half of the catalog query, extracted out of the route so both the API route and the server-rendered page share one implementation.
- `lib/deals/shortlists.ts` — `loadShortlistEntries`: read-time rights-readiness re-evaluation shared by the GET handler and the shortlists page.
- `supabase/migrations/083_buyer_shortlists.sql` — `buyer_shortlists` table + RLS + GIN index on `tracks.metadata`. Approved and live.
- `app/api/buyer/catalog/route.ts` — GET handler only (post-extraction).
- `app/api/buyer/shortlists/route.ts` — GET/POST/DELETE handlers.
- `app/(buyer-portal)/buyers/catalog/page.tsx` — server component rendering `CatalogBrowser` with the first page of results.
- `app/(buyer-portal)/buyers/shortlists/page.tsx` — server component rendering `ShortlistPanel`.
- `components/buyer/CatalogBrowser.tsx` — client filter/pagination/save-to-shortlist UI.
- `components/buyer/ShortlistPanel.tsx` — client org-shared shortlist UI with dual-level attribution and stale-entry flagging.

## Decisions Made
See `key-decisions` in frontmatter for full rationale. Summary:
- Pages built under `app/(buyer-portal)/buyers/catalog/` and `.../buyers/shortlists/` (not the plan's literal `app/(buyer-portal)/catalog/` / `.../shortlists/`) to match `BuyerPortalNav.tsx`'s established `/buyers/*` URL contract — the exact correction 16-06's SUMMARY predicted 16-05 would need (Rule 1).
- Catalog query I/O extracted to `lib/deals/catalog-query.ts` after `npm run build` failed Next.js route type-checking on a non-handler export (Rule 3).
- Migration 083 approved and pushed live by the human operator; confirmed at the schema level only (service-role bypasses RLS).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — routing bug] Catalog/shortlists pages moved under `app/(buyer-portal)/buyers/*`**
- **Found during:** Task 2 (Filtered rights-ready catalog API + browse page)
- **Issue:** The plan's `files_modified` lists `app/(buyer-portal)/catalog/page.tsx` and `app/(buyer-portal)/shortlists/page.tsx`, resolving at `/catalog` and `/shortlists` — dead links relative to `components/buyer/BuyerPortalNav.tsx`'s existing static `/buyers/catalog` and `/buyers/shortlists` hrefs (established in 16-03; 16-06's SUMMARY explicitly flagged this exact mismatch as the correction 16-05 would need to apply).
- **Fix:** Built both pages under `app/(buyer-portal)/buyers/catalog/page.tsx` and `app/(buyer-portal)/buyers/shortlists/page.tsx`, resolving at `/buyers/catalog` and `/buyers/shortlists` — matching the nav.
- **Files modified:** `app/(buyer-portal)/buyers/catalog/page.tsx`, `app/(buyer-portal)/buyers/shortlists/page.tsx`.
- **Verification:** `npm run build` shows both routes compiled at the corrected paths.
- **Committed in:** `acc51d2` (catalog page), `5ea532d` (shortlists page).

**2. [Rule 3 — blocking build failure] Extracted `lib/deals/catalog-query.ts`**
- **Found during:** Task 2 (Filtered rights-ready catalog API + browse page)
- **Issue:** `loadCatalogPage` was originally exported directly from `app/api/buyer/catalog/route.ts` so the server-rendered catalog page could reuse the identical query. `npm run build` failed Next.js route type-checking — a `route.ts` module may only export HTTP method handlers plus a small route-config set (`dynamic`, `revalidate`, `runtime`, ...), never arbitrary helper functions.
- **Fix:** Moved the I/O half of the catalog query into `lib/deals/catalog-query.ts`, mirroring the existing `lib/deals/request-target.ts` (16-06) precedent for shared logic living outside route files. Both the route and the page import the same function; no behavior change, same rights-ready + Phase 13 visibility + block gate.
- **Files modified:** `app/(buyer-portal)/buyers/catalog/page.tsx`, `app/api/buyer/catalog/route.ts`, `lib/deals/catalog-query.ts` (new).
- **Verification:** `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean; route and page compile against the same exported function.
- **Committed in:** `2542715`.

---

**Total deviations:** 2 auto-fixed (1 Rule 1 routing fix, 1 Rule 3 blocking build fix).
**Impact on plan:** Both were necessary for correctness — the routing fix prevents dead nav links the plan's own dependency (16-03) already shipped, and the extraction was required simply to get `npm run build` to pass under Next.js route-export constraints. No scope creep beyond what the plan's own must-haves required.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None — no external service configuration required beyond the already-completed migration 083 push (see Task 4 checkpoint above).

## Outstanding / Not Executed

Migration 083 is confirmed live at the **schema level only** (service-role bypasses RLS). The plan's Task 4 checkpoint also calls for an **adversarial check as a real buyer session** — this is DEFERRED, NOT passed, and recorded here as outstanding, consistent with the identical precedent already recorded against 16-01/02/04/06/11's SUMMARYs:

- A direct insert into `buyer_shortlists` from a real buyer session must fail with `42501` (RLS write-revoke enforcement, not just the schema-level REVOKE existing on paper).
- Selecting another org's `buyer_shortlists` rows from a real buyer session must return zero rows (RLS org-scoped SELECT enforcement, not just the policy text).

Buyer signup exists in the portal (16-01), but no real buyer account has been created and exercised end-to-end in this session — this check requires one. It folds into the same Wave 0–3 outstanding behavioral-adversarial-check list already tracked in STATE.md against 16-01/02/04/06/11, to be executed together once a live buyer account exists against the real Supabase instance.

## Next Phase Readiness

Plan 16-07 (admin negotiation workspace, already executed) and plan 16-06 (buyer request pathway, already executed) both depend on this plan's rights-ready and visibility gates being correct; both were built against equivalent inline primitives before this plan existed and can be reconciled to import `isRightsReady` directly in a later cleanup pass if desired (not required — no drift risk since both apply the identical underlying `computeStage3`/visibility/block primitives).

With 16-05/06/07 all complete, **Wave 2 of Phase 16 (16-05, 16-06, 16-07) is done.** 9 of 12 plans in Phase 16 are now executed. No blockers for Wave 3.

---
*Phase: 16-gtm-beta-buyer-portal*
*Completed: 2026-08-03*

## Self-Check: PASSED

All 11 created artifacts confirmed present on disk (`lib/deals/catalog.ts`, `lib/deals/catalog.test.ts`, `lib/deals/catalog-query.ts`, `lib/deals/shortlists.ts`, `supabase/migrations/083_buyer_shortlists.sql`, `app/api/buyer/catalog/route.ts`, `app/api/buyer/shortlists/route.ts`, `app/(buyer-portal)/buyers/catalog/page.tsx`, `app/(buyer-portal)/buyers/shortlists/page.tsx`, `components/buyer/CatalogBrowser.tsx`, `components/buyer/ShortlistPanel.tsx`). All 4 commits confirmed in git log (`99b800d`, `acc51d2`, `2542715`, `5ea532d`). Migration 083 confirmed live at the schema level by operator (LOCAL=REMOTE through 083, service-role 200 read on `buyer_shortlists`); buyer-session adversarial RLS check explicitly recorded as OUTSTANDING/DEFERRED above, not marked passed.
