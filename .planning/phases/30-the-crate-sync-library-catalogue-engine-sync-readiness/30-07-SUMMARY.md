---
phase: 30-the-crate-sync-library-catalogue-engine-sync-readiness
plan: 07
subsystem: api
tags: [next.js, supabase, typescript, jest, buyer-catalogue, sync-library]

# Dependency graph
requires:
  - phase: 30-01
    provides: rightsBadge()/CatalogRightsCode/RIGHTS_BADGE_TO_CATALOG_RIGHTS (lib/sync-library/gate.ts) — the single rights authority this plan reuses
  - phase: 30-02
    provides: readDescriptors()/INSTRUMENT_VALUES/MOOD_LABELS/ENERGY_LABELS/VOCAL_LABELS/INSTRUMENT_LABELS (lib/metadata/schema.ts) — the descriptor v2 controlled vocab this plan reuses
provides:
  - "CatalogCard enriched additively with artist/mood/energy/vocal/instruments/rights (real authored fields, not blanks)"
  - "loadCatalogPage populates those fields from real track descriptors + the real rights signal, in the SAME single query"
  - "mapCardsToLightRows maps real fields into CatalogRow instead of synthesizing blanks / hardcoding rights: 'ok'"
affects: [30-08 (role-aware Crate staff layers — now has real data to layer on)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "descriptorsToDisplay()/catalogRightsFromStage3() as pure, component-free helpers in lib/deals/catalog.ts, unit-tested independent of any I/O"
    - "Enrichment folded into the SAME batched user_profiles query already run for owner visibility — no new query added"

key-files:
  created: []
  modified:
    - lib/deals/catalog.ts
    - lib/deals/catalog.test.ts
    - lib/deals/catalog-query.ts
    - lib/deals/catalog-sample.ts

key-decisions:
  - "CatalogCard.rights is typed as gate.ts's CatalogRightsCode (imported, not redefined) — structurally identical to CatalogBrowserLight's CatalogRow.rights, so both stay one literal union without touching CatalogBrowserLight.tsx (out of this plan's declared files)."
  - "Representative track for mood/energy/vocal/instruments display = the project's FIRST track with non-null readDescriptors(); falls back to the first track (blank display) when none are tagged yet."
  - "artist_name resolved by adding one column to the EXISTING batched user_profiles select (already run for profile_visibility) rather than a second query."

patterns-established:
  - "Pure descriptor/rights display helpers live in lib/deals/catalog.ts (the same module as the other pure catalogue predicates) and are unit-tested there, keeping lib/deals/catalog-query.ts I/O-only."

requirements-completed: [CRATE-08]

coverage:
  - id: D1
    description: "descriptorsToDisplay() turns a track's confirmed descriptors into mood/energy/vocal/instruments display strings; blank for untagged tracks; drops off-vocab values"
    requirement: "CRATE-08"
    verification:
      - kind: unit
        ref: "lib/deals/catalog.test.ts#descriptorsToDisplay"
        status: pass
    human_judgment: false
  - id: D2
    description: "catalogRightsFromStage3() maps an already-computed Stage3Result to the tri-state CatalogRightsCode via rightsBadge(), matching ok/part/req across ready/partial/contact and the sample-block edge case"
    requirement: "CRATE-08"
    verification:
      - kind: unit
        ref: "lib/deals/catalog.test.ts#catalogRightsFromStage3"
        status: pass
    human_judgment: false
  - id: D3
    description: "loadCatalogPage populates CatalogCard.artist/mood/energy/vocal/instruments/rights from real data via one batched user_profiles query + the representative-track descriptor pick + the already-computed stage3 — existing admission/visibility/block/filter gates unchanged"
    requirement: "CRATE-08"
    verification:
      - kind: integration
        ref: "lib/deals/catalog-query.test.ts (existing suite, unmodified — still green against the enriched CatalogCard shape)"
        status: pass
      - kind: manual_procedural
        ref: "mocked-service round-trip script (scratchpad, not committed) exercising loadCatalogPage against a stub Supabase client with a tagged track — asserted artist/mood/energy/vocal/instruments/rights all populate correctly"
        status: pass
    human_judgment: true
    rationale: "Live Supabase credentials/network access were unavailable in this execution sandbox (.env.local read denied by the tool sandbox — consistent with prior 30-03/30-04/30-05/30-06 executor findings). Substituted with a mocked-service-client script exercising the exact loadCatalogPage code path plus the codebase's existing catalog-query.test.ts integration suite, both green. A human with staging/production Supabase access should run this plan's <verify><manual> DB round-trip (seed an admitted, rights-ready live project with authored descriptors, load /sync/catalog) before fully closing this out."
  - id: D4
    description: "mapCardsToLightRows maps card.artist/mood/energy/vocal/instruments/rights into CatalogRow instead of blanks/hardcoded 'ok'; SAMPLE_CATALOG_ROWS remains the unchanged empty-state fallback"
    requirement: "CRATE-08"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (type-level proof the mapping compiles against the enriched CatalogCard); grep confirms no remaining `rights: 'ok'` inside mapCardsToLightRows"
        status: pass
      - kind: manual_procedural
        ref: "curl http://localhost:3000/sync/catalog against the running dev server — 200 OK, no Application/Internal Server Error markup"
        status: pass
    human_judgment: true
    rationale: "A full visual browser-preview (confirming real tags + rights badges render on an actual live row, and the fixture fallback still renders with zero live rows) needs a human eyeball on the rendered page and/or seeded live DB data neither available in this sandbox. The dev-server curl smoke test confirms the page renders without a server error after the change; a human should visually confirm per the plan's <verify><manual> step."

# Metrics
duration: ~25min
completed: 2026-08-13
status: complete
---

# Phase 30 Plan 07: Live Catalogue Data Enrichment (minimal 22-05 slice) Summary

**Enriched `CatalogCard`/`loadCatalogPage`/`mapCardsToLightRows` so LIVE Crate rows now render real authored artist/mood/energy/vocal/instruments and a real tri-state rights badge (via `rightsBadge()`/`descriptorsToDisplay()`), replacing blanks and the hardcoded `rights: 'ok'`.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3 (all `type="auto"`, no checkpoints)
- **Files modified:** 4 (`lib/deals/catalog.ts`, `lib/deals/catalog.test.ts`, `lib/deals/catalog-query.ts`, `lib/deals/catalog-sample.ts`)

## Accomplishments
- `CatalogCard` (`lib/deals/catalog.ts`) gained `artist`/`mood`/`energy`/`vocal`/`instruments`/`rights` additively, with two new pure, component-free helpers: `descriptorsToDisplay()` (readDescriptors → display strings, using the shared MOOD/ENERGY/VOCAL/INSTRUMENT label maps from 30-02) and `catalogRightsFromStage3()` (Stage3Result → the tri-state `CatalogRightsCode`, via 30-01's `rightsBadge()`/`RIGHTS_BADGE_TO_CATALOG_RIGHTS` — imported, not re-derived).
- `loadCatalogPage` (`lib/deals/catalog-query.ts`) now resolves `artist_name` via the SAME batched `user_profiles` query already run for owner visibility (no new query), picks each project's first descriptor-tagged track as the representative for mood/energy/vocal/instruments, and derives `rights` from the `stage3` result already computed in the per-project loop for the `isRightsReady` gate — never recomputed, never hardcoded.
- `mapCardsToLightRows` (`lib/deals/catalog-sample.ts`) now maps `card.artist`/`mood`/`energy`/`vocal`/`instruments`/`rights` straight through instead of synthesizing blanks and forcing `rights: 'ok'`. `SAMPLE_CATALOG_ROWS` is unchanged and remains the empty-state fallback only.
- `CatalogRightsCode` is a single definition (`lib/sync-library/gate.ts`, 30-01) reused by `CatalogCard.rights` — no second/duplicate tri-state type introduced in this plan's files. The instrument vocabulary used for display (`INSTRUMENT_LABELS`, 30-02) is likewise the single controlled source, not a second ad hoc list.

## Task Commits

Each task was committed atomically:

1. **Task 1: Enrich CatalogCard with the real authored fields** - `9bbbae2` (feat)
2. **Task 2: Populate the enriched fields in the one query** - `a9b544f` (feat)
3. **Task 3: Map real fields into the Crate view-model** - `b43978b` (feat)

_No plan-metadata commit was made — this session was instructed to skip `gsd-tools state.*`/`roadmap.*` updates (STATE.md stale) and not touch `main`._

## Files Created/Modified
- `lib/deals/catalog.ts` — `CatalogCard` enriched additively; new `descriptorsToDisplay()` and `catalogRightsFromStage3()` pure helpers; `CatalogRightsCode` re-exported from `lib/sync-library/gate.ts`.
- `lib/deals/catalog.test.ts` — extended with `descriptorsToDisplay` (tagged/untagged/off-vocab) and `catalogRightsFromStage3` (ok/part/req/sample-block) coverage.
- `lib/deals/catalog-query.ts` — `loadCatalogPage` populates `artist`/`mood`/`energy`/`vocal`/`instruments`/`rights` from real data via the batched `user_profiles` query + representative-track descriptor pick + the already-computed `stage3`.
- `lib/deals/catalog-sample.ts` — `mapCardsToLightRows` maps the real fields; header comments updated to reflect the 30-07 enrichment; `SAMPLE_CATALOG_ROWS` documented as empty-state fallback only.

## Decisions Made
- Folded `artist_name` into the existing `user_profiles` visibility query (one extra column) rather than adding a second batched query — strictly fewer round-trips than the admin-page pattern the plan pointed to.
- Picked "first track with non-null `readDescriptors()`" as the representative track for project-level display fields, per the plan's explicit guidance, with a safe fallback to the first track (blank display) when no track is tagged yet.
- Left `length`/`versions`/`dynamics` untouched (still placeholder/derived-from-track-count) — `CatalogCard` does not carry them and the plan's `must_haves` scope this slice to artist/mood/energy/vocal/instruments/rights only.

## Deviations from Plan

None — plan executed exactly as written. No Rule 1/2/3/4 auto-fixes were needed; the codebase's existing `lib/deals/catalog-query.test.ts` integration suite (not in this plan's `files_modified`, left untouched) continued to pass unmodified against the enriched `CatalogCard` shape, confirming no regression to the admission/visibility/block/filter gates.

## Issues Encountered
- **DB round-trip unreachable in this sandbox.** Per the task instructions and consistent with prior 30-03/30-04/30-05/30-06 executor sessions, `.env.local` read access is denied by the tool sandbox, so a real service-role Supabase round-trip against `/sync/catalog` could not be run. Substituted with (a) the existing `lib/deals/catalog-query.test.ts` mocked-service integration suite (unmodified, still green), and (b) an ad-hoc mocked-service script (not committed — lives only in the session scratchpad) that calls `loadCatalogPage` against a stub Supabase client with a tagged track and asserts `artist`/`mood`/`energy`/`vocal`/`instruments`/`rights` all populate correctly end-to-end. A `curl` against the already-running dev server (`http://localhost:3000/sync/catalog`) confirmed a 200 response with no error markup after the change. Flagged as `D3`/`D4` (`human_judgment: true`) in this SUMMARY's coverage block — a human with staging/production Supabase access should seed one admitted, rights-ready live project with authored descriptors and visually confirm `/sync/catalog` renders real tags + a real rights badge before considering this plan fully closed.

## User Setup Required
None — no external service configuration required. No new packages, no migrations.

## Next Phase Readiness
- 30-08 (role-aware Crate staff layers) now has real `artist`/`mood`/`energy`/`vocal`/`instruments`/`rights` data on live rows to attach staff-only layers to, instead of fixture-only data.
- Recommend running the manual DB round-trip / browser-preview (Issues Encountered, above) against staging before relying on this plan's enrichment in production.
- `.claude/launch.json` was left untouched per this session's explicit instructions (pre-existing local modification unrelated to this plan; `git status` shows it as modified from before this session started).

---
*Phase: 30-the-crate-sync-library-catalogue-engine-sync-readiness*
*Completed: 2026-08-13*

## Self-Check: PASSED

All 4 modified source files + this SUMMARY.md verified present on disk; all 3 task commit hashes (`9bbbae2`, `a9b544f`, `b43978b`) verified present in `git log`.
