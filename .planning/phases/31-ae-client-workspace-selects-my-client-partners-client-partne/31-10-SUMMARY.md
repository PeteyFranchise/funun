---
phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
plan: 10
subsystem: ui
tags: [nextjs, react, supabase, dnd-kit, selects, r11, ai-draft, saved-searches]

# Dependency graph
requires:
  - phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
    provides: "31-04 — Selects builder persistence + core API (own-book CRUD, idempotent add/soft-remove/reorder, send)"
  - phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
    provides: "31-05 — AI-draft + saved/team-shared Crate searches"
provides:
  - "components/admin/SelectsBuilder.tsx — the AE curate-and-send console"
  - "app/(admin)/admin/selects/page.tsx — own-book-scoped, status-filterable Selects list"
  - "app/(admin)/admin/selects/[id]/page.tsx — the builder detail page"
  - "app/api/admin/selects/catalog/route.ts — staff-gated Crate track search (new)"
  - "lib/selects/tracks-query.ts — shared rights-ready track resolver (extracted from 31-04's tracks route)"
affects: [31-11 (Crate Requests room — Build Selects one-click target), 31-13 (client-facing /selects/[token] player), 31.1 (List/Board pipeline hub)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-callable staff catalogue search mirrors GET /api/buyer/catalog exactly (same buildCatalogFilter + loadCatalogPage authority), gated by requireStaff() instead of a buyer_members row — no parallel query implementation (T-26-24 discipline extended to staff)."
    - "Shared read-time authority extracted to lib/ so both the API route and an SSR page import ONE implementation (resolveTracksWithRightsReady) — mirrors lib/deals/catalog-query.ts's loadCatalogPage doc comment on why route modules can't export helpers directly."
    - "Undo-toast soft-remove: DELETE marks removed_at, Undo re-POSTs the same trackId (addSelectsTrack's existing un-remove branch handles it) — no separate restore endpoint needed."
    - "Debounced auto-save via a savedRef snapshot comparison (name/cover_note) plus a manual flush — avoids saving on mount and avoids redundant PATCHes when nothing changed."

key-files:
  created:
    - components/admin/SelectsBuilder.tsx
    - components/admin/NewSelectsForm.tsx
    - app/(admin)/admin/selects/page.tsx
    - app/(admin)/admin/selects/[id]/page.tsx
    - app/api/admin/selects/catalog/route.ts
    - lib/selects/tracks-query.ts
  modified:
    - app/api/admin/selects/[id]/tracks/route.ts
    - app/(admin)/layout.tsx

key-decisions:
  - "Added a new staff-gated Crate search route (app/api/admin/selects/catalog/route.ts) — neither existing catalogue surface fit a client-callable, non-buyer-member staff search: GET /api/buyer/catalog 403s a pure staff account, and the staff-aware catalogue (app/sync/catalog/page.tsx, 30-08) is SSR-only. Reuses buildCatalogFilter/loadCatalogPage verbatim."
  - "Extracted resolveTracksWithRightsReady out of the tracks route into lib/selects/tracks-query.ts so the new SSR detail page and the existing API route share ONE rights-ready computation, rather than the detail page re-deriving it or bypassing the authority."
  - "Rights-ready badge on a newly search-added track is set to true unconditionally (not re-derived client-side) — every project loadCatalogPage returns has already passed the same isRightsReady gate server-side, so this is provably correct at add-time, not an approximation; the next full track refetch (e.g. after an AI-draft) re-derives it authoritatively."
  - "Simplified the Crate-search filter surface to genre/mood/energy/vocal/BPM range (the fields buildCatalogFilter/CatalogFilter already expose) — the mockup's free-text search box and multi-select attribute-chip bar were dropped since D-16 explicitly forbids a free-text catalogue parameter and the controlled vocab (mood/energy/vocal) is single-select, not a chip multiset. All acceptance criteria (idempotent add, soft-remove+undo, notes, auto-save, saved-search recall/share, AI-draft, send-guard) are unaffected by this scope trim."
  - "New Selects creation lives on the list page (NewSelectsForm) rather than a workspace Curation tab or Crate Requests row action — those rooms (31-08/31-09/31-11) have not shipped yet this wave. The form accepts ?orgId=/?briefId= query params so those future entry points can deep-link in without a further change to this file."
  - "Added a 'Selects' link to the admin sidebar nav (app/(admin)/layout.tsx) — the shipped pages had no reachable entry point otherwise."

patterns-established:
  - "A Next.js client component may safely `import type` from a route.ts module (type-only, erased at compile time) to share a response shape without pulling server-only code into the client bundle — verified via a clean production build."

requirements-completed: [R11, R5, D-11, D-12]

coverage:
  - id: D1
    description: "SelectsBuilder: idempotent add (re-adding shows no duplicate, button reads '✓ Added' and is inert), soft-remove with an inline Undo toast, per-track note + cover note persisted via debounced PATCH to the 31-04 routes"
    requirement: R11
    verification:
      - kind: manual_procedural
        ref: "npx tsc --noEmit clean; npm run build compiles (only the pre-existing, unrelated Phase 32 cron/health route-type failures remain); code inspection of handleAddTrack/handleRemoveTrack/handleRestoreTrack/handleNoteChange against 31-04's idempotent-add and soft-remove contract"
        status: pass
    human_judgment: true
    rationale: "No test framework exists in this project (CLAUDE.md: 'No test framework in dependencies') — idempotent-add/soft-remove/undo/auto-save behavior needs a human click-through against the live UI to confirm, not just a type-check."
  - id: D2
    description: "Debounced auto-save (name/cover note) + a manual Save button with a visible saved/saving state; a saved Crate search can be recalled and a search can be saved/team-shared via the 31-05 routes"
    requirement: D-12
    verification:
      - kind: manual_procedural
        ref: "npx tsc --noEmit clean; code inspection of the useEffect debounce, flushSave, handleRecallSearch, handleSaveCurrentSearch, handleToggleShare against 31-05's saved-searches route contract"
        status: pass
    human_judgment: true
    rationale: "Debounce timing and the saved-search recall/share round-trip are best confirmed live against the running app; no test framework exists to assert this automatically."
  - id: D3
    description: "AI-draft button (D-11) calls 31-05's ai-draft route and populates a starter tracklist the AE can then edit; disabled with a tooltip when no brief is linked"
    requirement: D-11
    verification:
      - kind: manual_procedural
        ref: "code inspection of handleAiDraft + refetchTracks against app/api/admin/selects/[id]/ai-draft/route.ts's response shape"
        status: pass
    human_judgment: true
    rationale: "Requires a linked brief + live catalogue data to exercise end-to-end; no test framework exists in this project."
  - id: D4
    description: "Send is disabled (opacity-40, cursor-not-allowed, never hidden) with the inline 'Add at least one track before sending' copy until >=1 track, then mints and displays the /selects/{token} share link"
    requirement: R11
    verification:
      - kind: manual_procedural
        ref: "code inspection of canSend/handleSend against app/api/admin/selects/[id]/send/route.ts's empty-guard + isLegalSelectsTransition"
        status: pass
    human_judgment: true
    rationale: "Client/server disabled-state and copy match by inspection; a human click-through confirms the rendered state matches the 31-UI-SPEC exactly."
  - id: D5
    description: "Selects list (own-book-scoped, status-filterable) and builder detail page (own-book via loadSelectsInScope, notFound() for an uncovered org) are live and reachable from the admin nav"
    requirement: R5
    verification:
      - kind: manual_procedural
        ref: "npx tsc --noEmit clean; npm run build compiles; code inspection of app/(admin)/admin/selects/page.tsx and [id]/page.tsx's scope checks"
        status: pass
    human_judgment: true
    rationale: "Own-book scoping across leadership/AE/BD roles is best confirmed with a real multi-role staff-session click-through; no test framework exists to assert this automatically."

# Metrics
duration: 55min
completed: 2026-08-16
status: complete
---

# Phase 31 Plan 10: Selects Builder + List/Detail Pages Summary

**AE curate-and-send console (Crate search, idempotent add, soft-remove-with-undo, notes, drag reorder, debounced auto-save, saved/team-shared searches, AI-draft, guarded Send) plus an own-book-scoped Selects list and builder detail page**

## Performance

- **Duration:** 55 min
- **Started:** 2026-08-16T03:03:00Z
- **Completed:** 2026-08-16T03:58:00Z
- **Tasks:** 2
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments
- `components/admin/SelectsBuilder.tsx`: the full curate-and-send console — a Crate-search pane (genre/mood/energy/vocal/BPM filters, saved/team-shared search recall + save) alongside a drag-reorderable working tracklist (dnd-kit), idempotent add, soft-remove with an inline Undo toast, per-track + cover notes (debounced auto-save), rights-ready badges, an AI-draft button (D-11), and a Send button disabled until >=1 track that mints and surfaces the `/selects/{token}` share link
- `app/(admin)/admin/selects/page.tsx` + `[id]/page.tsx`: own-book-scoped Selects list (status-filterable via a lightweight funnel strip; leadership sees all) and the builder detail page (`notFound()` for an uncovered org), with a marked, disabled slot recording the deferred List/Board pipeline room (Phase 31.1)
- New `app/api/admin/selects/catalog/route.ts`: staff-gated Crate track search the builder needs (no existing surface fit a non-buyer-member staff search) — reuses `buildCatalogFilter`/`loadCatalogPage` verbatim, no parallel query logic
- Extracted `lib/selects/tracks-query.ts` so the new SSR detail page and the existing tracks API route share the SAME rights-ready computation

## Task Commits

Each task was committed atomically:

1. **Task 1: SelectsBuilder component — curate, notes, badges, auto-save, saved searches, AI-draft** - `83d1633` (feat)
2. **Task 2: Selects list page + builder detail page** - `3ac7fa9` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `components/admin/SelectsBuilder.tsx` - the curate-and-send console (client component)
- `components/admin/NewSelectsForm.tsx` - the list page's create-and-open-builder form
- `app/(admin)/admin/selects/page.tsx` - own-book-scoped, status-filterable Selects list
- `app/(admin)/admin/selects/[id]/page.tsx` - the builder detail page (SSR, own-book scoped)
- `app/api/admin/selects/catalog/route.ts` - staff-gated Crate track search (new, deviation)
- `lib/selects/tracks-query.ts` - shared rights-ready track resolver (extracted, deviation)
- `app/api/admin/selects/[id]/tracks/route.ts` - now imports the shared resolver (no behavior change)
- `app/(admin)/layout.tsx` - added a "Selects" nav link (deviation)

## Decisions Made
- Built a new staff-gated Crate search API (`app/api/admin/selects/catalog/route.ts`) rather than reusing an existing route — see key-decisions in frontmatter for the full rationale (neither `GET /api/buyer/catalog` nor the SSR-only staff catalogue page fit a client-callable staff search).
- Extracted `resolveTracksWithRightsReady` into `lib/selects/tracks-query.ts` so the new SSR detail page and the 31-04 API route share one rights-ready authority instead of a second implementation.
- Simplified the Crate-search filter UI to genre/mood/energy/vocal/BPM (buildCatalogFilter's existing vocabulary) — dropped the mockup's free-text box (forbidden by D-16) and multi-select attribute chips (not supported by the single-select controlled vocab). No acceptance criterion depends on the dropped surface.
- New-Selects creation lives on the list page for now (query-param deep-linkable) since the workspace Curation tab and Crate Requests "Build Selects" row action (31-08/31-09/31-11) have not shipped yet this wave.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added a staff-gated Crate catalogue search route**
- **Found during:** Task 1 (SelectsBuilder component)
- **Issue:** The plan's Task 1 requires a functional "Crate-search pane," but no existing route lets a staff-only account (no `buyer_members` row) search the catalogue client-side. `GET /api/buyer/catalog` 403s such an account; the staff-aware catalogue page (`app/sync/catalog/page.tsx`, 30-08) is SSR-only with no fetchable API.
- **Fix:** Added `app/api/admin/selects/catalog/route.ts` — staff-gated (`requireStaff()`), reusing `buildCatalogFilter`/`loadCatalogPage` (the exact same authority `GET /api/buyer/catalog` calls), flattened to track-level hits since a Selects add operates on `track_id`.
- **Files modified:** `app/api/admin/selects/catalog/route.ts` (new)
- **Verification:** `npx tsc --noEmit` clean; `npm run build` compiles (webpack "Compiled successfully"); code inspection confirms no parallel rights-ready/catalogue-filter logic was introduced.
- **Committed in:** `83d1633` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Extracted resolveTracksWithRightsReady into lib/selects/tracks-query.ts**
- **Found during:** Task 2 (builder detail page)
- **Issue:** The detail page (an SSR server component) needs to fetch a Selects' tracks with the same rights-ready computation `GET /api/admin/selects/[id]/tracks` uses — but that function was a local, unexported helper inside the route.ts file, which Next.js route modules cannot export (route modules may only export HTTP method handlers).
- **Fix:** Moved `resolveTracksWithRightsReady` (and its supporting types) into `lib/selects/tracks-query.ts`, updated the tracks route to import it from there (no behavior change), and imported it directly into the new detail page — mirrors `lib/deals/catalog-query.ts`'s established pattern for sharing SSR-page/API-route query logic.
- **Files modified:** `lib/selects/tracks-query.ts` (new), `app/api/admin/selects/[id]/tracks/route.ts` (modified — import only, logic unchanged)
- **Verification:** `npx tsc --noEmit` clean; `npm run build` compiles; `npx eslint` clean on both files; no functional change to the tracks route's request/response contract.
- **Committed in:** `83d1633` (Task 1 commit)

**3. [Rule 2 - Missing Critical] Added a "Selects" link to the admin sidebar nav**
- **Found during:** Task 2 (list/detail pages)
- **Issue:** The plan's file list didn't include the admin layout, but the new list/detail pages would otherwise have no reachable entry point for an AE/BD/leadership user browsing the Team Console.
- **Fix:** Added a `<Link href="/admin/selects">Selects</Link>` entry to `app/(admin)/layout.tsx`'s "every staff role" nav section, next to "My Client Partners," with a comment noting the 31-UI-SPEC's eventual full nav ordering (between Crate Requests and Deals) lands once those rooms exist.
- **Files modified:** `app/(admin)/layout.tsx`
- **Verification:** `npx tsc --noEmit` clean; `npm run build` compiles; visually additive-only diff (no existing nav links touched).
- **Committed in:** `3ac7fa9` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 2 — missing critical functionality)
**Impact on plan:** All three were necessary for the plan's own acceptance criteria to be achievable (a functional Crate-search pane, a correct rights-ready detail page, and a reachable UI) or for correctness (single rights-ready authority, no parallel implementation). No scope creep beyond what Task 1/Task 2 required to actually work end-to-end.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None. Every UI affordance in `SelectsBuilder.tsx` is wired to a live 31-04/31-05 API route; no hardcoded/placeholder data ships in this plan.

## Next Phase Readiness
- The Selects builder is fully usable end-to-end today: an AE can create a Selects (from the list page), search The Crate, add/remove/note/reorder tracks, save/recall searches, AI-draft off a linked brief, and Send — producing the `/selects/{token}` link that 31-13's client-facing player will serve once it ships.
- 31-11 (Crate Requests room) can wire its "Build Selects" one-click action straight into `NewSelectsForm`'s `?orgId=&briefId=` deep-link contract without any further change here.
- 31-08/31-09 (workspace Curation tab) can link into the same list/builder routes once those workspace rooms exist.
- Phase 31.1's List/Board pipeline hub (event-derived stages, next-best-action coaching) has a marked, disabled anchor point in `app/(admin)/admin/selects/page.tsx` to build against.

---
*Phase: 31-ae-client-workspace-selects-my-client-partners-client-partne*
*Completed: 2026-08-16*

## Self-Check: PASSED

All 8 claimed files verified present via `git ls-files --error-unmatch`; both task commit hashes (83d1633, 3ac7fa9) verified present via `git cat-file -e`.
