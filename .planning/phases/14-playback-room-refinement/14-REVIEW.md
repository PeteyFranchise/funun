---
phase: 14-playback-room-refinement
reviewed: 2026-07-07T01:53:30Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - __tests__/schema-stems-instrumental.test.ts
  - app/(artist)/vault/[projectId]/page.tsx
  - app/(artist)/vault/[projectId]/play/page.tsx
  - app/api/vault/[projectId]/export/route.ts
  - app/api/vault/[projectId]/tracks/[trackId]/instrumental/route.ts
  - app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts
  - app/r/[projectId]/page.tsx
  - components/vault/ExportPackButton.tsx
  - components/vault/ExportPackPanel.tsx
  - components/vault/PlaybackView.tsx
  - components/vault/ProjectTabs.tsx
  - components/vault/StemsUpload.tsx
  - components/vault/VaultProjectCard.tsx
  - lib/metadata/schema.ts
  - lib/vault/export-pack.ts
  - lib/vault/pdf/credits-sheet.tsx
  - lib/vault/pdf/metadata-sheet.tsx
  - supabase/migrations/041_track_audio_stems_config.sql
findings:
  critical: 2
  warning: 8
  info: 8
  total: 18
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-07-07T01:53:30Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Reviewed all 18 changed source files for the playback-room + export-pack phase. Verification performed: full `tsc --noEmit` passes clean, the 16 new jest tests pass, `archiver@8.0.0` in `node_modules` does export the `ZipArchive` named class the export route imports (the import is valid despite looking unusual), and `@supabase/storage-js` does handle Node stream upload bodies (`duplex: 'half'` is set automatically) — so the export route's core mechanics are sound.

Two critical issues remain. The most serious is a confused-deputy vulnerability: the stems/instrumental POST routes persist a client-supplied storage `path` into `tracks.metadata` with no owner-prefix validation, and three downstream code paths then act on that path with the **service-role** client (signed-URL minting on the play page, ZIP assembly in the export route, and object deletion in the DELETE handlers) — bypassing the owner-path RLS from migration 004. The second is that the public `/r/[projectId]` page feeds a raw private-bucket storage path into `<audio src>`, so public playback cannot work.

Warnings cluster around the export route's failure modes under the Vercel Hobby 10s ceiling (no archiver error handling, whole-file in-memory buffering, pack size vs. the 250MB bucket cap), unguarded `request.json()` parsing, ZIP filename collisions, and swallowed errors in the tus upload flow.

## Critical Issues

### CR-01: Stems/instrumental POST accept arbitrary storage paths — service-role confused deputy (cross-tenant read, exfiltration, and deletion)

**File:** `app/api/vault/[projectId]/tracks/[trackId]/instrumental/route.ts:27-51` and `app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts:27-51`
**Issue:** Both POST handlers persist `body.path` into `tracks.metadata` after only checking it is a non-empty string. There is no validation that the path lives under the caller's owner prefix (`{user.id}/{projectId}/…`). Storage RLS (migration 004: `(storage.foldername(name))[1] = auth.uid()::text`) protects direct client access to the bucket, but three downstream consumers act on this metadata path with the **service-role** client, which bypasses RLS entirely:

1. **Signed-URL minting** — `app/(artist)/vault/[projectId]/play/page.tsx:130-138` calls `createServiceClient().storage.from(BUCKET).createSignedUrls(paths, …)` on paths read from metadata. An attacker who sets `instrumental.path` to another user's object path (e.g. `{victimUserId}/{projectId}/{trackId}.master.wav` — the fixed, guessable path shapes used by the audio routes) receives a working signed URL to the victim's file on their own play page.
2. **Export exfiltration** — `app/api/vault/[projectId]/export/route.ts:127-137` downloads every `manifest.files[].path` (sourced from the same metadata) with the service client and packages the bytes into the attacker's ZIP.
3. **Cross-tenant deletion** — both DELETE handlers (`instrumental/route.ts:96-99`, `stems/route.ts:96-99`) run `service.storage.from(BUCKET).remove([path])` on the stored path. POST a victim path, then DELETE → the victim's storage object is destroyed (data loss).

Exploitation requires knowing victim UUIDs, but IDs leak through public surfaces (`/r/[projectId]` exposes project and track IDs) and UUIDs are not an authorization mechanism. This violates the project's explicit "owner gates via user_id checks on every API handler" rule at the storage-path layer.
**Fix:** Validate the owner prefix in both POST handlers before persisting (and ideally verify the object exists):
```typescript
const path: string = body.path.trim()
const expectedPrefix = `${user.id}/${projectId}/`
if (!path.startsWith(expectedPrefix) || path.includes('..')) {
  return NextResponse.json({ error: 'Invalid storage path' }, { status: 400 })
}
```
(Place this after the auth gate so `user.id` is available. As defense-in-depth, the DELETE handlers can also refuse to `remove()` any path outside `expectedPrefix`.)

### CR-02: Public Now Playing page uses a raw private-bucket storage path as the audio src — public playback is broken

**File:** `app/r/[projectId]/page.tsx:40`
**Issue:** `audioUrl: t.audio_file_url ?? null` passes the raw column value to `<audio src>`. `audio_file_url` stores a **storage path**, not a URL — see `app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts` (`update = { audio_file_url: path, // store the storage PATH; URLs are signed on read }`), and both owner pages (`vault/[projectId]/page.tsx`, `play/page.tsx`) sign it via `createSignedUrls` before rendering. On the public page the path (e.g. `userId/projectId/trackId.mp3`) resolves as a relative URL against the site origin and 404s; the bucket is private so even a constructed storage URL would be rejected. Every public release page renders a playable-looking UI ("Master: Uploaded", enabled play button) that cannot play. The line predates this phase, but this phase touched the file (added `instrumentalUrl`/`hasStems`/`stemsUrl: null` and new PlaybackView props) without fixing the broken playback contract it feeds.
**Fix:** Mirror the play page's signing block — mint short-lived signed URLs for public tracks server-side (the `is_public` app-level gate already exists at line 73):
```typescript
const service = createServiceClient()
const paths = (project.tracks ?? []).map(t => t.audio_file_url).filter((p): p is string => Boolean(p))
const signedByPath: Record<string, string> = {}
if (paths.length > 0) {
  const { data: signed } = await service.storage.from('track-audio').createSignedUrls(paths, 60 * 60 * 2)
  for (const row of signed ?? []) {
    if (row.signedUrl && row.path) signedByPath[row.path] = row.signedUrl
  }
}
// then: audioUrl: t.audio_file_url ? signedByPath[t.audio_file_url] ?? null : null
```

## Warnings

### WR-01: Export route has no archiver error handling and never awaits `finalize()` — a mid-stream failure hangs the request until the 10s kill

**File:** `app/api/vault/[projectId]/export/route.ts:122-156`
**Issue:** `archive` and `passthrough` have no `'error'` listeners, and `archive.finalize()` (line 148) is fire-and-forget. Storage downloads are validated up-front, but the appended `Readable.fromWeb(blob.stream())` sources are consumed lazily during finalization, concurrent with the `upload(packPath, passthrough)` await. If any source stream errors mid-flight, `archive` emits `'error'` — an unhandled `'error'` event on an EventEmitter throws/crashes, and `passthrough` never ends, so the upload await hangs until Vercel kills the function at 10s with no JSON error returned to the panel (which then shows only the generic failure).
**Fix:** Wire errors into the passthrough and race finalize with the upload:
```typescript
archive.on('error', err => passthrough.destroy(err))
const [ , upResult] = await Promise.all([
  archive.finalize(),
  service.storage.from(BUCKET).upload(packPath, passthrough, { contentType: 'application/zip', upsert: true }),
])
```
(wrapped in try/catch returning a 502 JSON error).

### WR-02: Export assembly buffers every artifact in memory inside a 10s/serverless budget; pack can also exceed the bucket's 250MB limit

**File:** `app/api/vault/[projectId]/export/route.ts:127-162`
**Issue:** `service.storage.download(file.path)` resolves a `Blob` — the entire object is buffered in function memory before `blob.stream()` is appended, sequentially per file. A realistic pack (multi-track master WAVs + a ~200MB stems ZIP + instrumentals) means hundreds of MB pulled through a function hard-capped at `maxDuration = 10` — the route will time out or exhaust memory for exactly the projects the feature targets. Separately, the assembled ZIP is uploaded to `track-audio`, whose `file_size_limit` migration 041 sets to 262144000 (250MB); any pack whose combined artifacts exceed that fails the upload with a 502 after burning the whole budget. This is an availability/correctness failure under the phase's own stated constraints, not a performance nit.
**Fix:** Short-term: bound the work — skip or reject packs whose summed `size` metadata exceeds a safe threshold and surface a clear error ("Pack too large — download stems separately"). Longer-term: move assembly off the request path (Supabase Edge Function or background job writing to Storage, client polls for the signed URL).

### WR-03: Unguarded `request.json()` in stems/instrumental POST — malformed body yields an unhandled 500; JSON `null` body throws TypeError

**File:** `app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts:25-27` and `.../instrumental/route.ts:25-27`
**Issue:** `const body = await request.json()` throws on a malformed/empty body and escapes the handler as an unhandled exception (generic 500, no structured error — violates the project's explicit-error convention). Additionally, a body of literal `null` parses successfully, and `body.path` then throws `TypeError: Cannot read properties of null`. The export route (`export/route.ts:94-99`) already demonstrates the correct guarded pattern.
**Fix:**
```typescript
let body: Record<string, unknown>
try {
  body = ((await request.json()) ?? {}) as Record<string, unknown>
} catch {
  return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
}
```

### WR-04: ZIP entry filenames are not collision-safe despite the documented guarantee

**File:** `lib/vault/export-pack.ts:77-91`
**Issue:** `bundleFilename` is documented as "collision-safe", but two tracks sharing a `track_number` (or both `null` → `00`) and the same/empty slug (non-ASCII titles slugify to `''` → `'track'`) produce identical entry names, e.g. two `00-track.master.wav` entries appended to the same archive. Archiver does not deduplicate — the ZIP ends up with duplicate entries, and most extractors silently keep only one, dropping a master from the deliverable.
**Fix:** Track used names and append a disambiguating suffix:
```typescript
const seen = new Map<string, number>()
function unique(name: string): string {
  const n = (seen.get(name) ?? 0) + 1
  seen.set(name, n)
  if (n === 1) return name
  const dot = name.indexOf('.')
  return `${name.slice(0, dot)}-${n}${name.slice(dot)}`
}
```

### WR-05: Time formatting shows "0:60" / "1:60" at minute boundaries

**File:** `components/vault/PlaybackView.tsx:27-32` and `lib/vault/pdf/metadata-sheet.tsx:116-121`
**Issue:** Both `fmt` and `fmtDuration` compute `m = Math.floor(s / 60)` then `sec = Math.round(s % 60)`. For fractional inputs ≥ x:59.5 (e.g. `59.7`), `sec` rounds to 60 → renders `0:60` instead of `1:00`. In `PlaybackView` this is fed live from `audio.currentTime` on every `timeupdate`, so the broken value is visibly displayed for ~half a second at every minute boundary during playback.
**Fix:** Round once, then split:
```typescript
const total = Math.round(s)
const m = Math.floor(total / 60)
const sec = total % 60
```

### WR-06: `as unknown as` double-casts into `buildExportManifest` bypass type checking in two call sites

**File:** `app/(artist)/vault/[projectId]/play/page.tsx:148-153` and `app/api/vault/[projectId]/export/route.ts:104-107`
**Issue:** Both callers force objects through `as unknown as Parameters<typeof buildExportManifest>[0]` / `[1]` because their local row shapes don't satisfy `ProjectRow`/`TrackRow` from `lib/metadata/bundle`. The play page's track select omits `key_signature`, `explicit`, and `featuring_artists`, so `ExportTrack.key_signature` (typed `string | null`) is silently `undefined` in the manifest built there. Today only `files`/`hasMaster` are consumed on that page, but the cast means any future field added to `buildExportManifest`'s reads (e.g. rendering PDFs from the page-built manifest) fails at runtime with zero compiler signal — the exact failure mode strict mode exists to prevent.
**Fix:** Narrow the function's declared input to what it actually reads instead of casting at call sites:
```typescript
export function buildExportManifest(
  project: { title: string; artist_name?: string | null },
  tracks: Array<Pick<TrackRow, 'id' | 'title' | 'track_number' | 'isrc' | 'iswc' | 'duration_seconds' | 'bpm' | 'key_signature' | 'language' | 'audio_file_url' | 'metadata'>>
): ExportManifest
```

### WR-07: StemsUpload swallows failures — stuck "Uploading… 0%" and silent post-upload errors

**File:** `components/vault/StemsUpload.tsx:142-166`
**Issue:** Two unhandled rejection paths: (1) `upload.findPreviousUploads().then(...)` has no `.catch` — if it rejects (localStorage/urlStorage errors), `upload.start()` never runs and the UI is stuck at "Uploading… 0%" forever with no error message. (2) In `onSuccess`, the `fetch` to the stems POST is wrapped in `try { … } finally` with no `catch` — a network failure rejects, the `finally` silently resets progress to `null`, and the user sees the upload affordance again with no error even though 200MB of bytes already landed in Storage with no metadata reference.
**Fix:** Add `.catch(err => { setStemsError(\`Upload failed: ${err.message}\`); setStemsProgress(null) })` to the `findPreviousUploads` chain, and a `catch` block before the `finally` in `onSuccess` that sets `stemsError`.

### WR-08: Owner-only UI leaks onto the public Now Playing page

**File:** `components/vault/PlaybackView.tsx:149-178` and `app/r/[projectId]/page.tsx:99-109`
**Issue:** `PlaybackView` renders the "Files" section (Master Uploaded/Missing status) and the inline readiness widget (`Readiness {score}/100 · {label} →` linking to `/vault/{projectId}`) unconditionally. The public page passes `canManage={false}` and a hardcoded `readinessScore={0}`, so anonymous visitors see a false "Readiness 0/100 · Needs work" verdict about the release and a link into the private artist app (which will 404/redirect for them). Internal readiness state is a management concern and should never render for `canManage=false` viewers.
**Fix:** Gate both blocks: `{canManage && (<div className="mt-5 border-t …">…Files…</div>)}` and `{canManage && (<div className="mt-4 border-t …">…Readiness widget…</div>)}`.

## Info

### IN-01: Unused imports, refs, and parameters

**File:** `components/vault/PlaybackView.tsx:7`, `components/vault/StemsUpload.tsx:76-77`, `lib/vault/pdf/credits-sheet.tsx:19,146`
**Issue:** `ExportPackPanel` is imported but never used in `PlaybackView`. `stemsInputRef`/`instrumentalInputRef` are created and attached but never read (the `<label>` wrapper handles activation). `readComposers` is imported but unused in `credits-sheet.tsx`; `TrackCredits` accepts an `index` prop it renames to `_index` and ignores while callers still pass it.
**Fix:** Delete the unused import, refs, and the `index` prop.

### IN-02: Stale comment contradicts the actual `audio_file_url` contract

**File:** `lib/vault/export-pack.ts:115-118`
**Issue:** Comment says "audio_file_url is a public URL; extract the storage path from it or treat it as the path directly" — it is always a storage path (see audio route: "store the storage PATH; URLs are signed on read"). The code is correct; the comment invites the exact misunderstanding that broke CR-02.
**Fix:** Replace with "audio_file_url stores the storage path; the route downloads it from the bucket directly."

### IN-03: Duplicate imports of `node:stream`

**File:** `app/api/vault/[projectId]/export/route.ts:24-25`
**Issue:** Both `import { Readable } from 'node:stream'` and `import * as stream from 'node:stream'` are present; the namespace import is used only for `stream.PassThrough`.
**Fix:** `import { Readable, PassThrough } from 'node:stream'` and drop the namespace import.

### IN-04: Stems ZIP entry extension derived from user filename can produce nonsense extensions

**File:** `lib/vault/export-pack.ts:139`
**Issue:** `stems.name.split('.').pop() ?? 'zip'` — for a stored name without a dot (server default protects the common case, but `name` is client-supplied), ext becomes the whole name, e.g. `01-song.stems.myarchive`. The uploaded object is always a ZIP (client enforces `.zip`), so the extension can simply be constant.
**Fix:** Use `'zip'` unconditionally: `files.push({ path: stems.path, filename: bundleFilename(num, title, 'stems', 'zip'), kind: 'stems' })`.

### IN-05: Export panel discards the server's error message

**File:** `components/vault/ExportPackPanel.tsx:61-64,228-231`
**Issue:** The response's `json.error` (e.g. "Could not save the export pack: The object exceeded the maximum allowed size" or "Could not read file: …") is parsed but never displayed — every failure renders the generic "Couldn't generate your export pack. Try again.", violating the project's actionable-error convention and hiding non-retryable causes.
**Fix:** Store `json.error` in state and render it in the error panel when present.

### IN-06: Failed metadata POST after a successful direct upload orphans storage bytes

**File:** `components/vault/StemsUpload.tsx:142-159,196-208`
**Issue:** If the stems/instrumental reference POST fails after the direct-to-Storage transfer succeeded, up to 250MB sits in the bucket with no metadata pointing at it. The stable per-track object path means a retry overwrites it, but abandoning the flow leaves permanent orphans invisible to the delete handlers.
**Fix:** Acceptable for v1 given stable paths; consider a cleanup note or a best-effort `storage.remove` when the POST returns non-OK.

### IN-07: Dead `exportSlot` prop and misleading effect comment in PlaybackView

**File:** `components/vault/PlaybackView.tsx:59,70-71,86-90`
**Issue:** `exportSlot` is documented as "Reserved slot for Plan 06 Export Pack panel" but Plan 06 shipped the button in the Topbar (`play/page.tsx:188-194`); no caller passes it — dead API. The effect at 87-90 is commented "Reset to master when switching tracks or when instrumental is no longer available" but only depends on `currentId`; the instrumental-removed case is actually handled by the `activeAudioUrl` fallback, not the effect.
**Fix:** Remove `exportSlot` (or wire the button through it) and correct the comment.

### IN-08: Instrumental validation defaults extension to `mp3`, letting extensionless/unknown files pass

**File:** `components/vault/StemsUpload.tsx:14-18,174-179`
**Issue:** `extFromFile` returns `'mp3'` when the filename has no dot, so a file with no extension and an empty/unknown MIME type passes `ALLOWED_INSTRUMENTAL_EXTS.includes('mp3')` and uploads with a fallback `audio/mpeg` content type regardless of its actual bytes. The bucket MIME allowlist trusts the client-declared content type, so it does not catch this.
**Fix:** Return `''` from `extFromFile` when no dot is found and let the allowlist check reject it with the existing format message.

---

_Reviewed: 2026-07-07T01:53:30Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
