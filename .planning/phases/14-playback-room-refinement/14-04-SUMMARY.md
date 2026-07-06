---
phase: 14-playback-room-refinement
plan: "04"
subsystem: export-pack-assembly
tags: [export-pack, pdf, react-pdf, pure-transform, D-10]
status: complete
dependency_graph:
  requires:
    - "14-01 (readStems, readInstrumental, readMasterAudio readers)"
  provides:
    - "buildExportManifest(project, tracks) — pure manifest assembler (D-10)"
    - "ExportManifest type — typed list of existing bundle members"
    - "renderCreditsSheet(input) — server-side credits/splits PDF Buffer"
    - "renderMetadataSheet(input) — server-side track metadata PDF Buffer"
  affects:
    - "Plan 06 (export route) consumes buildExportManifest + both renderers via archiver.append()"
tech_stack:
  added: []
  patterns:
    - "pure transform in lib/ (no Storage/DB I/O) — matches CLAUDE.md convention"
    - "@react-pdf/renderer renderToBuffer() for server-side PDF generation"
    - "collision-safe slugified filenames: {trackNum}-{title-slug}.{kind}.{ext}"
key_files:
  created:
    - lib/vault/export-pack.ts
    - lib/vault/pdf/credits-sheet.tsx
    - lib/vault/pdf/metadata-sheet.tsx
decisions:
  - "buildExportManifest() is pure (no await, no createServiceClient) — matches CLAUDE.md lib/ convention; I/O stays in Plan 06's route"
  - "BundleFile.path carries the storage path as-is from the reader; export route decides bucket name and calls service.storage.from(bucket).download(path)"
  - "renderToBuffer() chosen over renderToStream() — Buffer is simpler to pass to archiver.append() without stream coordination complexity"
  - "Both PDF renderers export a Document component (testable) AND an async renderer function (called by route)"
  - "creditsSheet + metadataSheet flags are typed as literal true (not boolean) — they are always generated; no conditional needed in the route"
metrics:
  duration: "~8 minutes"
  completed_date: "2026-07-06"
  tasks_completed: 3
  files_changed: 3
---

# Phase 14 Plan 04: Export Pack Assembly Layer Summary

Pure assembly layer for the Export Pack (D-10): `buildExportManifest()` typed manifest builder + two `@react-pdf/renderer` PDF templates for credits/splits and track metadata — zero I/O in this layer, cleanly consumable by the export route in Plan 06.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | buildExportManifest() — pure "which files exist" assembler | `4fac813` | lib/vault/export-pack.ts |
| 2 | credits-sheet.tsx — @react-pdf/renderer credits/splits PDF template | `616bd43` | lib/vault/pdf/credits-sheet.tsx |
| 3 | metadata-sheet.tsx — @react-pdf/renderer metadata PDF template | `e0ca49e` | lib/vault/pdf/metadata-sheet.tsx |

## Key Artifacts

### `buildExportManifest()` — pure manifest builder

File: `lib/vault/export-pack.ts`

Signature:
```typescript
export function buildExportManifest(
  project: ProjectRow & { artist_name?: string | null },
  tracks: TrackRow[]
): ExportManifest
```

`ExportManifest` shape:
```typescript
export type ExportManifest = {
  files: BundleFile[]     // only entries for refs that exist — absent refs are OMITTED
  hasMaster: boolean      // true if any track has a master WAV (D-08 no-master gate)
  creditsSheet: true      // always true — PDF always generated
  metadataSheet: true     // always true — PDF always generated
  tracks: ExportTrack[]   // enriched rows for PDF renderers (sorted by track_number)
  releaseTitle: string
  artistName: string
}

export type BundleFile = {
  path: string            // storage path — route calls service.storage.from(bucket).download(path)
  filename: string        // collision-safe: "01-song-title.master.wav"
  kind: 'master' | 'share' | 'stems' | 'instrumental'
}
```

Filename format: `{padded-track-number}-{title-slug}.{kind}.{ext}` — e.g. `01-song-title.master.wav`, `02-other-song.stems.zip`.

Purity enforced: no `createServiceClient`, no `.storage.`, no `.download(` anywhere in the file (node verify checks this).

### `renderCreditsSheet()` — credits/splits PDF

File: `lib/vault/pdf/credits-sheet.tsx`

Signature:
```typescript
export async function renderCreditsSheet(input: {
  releaseTitle: string
  artistName: string
  tracks: ExportManifest['tracks']
}): Promise<Buffer>
```

- Uses `renderToBuffer()` from `@react-pdf/renderer` — returns a Node Buffer for `archiver.append(buffer, { name: 'credits-and-splits.pdf' })`
- Data source: `readComposers(track.metadata)` (already populated in `ExportTrack.composers` by `buildExportManifest`)
- Layout: per-track tabular section (Writer / Role / PRO / IPI / Split%) + split total per track; flags in red when total ≠ 100%
- Also exports `CreditsSheetDocument` React component for unit-test isolation

### `renderMetadataSheet()` — track metadata PDF

File: `lib/vault/pdf/metadata-sheet.tsx`

Signature:
```typescript
export async function renderMetadataSheet(input: {
  releaseTitle: string
  artistName: string
  tracks: ExportManifest['tracks']
}): Promise<Buffer>
```

- Same `renderToBuffer()` pattern as credits sheet — returns Buffer
- Fields per row: ISRC, ISWC, BPM, key signature, language, duration (D-10)
- Landscape A4 page for wide table; alternating row shading
- Also exports `MetadataSheetDocument` for unit-test isolation

### Plan 06 wiring guide

```typescript
import { buildExportManifest } from '@/lib/vault/export-pack'
import { renderCreditsSheet } from '@/lib/vault/pdf/credits-sheet'
import { renderMetadataSheet } from '@/lib/vault/pdf/metadata-sheet'

const manifest = buildExportManifest(project, tracks)

// Iterate audio files
for (const f of manifest.files) {
  const { data: blob } = await service.storage.from(BUCKET).download(f.path)
  archive.append(blob, { name: f.filename })
}

// Generate PDFs
if (manifest.creditsSheet) {
  const pdfBuf = await renderCreditsSheet(manifest)
  archive.append(pdfBuf, { name: 'credits-and-splits.pdf' })
}
if (manifest.metadataSheet) {
  const pdfBuf = await renderMetadataSheet(manifest)
  archive.append(pdfBuf, { name: 'metadata.pdf' })
}
```

Note: `manifest.creditsSheet` and `manifest.metadataSheet` are typed as `true` (not `boolean`), so the `if` guard is redundant — but it reads intent clearly and costs nothing.

## Deviations from Plan

None — plan executed exactly as written. All three node verifies pass; `npx tsc --noEmit` passes clean.

## Known Stubs

None — this plan produces pure server-side library code with no UI and no data wiring. Downstream stubs (Plan 06 route, Plan 05 upload UI) are separate plans.

## Threat Flags

No new network endpoints or auth paths. These are pure library functions; trust boundaries enforced by Plan 06's export route (owner-scoped fetch + auth gate before calling these functions). T-14-07 (information disclosure via PDF) is mitigated by the pure-function design: renderers only receive already-owner-scoped rows.

## Self-Check: PASSED

- [x] `lib/vault/export-pack.ts` — found
- [x] `lib/vault/pdf/credits-sheet.tsx` — found
- [x] `lib/vault/pdf/metadata-sheet.tsx` — found
- [x] Commits `4fac813`, `616bd43`, `e0ca49e` — all found in git log
- [x] All three node verifies: PASS
- [x] `npx tsc --noEmit`: PASS (no errors)
