---
phase: 14-playback-room-refinement
plan: "05"
subsystem: playback-room-ui
tags: [playback, stems, instrumental, signed-urls, readiness, tus-js-client, upload]
status: complete
dependency_graph:
  requires:
    - "14-01 (tus-js-client installed, track-audio bucket 250MB, StemsFile/InstrumentalFile types)"
    - "14-03 (/stems and /instrumental JSON routes for post-upload persistence)"
  provides:
    - "StemsUpload.tsx — tus-js-client direct-to-storage stems ZIP + instrumental upload component"
    - "PlaybackView.tsx — Master/Instrumental source-swap toggle, Download-stems button, inline readiness widget, StemsUpload mounted"
    - "play/page.tsx — signed URLs for master+instrumental+stems, readiness score wiring, topbar readiness chip"
  affects:
    - "app/r/[projectId]/page.tsx — updated to include new TrackView fields (null/false defaults for public non-owner page)"
    - "Plan 06 (ExportPack) — exportSlot prop reserved on PlaybackView; TrackView shape documented below"
tech_stack:
  added: []
  patterns:
    - "tus-js-client resumable upload against Supabase /storage/v1/upload/resumable (6MB chunks)"
    - "signed URL minting pattern: createServiceClient().storage.from('track-audio').createSignedUrls(paths, 7200)"
    - "hide-when-absent empty state: component renders null when !canManage && file absent"
    - "source-swap pattern: <audio src> branches on source state ('master'|'instrumental')"
key_files:
  created:
    - components/vault/StemsUpload.tsx
  modified:
    - components/vault/PlaybackView.tsx
    - app/(artist)/vault/[projectId]/play/page.tsx
    - app/r/[projectId]/page.tsx
decisions:
  - "StemsUpload uses tus-js-client for stems (250MB, chunked) but plain supabase.storage.upload() for instrumental (under 50MB) — TUS is overkill for small files and adds resume-state complexity without benefit"
  - "Topbar readiness chip uses the same tone classes (emerald/amber/rose) as VaultProjectCard's existing chip — no new color tokens introduced"
  - "app/r/[projectId]/page.tsx updated as Rule 3 deviation: the public share page also imports PlaybackView and needed new TrackView fields; added null/false defaults since the public page has no owner context"
  - "The verify check's regex for 'owner gate' (user?.id ?? '') contained a regex alternation that didn't match; fixed the check logic while confirming .eq('user_id', user?.id ?? '') is present"
  - "exportSlot prop on PlaybackView is typed as React.ReactNode with a ? optional — Plan 06 passes the Export Pack trigger here without touching toggle/transport logic"
metrics:
  duration: "~5 minutes"
  completed_date: "2026-07-06"
  tasks_completed: 3
  files_changed: 4
---

# Phase 14 Plan 05: Playback Room Rework Summary

Reworked the playback room into a real working room: fixed broken playback (raw paths → signed URLs), added a working Master/Instrumental source-swap toggle, stems ZIP and instrumental upload affordances (direct-to-storage), a separate Download-stems button, readiness widgets in two placements, and hide-when-absent empty states throughout.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | StemsUpload.tsx — tus-js-client stems + instrumental upload | `9eba37e` | components/vault/StemsUpload.tsx |
| 2 | Rework PlaybackView.tsx — toggle, download stems, readiness widgets, empty states | `8e31bbe` | components/vault/PlaybackView.tsx, app/r/[projectId]/page.tsx |
| 3 | Rewire play/page.tsx — signed URLs, readiness score, topbar chip | `a517a80` | app/(artist)/vault/[projectId]/play/page.tsx |
| 4 | Deployment smoke test (HOBBY-1) | — | BLOCKING CHECKPOINT — see below |

## Key Artifacts

### TrackView type shape (for Plan 06)

```typescript
export type TrackView = {
  id: string
  number: number
  title: string
  durationSeconds: number | null
  isrc: string | null
  iswc: string | null
  bpm: number | null
  language: string | null
  audioUrl: string | null          // signed URL for share/master playback
  instrumentalUrl: string | null   // signed URL for instrumental (null when absent)
  hasStems: boolean                // whether a stems ZIP exists
  stemsUrl: string | null          // signed download URL for stems ZIP
  credits: { name: string; role: string; split: number }[]
  splitTotal: number
}
```

### PlaybackView new props (for Plan 06)

```typescript
{
  projectId: string
  userId: string
  canManage: boolean
  readinessScore: number
  exportSlot?: React.ReactNode  // reserved — Plan 06 passes Export Pack trigger here
}
```

### Signed URL minting (play/page.tsx)

Collects `audio_file_url`, `readMasterAudio()?.path`, `readInstrumental()?.path`, and `readStems()?.path` for every track, then calls `createServiceClient().storage.from('track-audio').createSignedUrls(paths, 60 * 60 * 2)`. The owner gate `.eq('user_id', user?.id ?? '')` is enforced before any URL is minted.

### StemsUpload.tsx

- Stems: `tus.Upload` against `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`, `chunkSize: 6MB`, Bearer authorization header, `x-upsert: 'true'`, metadata `{ bucketName, objectName, contentType: 'application/zip' }`. On success, POSTs `{ path, size, name }` to `/api/vault/${projectId}/tracks/${trackId}/stems`.
- Instrumental: `supabase.storage.from('track-audio').upload(path, file, { upsert: true })`. On success, POSTs `{ path, size, ext }` to `/api/vault/${projectId}/tracks/${trackId}/instrumental`.
- D-09 ⓘ popover: exact UI-SPEC copy rendered in a small popover; no new dependency.
- D-08: returns null when `!canManage && !hasStemsFile && !hasInstrumental`.

## Deviations from Plan

### Rule 3 — app/r/[projectId]/page.tsx type fix

**1. [Rule 3 - Blocking] Public share page needed new TrackView fields**
- **Found during:** Task 2, TypeScript check
- **Issue:** `app/r/[projectId]/page.tsx` also imports `PlaybackView` and `TrackView`; after adding `instrumentalUrl`, `hasStems`, `stemsUrl` to `TrackView`, the public share page's `toTrackViews` was missing these fields.
- **Fix:** Added `instrumentalUrl: null`, `hasStems: false`, `stemsUrl: null` defaults in the public share page's `toTrackViews`. Also added `projectId`, `userId=""`, `canManage={false}`, `readinessScore={0}` props to the `<PlaybackView>` call. Non-owner viewers see no upload affordances (D-08 satisfied).
- **Files modified:** `app/r/[projectId]/page.tsx`
- **Commit:** `8e31bbe` (included in Task 2 commit)

### Verify check regex adjustment

The plan's Task 3 node verify checked for `user\?\.id ?? ''|user\.id` as a regex alternation — this pattern does not correctly match the `user?.id ?? ''` literal due to regex alternation binding. The owner gate `.eq('user_id', user?.id ?? '')` is present and enforced; the verify was re-run with a corrected grep pattern (`.eq('user_id',`).

No other deviations — plan executed as written.

## HOBBY-1 Deployment Checkpoint Status

**Task 4 is a BLOCKING human-verify checkpoint:** The >4.5MB stems upload test requires a real Vercel (Hobby) deployment. Cannot be verified in local `next dev` (no 4.5MB ceiling). HOBBY-1 is DEFERRED to human verification on next deploy.

Per STATE.md's infrastructure note: this project runs on Vercel Hobby tier with a hard 4.5MB request body cap. The `StemsUpload.tsx` component bypasses this ceiling by uploading bytes directly to Supabase Storage (not through a Next.js route). The `/stems` route receives only JSON (`{ path, size, name }`), well under the ceiling.

## Verification Status

| Check | Status | Notes |
|-------|--------|-------|
| Task 1 node verify (tus-js-client, resumable endpoint, stems/instrumental routes, no FormData proxy) | PASS | Prints `PASS` |
| Task 2 node verify (old 'stems' toggle gone, instrumental present, no 'Not added', readiness widget, StemsUpload mounted) | PASS | Prints `PASS` |
| Task 3 node verify (createSignedUrls, readinessLabel, instrumentalUrl, owner gate) | PASS | Prints `PASS` (regex adjusted — owner gate confirmed present) |
| `npx tsc --noEmit` | PASS | No errors |
| HOBBY-1: >4.5MB stems upload on real deployment | DEFERRED | Blocking human checkpoint — human must deploy and verify |

## Known Stubs

None — all new props are wired to real data. The `exportSlot` prop is optional and intentionally absent (Plan 06 will wire it); the slot renders nothing when not provided. The public share page receives `readinessScore={0}` which is correct (non-owner pages should not display a meaningful readiness score).

## Threat Flags

No new network endpoints beyond what the plan's threat model covers.

- T-14-09 mitigated: `StemsUpload` derives the upload path from `userId/${projectId}/${trackId}...` — no user-controlled path input accepted.
- T-14-10 mitigated: signed URLs are minted on the owner-gated server component (`.eq('user_id', user?.id ?? '')`), 2-hour TTL, from the service client.
- T-14-11 accepted: bucket `file_size_limit` (250MB) and TUS chunking bound client memory; see STATE.md Deferred Items.

## Self-Check: PASSED

- [x] `components/vault/StemsUpload.tsx` — found
- [x] `components/vault/PlaybackView.tsx` — modified with Master/Instrumental toggle, StemsUpload, readiness widget
- [x] `app/(artist)/vault/[projectId]/play/page.tsx` — rewired with signed URLs, readiness, topbar chip
- [x] `app/r/[projectId]/page.tsx` — updated with new TrackView fields
- [x] Commit `9eba37e` — found in git log
- [x] Commit `8e31bbe` — found in git log
- [x] Commit `a517a80` — found in git log
