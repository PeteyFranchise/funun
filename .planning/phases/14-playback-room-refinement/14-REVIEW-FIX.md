---
phase: 14-playback-room-refinement
fixed_at: 2026-07-06T00:00:00Z
review_path: .planning/phases/14-playback-room-refinement/14-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 14: Code Review Fix Report

**Fixed at:** 2026-07-06
**Source review:** .planning/phases/14-playback-room-refinement/14-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (2 Critical, 8 Warning — fix_scope: critical_warning; 8 Info findings out of scope)
- Fixed: 10
- Skipped: 0

Every fix was verified with a full `tsc --noEmit` (clean) after application; the 16 jest tests in `__tests__/schema-stems-instrumental.test.ts` pass after all fixes.

## Fixed Issues

### CR-01: Stems/instrumental POST accept arbitrary storage paths — service-role confused deputy

**Files modified:** `app/api/vault/[projectId]/tracks/[trackId]/instrumental/route.ts`, `app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts`
**Commit:** 588597a
**Applied fix:** Both POST handlers now reject any `body.path` that does not start with the caller's `{user.id}/{projectId}/` prefix or that contains `..` (400 "Invalid storage path"), placed after the auth gate. Defense-in-depth: both DELETE handlers now refuse to `service.storage.remove()` any stored path outside that same prefix (metadata is still cleared), so stale/tampered paths persisted before this fix cannot destroy another user's object.

### CR-02: Public Now Playing page uses a raw private-bucket storage path as the audio src

**Files modified:** `app/r/[projectId]/page.tsx`
**Commit:** 71f4805
**Status:** fixed: requires human verification (functional playback behavior — confirm a public release actually streams)
**Applied fix:** Mirrors the play page's signing block: after the `is_public` gate, the page mints 2-hour signed URLs for all track `audio_file_url` paths via `createServiceClient().storage.from('track-audio').createSignedUrls(...)` and `toTrackViews` now maps `audioUrl` through the `signedByPath` lookup instead of passing the raw storage path to `<audio src>`.

### WR-01: Export route has no archiver error handling and never awaits finalize()

**Files modified:** `app/api/vault/[projectId]/export/route.ts`
**Commit:** 4ef485d
**Status:** fixed: requires human verification (stream error-propagation/race semantics are runtime-only — not provable by type/syntax checks)
**Applied fix:** `archive.on('error', …)` now destroys the passthrough with the error so the upload rejects instead of hanging to the 10s kill; `archive.finalize()` is awaited concurrently with the Storage upload via `Promise.all`, wrapped in try/catch that returns a structured 502 JSON error ("Could not assemble the export pack: …").

### WR-02: Export assembly unbounded vs 10s budget and 250MB bucket cap

**Files modified:** `lib/vault/export-pack.ts`, `app/api/vault/[projectId]/export/route.ts`
**Commit:** 34cb020
**Applied fix:** Short-term bound per the review's recommendation: `BundleFile` now carries `size` (from upload metadata via `readMasterAudio`/`readStems`/`readInstrumental`; 0 for the share MP3 whose size is unknown), and the route rejects packs whose summed size exceeds `MAX_PACK_BYTES` (200MB) with a 413 and an actionable message ("Download the stems ZIP separately from the playback room instead"). The longer-term background-job assembly remains future work as the review noted.

### WR-03: Unguarded request.json() in stems/instrumental POST

**Files modified:** `app/api/vault/[projectId]/tracks/[trackId]/instrumental/route.ts`, `app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts`
**Commit:** 8336ab8
**Applied fix:** Both handlers now use the guarded pattern from the export route: `try { body = ((await request.json()) ?? {}) as Record<string, unknown> } catch { return 400 'Invalid JSON body' }` — malformed bodies return a structured 400 and a literal JSON `null` body no longer throws a TypeError.

### WR-04: ZIP entry filenames not collision-safe

**Files modified:** `lib/vault/export-pack.ts`
**Commit:** 4683f40
**Applied fix:** Added a per-manifest `makeUniqueNamer()` deduplicator (Map-based, appends `-2`, `-3`, … before the first dot on repeats) and wrapped all four `bundleFilename(...)` call sites in `buildExportManifest` with it. State is per-invocation, so repeated manifest builds don't leak counts.

### WR-05: Time formatting shows "0:60" / "1:60" at minute boundaries

**Files modified:** `components/vault/PlaybackView.tsx`, `lib/vault/pdf/metadata-sheet.tsx`
**Commit:** 0707223
**Applied fix:** Both `fmt` and `fmtDuration` now round once then split (`total = Math.round(s); m = floor(total/60); sec = total % 60`), eliminating the `sec === 60` render at x:59.5+.

### WR-06: `as unknown as` double-casts into buildExportManifest

**Files modified:** `lib/vault/export-pack.ts`, `app/(artist)/vault/[projectId]/play/page.tsx`, `app/api/vault/[projectId]/export/route.ts`
**Commit:** 8a74c21
**Applied fix:** `buildExportManifest` now declares the minimal fields it actually reads via new exported `ManifestProjectInput` / `ManifestTrackInput` types (optional fields tolerate the play page's narrower select), with `?? null` coercion inside the builder so `ExportTrack` fields are never silently `undefined`. Both call sites' `as unknown as Parameters<...>` casts were removed and now typecheck directly; the unused `ProjectRow`/`TrackRow` import from `lib/metadata/bundle` was dropped. (Adapted from the review's `Pick<TrackRow, …>` suggestion because the play page's local row type has optional properties that `Pick` would reject.)

### WR-07: StemsUpload swallows failures

**Files modified:** `components/vault/StemsUpload.tsx`
**Commit:** c8d7e6b
**Applied fix:** Added `.catch` to the `findPreviousUploads().then(...)` chain (sets `stemsError` + resets progress so the UI can't stick at "Uploading… 0%"), and a `catch` block before the `finally` in `onSuccess` that surfaces network failures of the metadata POST ("Failed to save stems reference: …").

### WR-08: Owner-only UI leaks onto the public Now Playing page

**Files modified:** `components/vault/PlaybackView.tsx`
**Commit:** c30fcb0
**Applied fix:** The "Files" section (Master Uploaded/Missing + StemsUpload rows) and the inline readiness widget (`Readiness {score}/100 … →` link into `/vault/{projectId}`) are both gated behind `{canManage && (…)}`, so `canManage=false` (public/anonymous) viewers no longer see the false "Readiness 0/100 · Needs work" verdict or links into the private artist app.

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-07-06_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
