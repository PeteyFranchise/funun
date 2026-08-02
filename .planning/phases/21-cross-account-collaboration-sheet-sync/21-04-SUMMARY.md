---
phase: 21-cross-account-collaboration-sheet-sync
plan: 04
subsystem: api
tags: [split-sheets, sound-vault, sync, rls, jest]

# Dependency graph
requires:
  - phase: 21-cross-account-collaboration-sheet-sync (plan 01)
    provides: migration 078 (project_members + membership-aware RLS on vault_projects/tracks), live and human-approved
provides:
  - "lib/split-sheets/lifecycle.ts: SYNC_FROZEN_STATUSES + isSyncActive() — the sheet↔project sync freeze boundary"
  - "lib/split-sheets/project-sync.ts: pure mapPartiesToComposers/mapComposersToParties/mergeComposers mapping+merge module"
  - "forward sync hook: PATCH /api/split-sheets/[id] → linked project's track composers"
  - "reverse sync hook: PATCH /api/vault/[projectId]/tracks/[trackId] → linked initiator-owned living-draft sheet parties"
affects: [split-sheets, vault-tracks, dashboard-next-moves]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure no-I/O mapping module (mirrors lib/contracts/locker-attention.ts) hooked into an existing PATCH choke point rather than a parallel sync engine"
    - "Freeze-boundary vocabulary sourced from lifecycle.ts's own exports (SYNC_FROZEN_STATUSES), not a fresh status literal"
    - "Best-effort side-effect sync wrapped in try/catch after the primary save, matching this repo's established best-effort-side-effect convention"

key-files:
  created:
    - lib/split-sheets/project-sync.ts
    - lib/split-sheets/project-sync.test.ts
  modified:
    - lib/split-sheets/lifecycle.ts
    - app/api/split-sheets/[id]/route.ts
    - app/api/vault/[projectId]/tracks/[trackId]/route.ts

key-decisions:
  - "mapComposersToParties excludes composer rows with role='producer' — a producer credit added directly in Metadata Studio (never negotiated on the sheet) is exactly the 'project-only credit the writer sheet never mentions' case (writers ⊆ credits); if a producer IS a sheet party, mapPartiesToComposers/mergeComposers already sync them forward via name match"
  - "Reverse sync only REFRESHES an already name-matched party's role/pro/ipi/split — it never inserts a new party from a project-side composer edit, so a manually-added project-only credit can never silently become a new signature party on a legal document (① — splits stay the sheet's job, no new money-mutation path)"
  - "Track resolution for both directions prefers split_sheets.track_id (migration 067 origin field) when set; falls back to a normalized song_name<->title match, then the project's single track when unambiguous — mirrors the existing reconcile route's pickTrack, and the reverse direction additionally requires the project have exactly one track before treating a track_id-null 'whole release' sheet as this track's sheet"
  - "Both sync directions are wrapped in try/catch as best-effort side effects — a sync failure never rolls back or corrupts the primary sheet/track save it rides on"

requirements-completed: [sheet-project-sync, "①-access-model"]

coverage:
  - id: D1
    description: "isSyncActive() correctly classifies the sheet↔project sync freeze boundary (draft/countered/pending_approval/approved = syncing; esign_pending/executed = frozen), sourced from lifecycle.ts's own vocabulary"
    requirement: sheet-project-sync
    verification:
      - kind: unit
        ref: "lib/split-sheets/project-sync.test.ts#isSyncActive — the sheet↔project sync boundary"
        status: pass
    human_judgment: false
  - id: D2
    description: "mapPartiesToComposers / mapComposersToParties / mergeComposers correctly map, filter, and merge writer rows while preserving project-only credits (writers ⊆ credits), including an idempotent round trip"
    requirement: sheet-project-sync
    verification:
      - kind: unit
        ref: "lib/split-sheets/project-sync.test.ts#mapPartiesToComposers"
        status: pass
      - kind: unit
        ref: "lib/split-sheets/project-sync.test.ts#mergeComposers — writers ⊆ credits"
        status: pass
      - kind: unit
        ref: "lib/split-sheets/project-sync.test.ts#mapComposersToParties — writer rows only"
        status: pass
      - kind: unit
        ref: "lib/split-sheets/project-sync.test.ts#round trip — an unchanged writer roster is a no-op"
        status: pass
    human_judgment: false
  - id: D3
    description: "Forward sync (sheet party edit → linked project track composers) is live-wired into PATCH /api/split-sheets/[id]'s existing editsParties choke point, gated on linked + isSyncActive, best-effort and session-client-scoped"
    requirement: sheet-project-sync
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (clean) + npm test (94/94 suites, 1173/1173 tests) after wiring — no route-level integration test exists in this repo's test harness for API routes with a live Supabase session"
        status: pass
    human_judgment: true
    rationale: "No live-DB/session-mocking test harness exists in this repo for app/api/** routes (verified — every prior split-sheets route change in this codebase's history relies on tsc+full-suite-green plus a manual click-through, not a route-level unit test). Correctness of the actual sheet-edit-to-project-composer write requires a live Supabase session and a linked project/track fixture, which is a human/manual verification step per this phase's established convention (RESEARCH's Validation Architecture section documents no live-RLS test harness exists)."
  - id: D4
    description: "Reverse sync (project composer edit → linked initiator-owned living-draft sheet parties) is live-wired into PATCH /api/vault/[projectId]/tracks/[trackId], gated on the single-account (editor==initiator) guard + isSyncActive, updates matched parties only, never inserts a new party"
    requirement: "①-access-model"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (clean) + npm test (94/94 suites, 1173/1173 tests) after wiring"
        status: pass
    human_judgment: true
    rationale: "Same reasoning as D3 — no route-level test harness for a live Supabase session exists in this repo; manual verification against a real linked sheet/project is the established pattern for this class of route change."

duration: 15min
completed: 2026-08-02
status: complete
---

# Phase 21 Plan 04: Split-Sheet ↔ Project Bidirectional Sync Summary

**Bidirectional writer/role/split sync between a split sheet and its linked Sound Vault project — sheet edits flow into `tracks.metadata.composers[]` while the sheet is a living draft, project composer edits flow back into the sheet's parties only for the sheet's own initiator, and the link snaps the instant the sheet is sent for signature.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-02T04:57:04Z
- **Completed:** 2026-08-02T05:12:00Z
- **Tasks:** 3
- **Files modified:** 4 (1 created lib module + 1 created test file, 3 files modified)

## Accomplishments

- `lib/split-sheets/lifecycle.ts` gained `SYNC_FROZEN_STATUSES` / `isSyncActive()`, keying the sync-active window off the module's own freeze vocabulary (`esign_pending`/`executed`) rather than a fresh `=== 'draft'` literal — sync now correctly keeps running through `pending_approval`/`approved`/`countered`, matching the module's existing `assertEditable()` boundary.
- New pure, no-I/O `lib/split-sheets/project-sync.ts` maps sheet parties ↔ track composers and merges a fresh writer roster into an existing composer array while preserving any project-only credit row (a producer/performer the sheet never mentions) — the "writers ⊆ credits" invariant, verified idempotent on an unchanged roster.
- Forward sync: `PATCH /api/split-sheets/[id]` now reflects an actual party edit into the linked project's track composer metadata, reusing the route's existing `editsParties` diff (no second diff mechanism), writing through the session client so 21-01's membership-aware RLS governs the write.
- Reverse sync: `PATCH /api/vault/[projectId]/tracks/[trackId]` now reflects a composer edit back into the initiator's own linked living-draft sheet parties — gated on a single-account guard (editor must be the sheet initiator) so no cross-account split mutation path exists, and only refreshing already-matched parties (never inventing a new party or a split percentage).

## Task Commits

Each task was committed atomically:

1. **Task 1: isSyncActive predicate + pure lib/split-sheets/project-sync.ts (RED→GREEN)** - `96a1a95` (feat)
2. **Task 2: Forward sync — sheet party diff → linked project composers** - `319af1f` (feat)
3. **Task 3: Reverse sync — project composer change → linked living-draft sheet parties** - `129b6b9` (feat)

**Plan metadata:** (this commit)

_Note: Task 1 was written test-first per its `tdd="true"` marker — the pure module and its test file were authored together in a single commit since both were new files with no pre-existing implementation to fail against; the test suite (`project-sync.test.ts`) is the binding RED→GREEN contract and was verified green before commit._

## Files Created/Modified

- `lib/split-sheets/lifecycle.ts` - Added `SYNC_FROZEN_STATUSES` + `isSyncActive()`
- `lib/split-sheets/project-sync.ts` - New pure mapping/merge module: `mapPartiesToComposers`, `mapComposersToParties`, `mergeComposers`
- `lib/split-sheets/project-sync.test.ts` - New test file covering all 5 must-have behaviors + idempotent round trip
- `app/api/split-sheets/[id]/route.ts` - Forward-sync hook after the existing party reinsert (`editsParties` branch); added `pickSyncTrack` local track-resolution helper
- `app/api/vault/[projectId]/tracks/[trackId]/route.ts` - Reverse-sync hook after a successful composer write, gated on the single-account initiator guard

## Decisions Made

- **`mapComposersToParties` excludes `role='producer'` composer rows.** Composer[] carries no explicit "added via the sheet" flag, so writer-vs-project-only classification needed an explicit rule. `producer` was chosen as the excluded role because CONTEXT.md's own framing ("performers/producers the writer sheet never mentions") names producers alongside performers as the project-only case; a producer who genuinely negotiated a split via the sheet still syncs forward correctly (their party row maps to a `producer`-role composer entry via `mapPartiesToComposers`, and `mergeComposers` matches them by name like any other writer).
- **Reverse sync never inserts a new party.** Only an existing party (matched by normalized name) gets its role/pro/ipi/split refreshed from a project-side composer edit. Inventing a new party — with a split percentage not vetted through `validateApprovalTotal`/the sheet's own approve flow — would itself be a new money-mutation path, directly contradicting ①'s "no new money-mutation path; no silent cross-account split edits."
- **Track resolution mirrors the existing reconcile route's `pickTrack`** (prefer `split_sheets.track_id` when set, else normalized `song_name`↔`title` match, else the project's single track) rather than introducing a new resolution strategy — reused rather than reinvented, per RESEARCH's Don't-Hand-Roll guidance. The reverse direction adds one extra safety condition: a `track_id`-null "whole release" sheet is only treated as a specific track's sheet when the project has exactly one track, avoiding an ambiguous match across a multi-track project.
- **Both directions are best-effort, wrapped in try/catch.** A sync write failure (e.g. an RLS block on the linked project) must never corrupt or roll back the primary sheet/track save it's attached to — matches this repo's established best-effort-side-effect convention (see `lib/social/activity-emit.ts` precedent cited in CLAUDE.md).

## Deviations from Plan

None — plan executed exactly as written. The design decisions above fill in discretionary gaps the plan intentionally left open (no explicit writer-vs-project-only flag exists on `Composer`), not corrections to the plan itself.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. No migration in this plan (pure application-layer work on top of the already-live migration 078).

## Next Phase Readiness

- The sync machinery (`isSyncActive`, `project-sync.ts`, both PATCH-route hooks) is live and covered by `tsc --noEmit` + the full Jest suite (94/94 suites, 1173/1173 tests green).
- **Human verification still needed** (per this repo's established convention — no live-DB/session test harness exists for `app/api/**` routes): manually edit a linked living-draft sheet's writers and confirm the project track's composers update; edit the project's composers as the sheet initiator and confirm the draft sheet's parties update; send the sheet for signature and confirm further edits on either side stop syncing. See the plan's `<verification>` block for the exact manual steps.
- No blockers for 21-05 (or any later phase) — the sync hooks are additive and self-contained within the two existing PATCH routes.

---
*Phase: 21-cross-account-collaboration-sheet-sync*
*Completed: 2026-08-02*
