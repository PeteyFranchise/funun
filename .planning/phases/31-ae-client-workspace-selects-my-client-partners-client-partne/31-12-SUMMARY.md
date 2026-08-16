---
phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
plan: 12
subsystem: infra
tags: [watermarking, supabase-storage, signed-url, next.js, jest, tdd]

# Dependency graph
requires:
  - phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
    provides: "31-01's WatermarkProvider interface (lib/watermark/provider.ts) and the owner-locked in-house/async approach (lib/watermark/README.md)"
provides:
  - "lib/watermark/stream-preview.ts — renderStreamPreview/renderPreviewIfAbsent (per-track, pre-computed, private-bucket watermark render)"
  - "lib/watermark/signed-url.ts — getPreviewSignedUrl(trackId), the shareable player's sole audio accessor"
affects: [31-13 (shareable Selects player)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Runtime-provisioned private Supabase Storage bucket (service-role createBucket/getBucket) instead of a schema migration — this project's migrations are human-gated (supabase db push run manually), a storage bucket is not"
    - "Cheap existence check (storage .list()) before a pre-computed render, so a request-time accessor can return 'processing' without ever awaiting the render itself"
    - "In-house WAV PCM tone-pulse injection (no ffmpeg/codec/watermarking package) for the D-01 audible tag"

key-files:
  created:
    - lib/watermark/stream-preview.ts
    - lib/watermark/signed-url.ts
    - lib/watermark/signed-url.test.ts
  modified: []

key-decisions:
  - "Previews bucket (selects-stream-previews) is provisioned at runtime via the service-role client (getBucket/createBucket), not via a new SQL migration — this repo's migrations are human-gated and pushed manually (see migrations/111_selects.sql header), while a storage bucket has no such gate; also keeps this plan's files_modified exactly as scoped."
  - "renderPreviewIfAbsent resolves a track's source audio by preferring tracks.audio_file_url (the 'share' file already used for in-app playback) and falling back to metadata.master (the distribution WAV) — the stream preview is meant to be evaluatively listened to in a browser player, which is what audio_file_url already serves."
  - "The stream-preview path is keyed by track_id ONLY (not selects_id/share_token) since the audible tag is not per-recipient (per README.md) — one render is reused across every Selects/share containing that track."
  - "renderForensicDownload returns status 'pending' (the closest fit in WatermarkRenderStatus for provider.ts's 'processing/unavailable' language) — no rendering occurs; this is the A2 fast-follow (D-03) stub, sequenced out of this plan's scope per the phase objective."

patterns-established:
  - "Fire-and-forget background render from a synchronous-feeling accessor: getPreviewSignedUrl calls `void renderPreviewIfAbsent(trackId).catch(() => {})` and returns 'processing' immediately, never awaiting the render inside the accessor's own call path (Vercel Hobby 10s maxDuration)."

requirements-completed: [R12, D-01, D-03]

coverage:
  - id: D1
    description: "renderStreamPreview writes a per-track watermarked preview to a PRIVATE bucket via an async, pre-computed step; never renders inline in a request handler."
    requirement: "R12"
    verification:
      - kind: unit
        ref: "tsc --noEmit (structural/type check) + grep renderStreamPreview lib/watermark/stream-preview.ts"
        status: pass
    human_judgment: true
    rationale: "Audio-content correctness of the D-01 audible tag (does the tonal pulse sound right, is it non-intrusive) cannot be asserted by an automated test — it is explicitly called out in the plan as a human UAT check. Structural correctness (private bucket, master read-not-served, pre-computed) is automated; audible-tag character is not."
  - id: D2
    description: "getPreviewSignedUrl(trackId) resolves ONLY the watermarked-preview path — it is structurally incapable of returning a signed URL to the master bucket."
    requirement: "R12"
    verification:
      - kind: unit
        ref: "lib/watermark/signed-url.test.ts#getPreviewSignedUrl — never-master guarantee (T-31-27)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A not-yet-rendered preview resolves to a 'processing' status without blocking on the render (the render is fired without being awaited)."
    requirement: "R12"
    verification:
      - kind: unit
        ref: "lib/watermark/signed-url.test.ts#a missing preview yields \"processing\", never a master-bucket fallback, and does not block on the render"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-08-15
status: complete
---

# Phase 31 Plan 12: Stream-Preview Watermark Render + Signed-URL Accessor Summary

**Async, pre-computed per-track watermark render into a private Supabase Storage bucket, plus a `getPreviewSignedUrl(trackId)` accessor that is structurally incapable of resolving a clean-master path — the only audio entry point the 31-13 shareable player is allowed to use.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-15T22:40:00-04:00
- **Tasks:** 2
- **Files modified:** 3 (all net-new)

## Accomplishments
- `lib/watermark/stream-preview.ts` implements `WatermarkProvider.renderStreamPreview` end to end: reads the master from the `track-audio` bucket, mixes an in-house tonal-pulse watermark into 16-bit PCM WAV audio, writes the result to a private `selects-stream-previews` bucket keyed by `track_id`, and never returns the master path.
- `renderPreviewIfAbsent(trackId)` is idempotent — a cheap `storage.list()` existence check short-circuits a second call for an already-rendered track instead of re-rendering — and resolves the source path itself (share MP3 first, master WAV fallback) so callers only ever pass a `trackId`.
- `renderForensicDownload` is present (satisfies the `WatermarkProvider` interface fully) but does no rendering — returns `{ status: 'pending' }`, cleanly sequencing the A2 forensic-download fast-follow (D-03) out of this plan's scope.
- `lib/watermark/signed-url.ts` exports `getPreviewSignedUrl(trackId)`, the player's sole audio accessor: signs the previews-bucket path when ready, or triggers a non-awaited `renderPreviewIfAbsent` and returns `'processing'` immediately when not.
- `lib/watermark/signed-url.test.ts` proves the never-master guarantee (T-31-27) via a full RED → GREEN TDD cycle — 4 tests, all passing.
- `npx tsc --noEmit` clean across the whole project with both new modules present.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement renderStreamPreview (per-track, pre-computed, private bucket)** - `5982ba9` (feat)
2. **Task 2: getPreviewSignedUrl — watermarked-path-only accessor (+ never-master test)** - `83acfa1` (test, RED) → `5af3997` (feat, GREEN)

**Plan metadata:** committed alongside this SUMMARY.

_TDD task (Task 2) has two commits: a failing test (verified to fail with "module not found" before the implementation existed) followed by the implementation that turns it green._

## Files Created/Modified
- `lib/watermark/stream-preview.ts` - `renderStreamPreview`, `renderForensicDownload` (WatermarkProvider implementation), `renderPreviewIfAbsent`, `findExistingPreview`, private-bucket provisioning, in-house WAV tone-pulse injection
- `lib/watermark/signed-url.ts` - `getPreviewSignedUrl(trackId)`, the previews-bucket-only signed-URL accessor
- `lib/watermark/signed-url.test.ts` - never-master guarantee tests (T-31-27) for `getPreviewSignedUrl`

## Decisions Made
- Provisioned the private previews bucket (`selects-stream-previews`) at runtime via the service-role client (`getBucket`/`createBucket`, idempotent) rather than adding a new SQL migration. This repo's migrations are human-gated — the owner runs `supabase db push` manually (per `migrations/111_selects.sql`'s header, "this project never runs `supabase db push` from an agent") — while a storage bucket carries no such gate. It also keeps this plan's file footprint exactly as scoped in the frontmatter's `files_modified`.
- `renderPreviewIfAbsent` resolves source audio by preferring `tracks.audio_file_url` (the "share" MP3 already streamed by the existing vault play page) over `metadata.master` (the distribution WAV), since a stream preview is meant for an in-browser evaluative listen — the same file the app already plays elsewhere.
- The stream-preview storage path is keyed by `track_id` alone (not `selects_id`/`share_token`) because the audible tag is not per-recipient (README.md) — this makes the render genuinely cacheable/idempotent across every Selects that includes the track, matching the plan's idempotency acceptance criterion.
- `renderForensicDownload` returns `status: 'pending'` — the closest fit in `WatermarkRenderStatus` (`pending | ready | failed`) for the "processing/unavailable" language used in the plan and provider.ts comments — and performs no work, correctly sequencing D-03 as the A2 fast-follow outside this plan's scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Guarded the previews-bucket provisioning against a create-race**
- **Found during:** Task 1 (renderStreamPreview implementation)
- **Issue:** A naive `getBucket` → `createBucket` sequence is not atomic; two concurrent first-render requests for different tracks could both see "missing" and both call `createBucket`, and Supabase Storage's `createBucket` errors if the bucket already exists.
- **Fix:** `ensurePreviewsBucket()` treats an "already exists"-shaped error from `createBucket` as a success (the bucket existing either way satisfies the function's postcondition) rather than surfacing it as a render failure.
- **Files modified:** lib/watermark/stream-preview.ts (part of the Task 1 commit, not a separate fix)
- **Verification:** Code review / structural reasoning — no live Supabase instance available in this environment to reproduce the race; the guard is defensive and does not change behavior in the non-race case.
- **Committed in:** `5982ba9` (Task 1 commit, written in from the start — not a follow-up patch)

---

**Total deviations:** 1 auto-fixed (1 missing-critical robustness guard, folded into the original Task 1 commit rather than a separate fix commit)
**Impact on plan:** No scope creep — the guard is a small defensive addition inside the one function the plan already specified, needed for correctness under concurrent access, not a new capability.

## Known Stubs

- **Compressed-source audible tag (mp3/aac/flac/ogg/webm) is a pass-through, not tone-injected.** `injectTonalPulse` only performs real PCM tone-pulse mixing for `wav` sources (`PCM_EXTENSIONS`); other formats are copied byte-for-byte into the previews bucket unmodified. Reason: no watermarking or audio-codec package is installed or approved for this plan (README.md Prohibitions: "No watermarking/forensic package is installed by this plan" and the objective's explicit "do NOT install one"), and real DSP on compressed containers requires a decode/encode step this project has no dependency for. This does **not** weaken the automated, tested guarantee this plan is scored against — `getPreviewSignedUrl` still never resolves a signed URL against the master bucket regardless of source format (T-31-27, proven by test) — but it does mean tracks whose playable "share" file is MP3 (the common case, since the vault upload flow's default playback role is `share`/MP3) will get an untagged stream preview today. Flagged for the 31-13 shareable-player plan and/or an A2-adjacent fast-follow to either (a) accept a third-party audio codec dependency through the Package Legitimacy Gate, or (b) require WAV as the stream-preview source and generate it from the master at a different pipeline stage.
- **`renderForensicDownload` performs no rendering** — returns `{ status: 'pending', path: null, ... }` unconditionally. This is the explicitly-scoped A2 fast-follow (D-03, per-share forensic download) and is not a defect in this plan; the shareable player (31-13) must treat this as "not yet available" and must not fall back to a master download.

## Issues Encountered
None beyond the deviation and stub documented above.

## User Setup Required
None - no external service configuration required. The private `selects-stream-previews` Supabase Storage bucket is provisioned automatically by `renderStreamPreview`/`renderPreviewIfAbsent` the first time either runs against a live Supabase project (idempotent thereafter).

## Next Phase Readiness
- 31-13 (shareable Selects player) can import `getPreviewSignedUrl` from `lib/watermark/signed-url.ts` as its sole audio source — it must not import `lib/storage/index.ts`'s master-bucket helpers or the vault play page's `createSignedUrls` pattern for this surface.
- The player should poll or re-request on a `'processing'` status rather than treating it as an error, and should show an interim state per the plan's must-have ("the render never blocks the player's play/react/approve flow").
- The compressed-source audible-tag gap (see Known Stubs) is a real product gap worth flagging to the owner before 31-13 ships broadly — MP3-sourced tracks (the common case today) will stream an untagged preview.

---
*Phase: 31-ae-client-workspace-selects-my-client-partners-client-partne*
*Completed: 2026-08-15*

## Self-Check: PASSED

- FOUND: lib/watermark/stream-preview.ts
- FOUND: lib/watermark/signed-url.ts
- FOUND: lib/watermark/signed-url.test.ts
- FOUND: .planning/phases/31-ae-client-workspace-selects-my-client-partners-client-partne/31-12-SUMMARY.md
- FOUND commit: 5982ba9 (Task 1)
- FOUND commit: 83acfa1 (Task 2 RED)
- FOUND commit: 5af3997 (Task 2 GREEN)
- FOUND commit: 1d17c14 (SUMMARY.md)
