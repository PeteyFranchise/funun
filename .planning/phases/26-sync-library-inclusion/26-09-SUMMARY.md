---
phase: 26-sync-library-inclusion
plan: 09
subsystem: ui
tags: [nextjs, react, tailwind, nav, localStorage, sync-library]

# Dependency graph
requires:
  - phase: 26-sync-library-inclusion (26-01)
    provides: sync_listings table (migration 096, live) — the admission state machine this plan gates on
  - phase: 26-sync-library-inclusion (26-02)
    provides: SyncListing/SyncListingStatus types, isValidTransition state machine
  - phase: 26-sync-library-inclusion (26-05)
    provides: the staff admit route that fires the SYNCLIB-14 highlight notification this plan's dot/coach-mark visually complements
provides:
  - "hasAdmittedSyncListing server-side gate — the SINGLE authority for both nav visibility and the hub page's own redirect guard"
  - "loadSyncLibraryHub — scoped hub data read (In progress / Admitted / Your agreement), including a temporary signed URL for the blanket-agreement PDF"
  - "The Sync Library hub page (/sync-library), anchored on In progress per decision #5"
  - "ArtistNav reorder (Split Sheets under Contract Locker) + the gated Sync Library nav item (independent of requiresCapability)"
  - "A reusable newly-unlocked-feature highlight primitive (readSeenFlag/markFeatureSeen/useNewFeatureSeen in SyncLibraryCoachMark.tsx) driving both the nav New dot and a one-time coach-mark"
affects: [sync-library-admin-console, future-gated-feature-highlights]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Data-driven nav gate (requiresSyncLibraryAccess) as a second, independent ITEMS predicate alongside the existing static requiresCapability gate"
    - "Cross-sibling-component state sync via a same-tab CustomEvent broadcast (SEEN_EVENT) — localStorage alone doesn't re-render a sibling client component; the storage event never fires in the tab that wrote it"
    - "Reusable seen-flag primitive (newFeatureSeenKey/readSeenFlag/markFeatureSeen/useNewFeatureSeen) generalized for any future 'newly unlocked' gated feature by swapping the key"

key-files:
  created:
    - lib/sync-library/hub-access.ts
    - app/(artist)/sync-library/page.tsx
    - components/sync-library/SyncLibraryCoachMark.tsx
  modified:
    - app/(artist)/layout.tsx
    - components/nav/ArtistNav.tsx
    - components/nav/icons.tsx

key-decisions:
  - "SyncLibraryCoachMark.tsx was built one commit earlier than its nominal Task 3 assignment (in the Task 2 commit) because the hub page's action explicitly says to mount it — the page could not build/verify with a mount reference to a non-existent component. Task 3's commit then adds only the remaining, genuinely separate piece: ArtistNav's New dot, consuming the primitive Task 2 already created. All three tasks still verify (tsc) independently and land as three atomic commits."
  - "In-progress section scope: rather than the plan's literal enumeration (pending_admit / agreement_pending / applied / invited / rejected / withdrawn), the hub renders every listing with status != 'admitted', which also covers 'removed' (a staff takedown of a previously-admitted song). Omitting removed rows would silently drop a song's history from the artist's only Sync Library view; including it costs nothing (SYNC status chip already has a 'Removed' entry in TrackList.tsx's precedent) and avoids a visibility gap. [Rule 2 — missing critical functionality]."
  - "Coach-mark nav-anchoring uses ArtistNav's own layout constants (STORAGE_KEY_WIDTH/COLLAPSED, DEFAULT_WIDTH/COLLAPSED_WIDTH) duplicated as literals in SyncLibraryCoachMark.tsx rather than importing them from ArtistNav.tsx, to avoid a hard coupling between the nav (mounted in the persistent layout) and a page-mounted component. Vertical offset is a documented approximation (5th-item row estimate), not pixel-measured — UI-SPEC explicitly left the exact glyph/positioning as an implementation detail."
  - "The Status Chip meta map used on the hub page is a deliberate byte-for-byte duplicate of components/vault/TrackList.tsx's SYNC_CHIP_STATIC (not imported), because TrackList.tsx is outside this plan's file scope — importing from it would pull the whole Vault-track-list module in for a small object, and editing it to export the map would touch a file this plan doesn't own. Both are commented as intentionally kept in sync."

patterns-established:
  - "Reusable 'newly-unlocked feature' highlight primitive (CONTEXT's explicit ask) — any future gated feature reuses newFeatureSeenKey/readSeenFlag/markFeatureSeen/useNewFeatureSeen with a different feature key and its own coach-mark copy."

requirements-completed: [SYNCLIB-11, SYNCLIB-12, SYNCLIB-13, SYNCLIB-14]

coverage:
  - id: D1
    description: "hasAdmittedSyncListing is the single server-side gate for both ArtistNav's Sync Library item visibility (app/(artist)/layout.tsx) and the hub page's own independent redirect guard (T-26-31 — nav-hiding is never the authority)"
    requirement: SYNCLIB-11
    verification:
      - kind: unit
        ref: "npx tsc --noEmit — clean across app/(artist)/layout.tsx, lib/sync-library/hub-access.ts, app/(artist)/sync-library/page.tsx"
        status: pass
      - kind: other
        ref: "npm run build — /sync-library and /sync-library/agreement routes compile as dynamic server routes"
        status: pass
    human_judgment: true
    rationale: "No live Supabase session was exercised in this pass (no jest coverage was added for hasAdmittedSyncListing/loadSyncLibraryHub against a real or mocked sync_listings table) — the gate's actual runtime behavior (redirect for 0 admitted, render for >=1) needs a manual/UAT pass against real data, deferred per this plan's own <verification> section ('Manual (deferred): admit a first song...')."
  - id: D2
    description: "ArtistNav reorders Split Sheets directly under Contract Locker and inserts the Sync Library item directly under Deals, gated on the new data-driven requiresSyncLibraryAccess flag (independent of requiresCapability), exactly matching 26-CONTEXT.md's locked before/after nav orders"
    requirement: SYNCLIB-12
    verification:
      - kind: unit
        ref: "npx tsc --noEmit clean; manual read-through of the ITEMS array against 26-CONTEXT.md's 'Full artist nav order' block confirms an exact match"
        status: pass
    human_judgment: false
  - id: D3
    description: "The Sync Library hub page renders In progress first (any non-admitted listing), then Admitted songs, then Your agreement (signed date + View agreement PDF link via a temporary signed URL), with a white/black Submit-another-song CTA to /vault"
    requirement: SYNCLIB-13
    verification:
      - kind: unit
        ref: "npx tsc --noEmit clean"
        status: pass
      - kind: other
        ref: "npm run build — /sync-library compiles"
        status: pass
    human_judgment: true
    rationale: "Visual/layout correctness (section order, chip colors, agreement PDF link resolving to a real signed URL) requires a live Supabase session with real sync_listings/vault_documents rows — deferred to this plan's own manual verification step, no admitted test data was seeded in this execution pass."
  - id: D4
    description: "A New dot on the Sync Library nav item clears the moment the artist first arrives at the hub, and a one-time coach-mark (locked heading/body, single gradient Got it button) fires on that same first arrival — both driven by one shared, reusable, per-user localStorage seen-flag primitive"
    requirement: SYNCLIB-14
    verification:
      - kind: unit
        ref: "npx tsc --noEmit clean; npm run build green"
        status: pass
    human_judgment: true
    rationale: "The cross-component CustomEvent broadcast (dot clearing the instant the coach-mark mounts, without a full reload) and the coach-mark's own one-time-only firing are runtime/browser behaviors not covered by any automated test in this codebase (no jsdom/RTL harness exists for ArtistNav) — deferred to this plan's own manual verification step."

# Metrics
duration: ~40min
completed: 2026-08-08
status: complete
---

# Phase 26 Plan 09: Sync Library Nav Gate, Hub, and New-Feature Highlight Summary

**Server-gated Sync Library nav item + hub page (anchored on In-progress songs, per owner decision #5) and a reusable newly-unlocked-feature highlight primitive (nav New dot + one-time coach-mark) driven by a shared localStorage seen-flag with cross-component CustomEvent sync.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-08-08
- **Tasks:** 3/3
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments
- `lib/sync-library/hub-access.ts`: `hasAdmittedSyncListing` (the single server-side ≥1-admitted gate, consumed by both the layout's nav-visibility read and the hub page's own independent redirect guard — T-26-31) and `loadSyncLibraryHub` (scoped read joining `sync_listings` to track/project titles, splitting In-progress vs Admitted, resolving the signed blanket-agreement PDF via a temporary storage-signed URL — T-26-32).
- `app/(artist)/layout.tsx` resolves `hasSyncLibraryAccess` server-side alongside the existing `capabilities` read and passes it (plus `userId`) to `ArtistNav` — never client-fetched.
- `components/nav/icons.tsx`: `SyncLibraryIcon` — a two-shelf-with-note glyph, visually distinct from `DealsIcon`/`LockerIcon`.
- `components/nav/ArtistNav.tsx`: reordered `ITEMS` (Split Sheets moved to sit directly under Contract Locker) and inserted the Sync Library item directly under Deals, gated by a new `requiresSyncLibraryAccess` field independent of the existing `requiresCapability` gate — matches 26-CONTEXT.md's locked before/after nav orders exactly.
- `app/(artist)/sync-library/page.tsx`: the hub, gated on `hasAdmittedSyncListing` (redirects to `/dashboard` otherwise), rendering **In progress first** (decision #5's workspace framing), then Admitted songs, then Your agreement, with a white/black "Submit another song" CTA to `/vault`.
- `components/sync-library/SyncLibraryCoachMark.tsx`: the reusable "newly-unlocked feature" highlight primitive (`newFeatureSeenKey`/`readSeenFlag`/`markFeatureSeen`/`useNewFeatureSeen`) plus the coach-mark itself — a one-time, nav-anchored tooltip shown on first arrival at the hub, dismissible via a single gradient "Got it" button.
- `ArtistNav.tsx` renders a small `bg-brandfuchsia` "New" dot on the Sync Library icon's corner (matching `NotificationBell`'s unread-dot scale, no count) while `hasSyncLibraryAccess` is true and the artist hasn't yet visited the hub — cleared instantly via the same-tab `CustomEvent` broadcast the coach-mark fires on mount, no full page reload required.

## Task Commits

Each task was committed atomically:

1. **Task 1: Nav reorder + gated Sync Library item + icon + server access gate** — `5471307` (feat)
2. **Task 2: Sync Library hub page (In-progress anchored, ≥1-admitted gated)** — `b056845` (feat) — includes `SyncLibraryCoachMark.tsx`, built one commit early since the hub page's own action requires mounting it to build
3. **Task 3: Reusable newly-unlocked highlight — New dot + one-time coach-mark** — `07fb5ce` (feat)

## Files Created/Modified
- `lib/sync-library/hub-access.ts` — `hasAdmittedSyncListing`, `loadSyncLibraryHub`
- `app/(artist)/layout.tsx` — resolves + passes `hasSyncLibraryAccess`/`userId` to ArtistNav
- `components/nav/icons.tsx` — `SyncLibraryIcon`
- `components/nav/ArtistNav.tsx` — reorder, gated item, New dot
- `app/(artist)/sync-library/page.tsx` — the hub
- `components/sync-library/SyncLibraryCoachMark.tsx` — highlight primitive + coach-mark

## Decisions Made
- `SyncLibraryCoachMark.tsx` built in Task 2's commit (not Task 3's, as nominally file-scoped) because Task 2's own action mounts it on the hub page — a blocking-issue auto-fix (Rule 3), not a scope change. Task 3's commit still lands as its own atomic, independently-verifiable unit (the New dot in ArtistNav).
- The hub's "In progress" section covers every non-admitted status (including `removed`), not just the plan's literal list, so a staff takedown doesn't silently vanish from the artist's only Sync Library view (Rule 2).
- The Status Chip meta map is duplicated (not imported) from `TrackList.tsx`'s `SYNC_CHIP_STATIC` to stay within this plan's file scope; both are commented as intentionally kept byte-for-byte in sync.
- Coach-mark nav positioning is a documented approximation (ArtistNav's layout constants duplicated as literals, vertical offset estimated from the 5th nav row) rather than a real DOM-measured anchor — UI-SPEC left the exact positioning as an implementation detail.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Built SyncLibraryCoachMark.tsx one task-commit earlier than its nominal file assignment**
- **Found during:** Task 2 (Sync Library hub page)
- **Issue:** Task 2's own `<action>` instructs mounting `<SyncLibraryCoachMark>` on the hub page, but that component is nominally Task 3's artifact — without it, Task 2's page cannot compile/verify (`npx tsc --noEmit` would fail on the unresolved import).
- **Fix:** Built the full `SyncLibraryCoachMark.tsx` (including the reusable seen-flag primitive) as part of Task 2's commit; Task 3's commit then adds only the remaining piece — ArtistNav's New dot, which consumes the primitive.
- **Files modified:** `components/sync-library/SyncLibraryCoachMark.tsx` (created in Task 2's commit instead of Task 3's)
- **Verification:** `npx tsc --noEmit` clean after every task's commit; `npm run build` green after Task 3.
- **Committed in:** `b056845` (Task 2 commit)

**2. [Rule 2 - Missing Critical] "In progress" section includes `removed` listings, not just the plan's literal enumeration**
- **Found during:** Task 2 (hub page section logic)
- **Issue:** The plan's action text lists the In-progress statuses as "pending_admit / agreement_pending / applied / invited / rejected / withdrawn" — omitting `removed` (a staff leadership-only takedown of a previously-admitted song, per 26-CONTEXT.md's "Staff removal / takedown" decision). A removed song would then appear nowhere on the hub — the artist's only Sync Library view — silently losing its history.
- **Fix:** Defined the In-progress section as every listing with `status !== 'admitted'`, which naturally includes `removed` alongside the plan's named statuses, reusing the same `Removed` chip styling `TrackList.tsx` already established for this status.
- **Files modified:** `app/(artist)/sync-library/page.tsx`
- **Verification:** `npx tsc --noEmit` clean.
- **Committed in:** `b056845` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing-critical)
**Impact on plan:** Both auto-fixes are necessary for correctness (a page that can't build; a status that would silently disappear from the artist's only view of it). No scope creep — no new files, routes, or affordances beyond what the plan specified.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- The nav gate, hub page, and highlight primitive are all in place and build/typecheck clean.
- Manual verification (deferred per this plan's own `<verification>` section, and reflected in the `human_judgment: true` coverage rows above): admit a first song end-to-end (staff admit route from 26-05) and confirm live — the nav item appears, the New dot shows, the coach-mark fires once on first hub visit and clears the dot without a reload, and the hub's three sections render correctly against real `sync_listings`/`vault_documents` data.
- No blockers for downstream phases; `hub-access.ts`'s `loadSyncLibraryHub` and the hub page are ready to extend with future sync-earnings/deals sections per 26-CONTEXT.md's "post-admission home" framing.

---
*Phase: 26-sync-library-inclusion*
*Completed: 2026-08-08*

## Self-Check: PASSED

All claimed files found on disk (`lib/sync-library/hub-access.ts`, `app/(artist)/sync-library/page.tsx`, `components/sync-library/SyncLibraryCoachMark.tsx`, `app/(artist)/layout.tsx`, `components/nav/ArtistNav.tsx`, `components/nav/icons.tsx`) and all three task commit hashes (`5471307`, `b056845`, `07fb5ce`) verified present in git history.
