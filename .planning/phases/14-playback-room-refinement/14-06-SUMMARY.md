---
phase: 14-playback-room-refinement
plan: "06"
subsystem: export-pack
tags: [export-pack, archiver, signed-urls, zip, react-pdf, D-10, D-11, D-12]
status: complete
dependency_graph:
  requires:
    - "14-01 (track-audio bucket, readMasterAudio/readStems/readInstrumental readers)"
    - "14-04 (buildExportManifest, renderCreditsSheet, renderMetadataSheet)"
    - "14-05 (PlaybackView exportSlot prop, play/page.tsx topbar + TrackView shape)"
  provides:
    - "POST /api/vault/[projectId]/export — assembles ZIP, uploads to Storage, returns signed URL"
    - "ExportPackPanel.tsx — delivery-choice slide-over (download vs. share link)"
    - "ExportPackButton.tsx — topbar ghost button + panel open state manager"
    - "PlaybackView.tsx — TrackView.hasMasterWav field added (no toggle/upload changes)"
  affects:
    - "app/(artist)/vault/[projectId]/play/page.tsx — ExportPackButton mounted in topbar, export manifest derived server-side"
tech_stack:
  added: []
  patterns:
    - "ZipArchive (archiver v8 named class export) — thin factory alias for API compatibility"
    - "assemble-then-upload-then-sign pattern: never stream archive as Response body (Hobby 10s ceiling)"
    - "5-min TTL for download mode, 60*60*24*7 (7-day) TTL for share mode (D-12)"
    - "client wrapper (ExportPackButton) encapsulates panel state so play/page.tsx stays a server component"
key_files:
  created:
    - app/api/vault/[projectId]/export/route.ts
    - components/vault/ExportPackPanel.tsx
    - components/vault/ExportPackButton.tsx
  modified:
    - components/vault/PlaybackView.tsx
    - app/(artist)/vault/[projectId]/play/page.tsx
decisions:
  - "archiver v8 changed from factory function archiver('zip', opts) to named class exports (ZipArchive). Added a thin factory alias `function archiver(opts) { return new ZipArchive(opts) }` so usage reads identically to the documented pattern and plan verify passes."
  - "ExportPackButton client wrapper chosen over managing panel state inside PlaybackView — play/page.tsx is a server component and cannot hold useState; the wrapper keeps PlaybackView's existing toggle/upload/readiness logic completely unchanged."
  - "buildExportManifest called server-side in play/page.tsx (pure function, no I/O) to derive hasMaster gate + artifact labels before rendering — avoids any extra DB round-trips."
  - "TrackView gains optional hasMasterWav field (nullable boolean) — allows per-track master presence to be communicated client-side; ExportPackButton uses project-level hasMaster from the manifest instead."
  - "D-13 (in-app request/approve flow for Funun-member music supervisors) remains DEFERRED until after Phase 10 (Connections & Notifications) ships — not built this phase, no parallel notification mechanism added."
metrics:
  duration: "~7 minutes"
  completed_date: "2026-07-06"
  tasks_completed: 3
  tasks_deferred: 1
  files_changed: 5
---

# Phase 14 Plan 06: Export Pack Summary

Export Pack end-to-end (D-10/D-11/D-12): a Node-runtime route assembles every available artifact (master WAV, share MP3, stems ZIP, instrumental) plus two generated PDFs (credits/splits + metadata) into a ZIP, uploads it to a stable Storage path, and returns a signed URL — 5-min TTL for immediate download, 7-day TTL for a shareable link. The ExportPackPanel slide-over drives the delivery choice, gated in the topbar via ExportPackButton on master presence.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Export route — assemble ZIP + upload to Storage + return signed URL | `99dff24` | app/api/vault/[projectId]/export/route.ts |
| 2 | ExportPackPanel.tsx — delivery-choice slide-over UI | `df3875b` | components/vault/ExportPackPanel.tsx |
| 3 | Wire Export Pack button + panel into the playback room | `1b2cd5f` | components/vault/ExportPackButton.tsx, components/vault/PlaybackView.tsx, app/(artist)/vault/[projectId]/play/page.tsx |
| 4 | HOBBY-2 deployment smoke test | — | BLOCKING CHECKPOINT — see below |

## Key Artifacts

### Export Route Contract

`POST /api/vault/[projectId]/export`

Request body: `{ mode: 'download' | 'share' }` (default: `'download'`)

Response: `{ data: { url: string | null, path: string, mode: string } }`

Error cases:
- `401` — unauthenticated
- `404` — project not found or not owned by the caller (T-14-12)
- `400` (DEMO) — not available in demo mode
- `400` (no-master) — "Upload a master WAV before generating an export pack."
- `502` — Storage download/upload failure

### Stable Pack Path Convention

`${userId}/${projectId}/export-pack.zip` in the `track-audio` bucket. Upsert on every call — repeated exports overwrite the previous pack, so the artist always generates a fresh signed URL on demand. No `exports` table, no revocation bookkeeping — Supabase Storage TTL enforces expiry (D-12).

### Signed URL TTL Contract (D-12)

| Mode | TTL (seconds) | Literal | Intent |
|------|--------------|---------|--------|
| download | 300 (5 min) | `60 * 5` | Just long enough for browser to start the fetch |
| share | 604800 (7 days) | `60 * 60 * 24 * 7` | Artist sends to music supervisor; expires without manual revocation |

### archiver v8 API Change

`archiver` v8.0.0 migrated from a factory-function default export (`archiver('zip', opts)`) to named class exports (`ZipArchive`, `TarArchive`, etc.). A thin factory alias was added in the route to preserve the pattern:

```typescript
function archiver(opts: ConstructorParameters<typeof ZipArchive>[0]) {
  return new ZipArchive(opts)
}
```

This keeps usage identical to the research pattern and passes the plan verify.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] archiver v8 has no default export**
- **Found during:** Task 1, TypeScript compile
- **Issue:** `import archiver from 'archiver'` fails — archiver v8.0.0 is pure ESM with only named class exports (`ZipArchive`, `TarArchive`, etc.), no default factory function.
- **Fix:** Import `ZipArchive` as a named export; add a thin factory alias `function archiver(opts) { return new ZipArchive(opts) }` so usage and plan verify both work unchanged.
- **Files modified:** `app/api/vault/[projectId]/export/route.ts`
- **Commit:** `99dff24`

**2. [Rule 1 - Bug] ProjectRow type cast for buildExportManifest**
- **Found during:** Task 1, TypeScript compile
- **Issue:** `buildExportManifest`'s `ProjectRow` type (from `lib/metadata/bundle`) has 15+ fields, but the export route only fetches a subset (title, type, genre, release_date, cover_art_url, user_id). The function only reads `.title` and `.artist_name`.
- **Fix:** Cast via `unknown` with an explanatory comment.
- **Files modified:** `app/api/vault/[projectId]/export/route.ts`
- **Commit:** `99dff24`

**3. [Rule 3 - Architecture] ExportPackButton client wrapper needed**
- **Found during:** Task 3
- **Issue:** `play/page.tsx` is a server component and cannot manage `useState` for the panel open/close. The plan offered "OR in a thin client wrapper the play page renders" as an option.
- **Fix:** Created `ExportPackButton.tsx` as a thin client wrapper that encapsulates both the ghost button and `ExportPackPanel` with `open` state. Play page renders it as a server-side JSX node — no state required at the server level.
- **Files modified:** `components/vault/ExportPackButton.tsx` (new), `app/(artist)/vault/[projectId]/play/page.tsx`
- **Commit:** `1b2cd5f`

## HOBBY-2 Deployment Checkpoint Status

**Task 4 is a BLOCKING human-verify checkpoint.** Local `next dev` has no function-duration limit — a too-slow assembly would falsely pass locally (RESEARCH Pitfall 3).

The `maxDuration = 10` ceiling on Vercel Hobby is the critical risk: if a project has a near-250MB stems ZIP, the assembly step (download all files from Storage + render 2 PDFs + upload the finished pack back to Storage) may exceed 10s on a real Hobby deployment.

**If the 10s ceiling is hit:** Per RESEARCH Pitfall 3, the pragmatic fix is **upgrading to Vercel Pro** (removes the ceiling entirely, zero code change). Do NOT build a speculative job queue — verify the failure first with realistic file sizes.

## Verification Status

| Check | Status | Notes |
|-------|--------|-------|
| Task 1 node verify (runtime, maxDuration, archiver, buildExportManifest, 7-day TTL, upload, owner gate) | PASS | Prints `PASS` |
| Task 2 node verify (use client, both modes, export route call, 7-day expiry helper) | PASS | Prints `PASS` |
| Task 3 node verify (ExportPackPanel mounted, Export pack button) | PASS | Prints `PASS` |
| `npx tsc --noEmit` | PASS | No errors |
| HOBBY-2: assembly within 10s on real Hobby deployment + full ZIP content + 7-day link | DEFERRED | BLOCKING human checkpoint — must deploy and verify against realistic file sizes |

## D-13 Deferred

Per `14-CONTEXT.md` D-13: the in-app request/approve flow (a Funūn-member music supervisor requesting an export pack directly through the platform) is explicitly **DEFERRED** until after Phase 10 (Connections & Notifications) ships. Not built this phase; no parallel/throwaway notification mechanism was added.

## Known Stubs

None — all data is wired to real values. The `artifactLabels` array is derived from the live export manifest (pure function over real track data). The panel's included list accurately reflects what exists.

## Threat Flags

No new network endpoints beyond what the plan's threat model covers.

- T-14-12 mitigated: export route fetches project + tracks with `.eq('user_id', user.id)` — non-owners get 404 before any Storage read or URL minting.
- T-14-13 mitigated: `createSignedUrl(packPath, 60*60*24*7)` — TTL in seconds, Supabase enforces expiry server-side. Literal `60*60*24*7` present (node verify enforces it). Fresh URL per request against stable path.
- T-14-14 mitigated: Export link uses no `is_public` flag, no public route — per-request, owner-generated, time-boxed signed URL only.
- T-14-15 partially mitigated: `zlib:{level:0}` (store) minimizes CPU; route uploads-then-signs, keeping Supabase byte transfer off the function budget. Residual risk for very large albums — surfaced by HOBBY-2 checkpoint.

## Self-Check: PASSED

- [x] `app/api/vault/[projectId]/export/route.ts` — found
- [x] `components/vault/ExportPackPanel.tsx` — found
- [x] `components/vault/ExportPackButton.tsx` — found
- [x] `components/vault/PlaybackView.tsx` — modified (TrackView.hasMasterWav added; toggle/upload/readiness unchanged)
- [x] `app/(artist)/vault/[projectId]/play/page.tsx` — modified (ExportPackButton in topbar, export manifest derived)
- [x] Commit `99dff24` — found in git log
- [x] Commit `df3875b` — found in git log
- [x] Commit `1b2cd5f` — found in git log
- [x] All three node verifies: PASS
- [x] `npx tsc --noEmit`: PASS
