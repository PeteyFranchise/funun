# Phase 14: Playback Room Refinement - Pattern Map

**Mapped:** 2026-07-06
**Files analyzed:** 10
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `components/vault/VaultProjectCard.tsx` (modify, D-01) | component | request-response (Link routing) | itself (line 70) | exact — trivial one-line edit |
| `components/vault/ProjectTabs.tsx` (modify, D-01) | component | request-response | itself | exact — add a link/tab pointing at `/play` |
| `app/(artist)/vault/[projectId]/play/page.tsx` (modify, D-01/D-02) | route (server component) | request-response, CRUD read | `app/(artist)/vault/[projectId]/metadata/onesheet/page.tsx` | exact — server component fetching project+tracks with owner-scoped query, DEMO branch |
| `components/vault/PlaybackView.tsx` (modify, D-02/D-04/D-05/D-06/D-08/D-09) | component | streaming (audio), event-driven (toggle/upload) | itself + `components/vault/TrackList.tsx` (upload/AudioSlot pattern) | exact for structure; role-match for upload UI |
| `components/vault/StemsUpload.tsx` (new, D-05/D-09) | component | file-I/O (direct-to-storage upload) | `components/vault/TrackList.tsx` `AudioSlot`/`upload()` | role-match — no existing direct-to-storage upload precedent in codebase, but upload UI shape is a strong analog |
| `app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts` (new, D-05/D-07) | route (API, JSON-only PATCH) | CRUD (metadata only, no file bytes) | `app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts` | role-match — same owner-check + `metadata.*` JSONB sub-object pattern, but this route skips file bytes entirely (client already uploaded directly to Storage) |
| `app/api/vault/[projectId]/tracks/[trackId]/instrumental/route.ts` (new, D-05) | route (API, JSON-only PATCH) | CRUD (metadata only) | `app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts` (sibling new file) + `.../audio/route.ts` | role-match — identical shape to the new stems route, different metadata key |
| `app/api/vault/[projectId]/export/route.ts` (new, D-10/D-11/D-12) | route (API), Node runtime | batch (ZIP+PDF assembly), request-response (signed URL response) | `app/api/vault/[projectId]/tracks/[trackId]/metadata/embed/route.ts` | role-match — same owner-check → service-client download → transform → re-upload → `createSignedUrl` shape, but multi-file/multi-stream instead of one ID3 tag write |
| `lib/vault/export-pack.ts` (new, D-10) | service/utility | transform (manifest assembly) | `lib/metadata/bundle.ts` (`buildBundle`) | role-match — same "gather project+tracks+composers into one typed bundle object" shape |
| `lib/vault/pdf/credits-sheet.tsx`, `lib/vault/pdf/metadata-sheet.tsx` (new, D-10) | utility (PDF template) | transform (data → document) | `app/(artist)/vault/[projectId]/metadata/onesheet/page.tsx` (JSX layout of the same data) + `lib/metadata/schema.ts` `readComposers()` (data source) | role-match — same fields (ISRC/ISWC/BPM/key/language, credits/splits), different render target (`@react-pdf/renderer` `<Document>` instead of HTML/print) |

## Pattern Assignments

### `app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts` (API route, CRUD/metadata-only)

**Analog:** `app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts`

**Imports pattern** (lines 1-2):
```typescript
import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
```
Note: the new stems/instrumental routes only need `createApiClient` (no `createServiceClient`/no Storage byte handling) since the client already wrote bytes directly to Supabase Storage per RESEARCH.md Pattern 1 — this route only persists `{ path, size, name }` into `tracks.metadata`.

**Auth + ownership pattern** (lines 54-68):
```typescript
const supabase = createApiClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

const { data: track } = await supabase
  .from('tracks')
  .select('id, audio_file_url, metadata')
  .eq('id', trackId)
  .eq('project_id', projectId)
  .eq('user_id', user.id)
  .maybeSingle()
if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })
```

**Core metadata-PATCH pattern** (lines 71, 93-95) — copy this shape exactly, substituting `stems`/`instrumental` for `master`:
```typescript
const metadata = (track.metadata as Record<string, unknown> | null) ?? {}
// ...
update = { metadata: { ...metadata, stems: { path, size: file.size, name: file.name } } }
```
Then the same `.from('tracks').update(update).eq('id', trackId).eq('user_id', user.id).select().single()` write at lines 108-118, with the identical `updateError` rollback-on-failure branch pattern (here: no storage.remove rollback needed since bytes were already client-uploaded before this call — a failed metadata PATCH just leaves an orphaned Storage object, which is an acceptable v1 tradeoff per RESEARCH.md's scope).

**Demo-mode guard** (lines 34-36) — reuse verbatim:
```typescript
const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
if (DEMO) {
  return NextResponse.json({ error: 'Audio upload is not available in demo mode' }, { status: 400 })
}
```

**DELETE handler pattern** (lines 125-174) — same shape for removing a stems/instrumental entry: fetch track, `service.storage.from(BUCKET).remove([path])`, then `delete nextMeta.stems` / `delete nextMeta.instrumental` and update.

**Validation note (D-07):** this route does NOT re-validate file size/MIME server-side beyond trusting the client-reported `size`/`name` in the JSON body — the *authoritative* enforcement is the Storage bucket's own `file_size_limit` (250MB) and `allowed_mime_types` (`application/zip`, `application/x-zip-compressed`), set via migration per RESEARCH.md Pitfall 4. Mirror the existing `EXT_BY_MIME` allowlist idea (lines 8-18) as a client-side UX check only in `StemsUpload.tsx`, not as the server gate.

---

### `app/api/vault/[projectId]/export/route.ts` (API route, batch assembly + signed URL)

**Analog:** `app/api/vault/[projectId]/tracks/[trackId]/metadata/embed/route.ts`

**Runtime + duration declaration** (lines 9-10) — copy verbatim, adjusted for the confirmed Hobby-tier ceiling:
```typescript
export const runtime = 'nodejs'
export const maxDuration = 10 // Hobby tier hard ceiling — cannot be raised; see RESEARCH.md Pitfall 3
```

**Auth + ownership + row fetch pattern** (lines 38-64) — same `createApiClient()` → `auth.getUser()` → owner-scoped `.eq('user_id', user.id)` select on both `vault_projects` and `tracks`, `maybeSingle()`, 401/404 early returns. Copy this exact shape for the export route's project+tracks fetch.

**Service-client Storage download pattern** (lines 84-95):
```typescript
const service = createServiceClient()
const { data: blob, error: dlError } = await service.storage.from(BUCKET).download(audioPath)
if (dlError || !blob) {
  return NextResponse.json({ error: 'Could not read the audio file.' }, { status: 502 })
}
```
Reuse this per-file (master, share, stems, instrumental) inside the `archiver` loop from RESEARCH.md Pattern 2 — one `service.storage.from(BUCKET).download(file.path)` call per bundle member, each error-checked the same way before `archive.append()`.

**Re-upload + signed URL pattern** (lines 134-145) — direct precedent for the whole Export Pack delivery step; extend the TTL per D-12 (7 days for share, 5 min for direct download) rather than the existing 2-hour constant:
```typescript
const taggedPath = audioPath.replace(/(\.[^.]+)$/, '') + '.tagged.mp3'
const { error: upError } = await service.storage
  .from(BUCKET)
  .upload(taggedPath, tagged, { contentType: 'audio/mpeg', upsert: true })
if (upError) {
  return NextResponse.json({ error: 'Could not save the tagged file.' }, { status: 502 })
}

const { data: signed } = await service.storage
  .from(BUCKET)
  .createSignedUrl(taggedPath, 60 * 60 * 2)
```
For Export Pack: `createSignedUrl(packPath, mode === 'download' ? 60 * 5 : 60 * 60 * 24 * 7)` per RESEARCH.md Pattern 3.

**Response shape pattern** (lines 147-153) — copy the `{ data: { ...} }` envelope convention:
```typescript
return NextResponse.json({
  data: {
    url: signed?.signedUrl ?? null,
    path: taggedPath,
    fields: f,
  },
})
```

---

### `lib/vault/export-pack.ts` (utility, manifest/bundle assembly)

**Analog:** `lib/metadata/bundle.ts` (`buildBundle`) — read via Grep/knowledge; same project+track row → typed bundle transform used already by both the embed route and the onesheet page. Follow its signature shape: `buildBundle(projectRow, trackRows, artistName)` returning a single typed object consumed by multiple downstream renderers (ID3 tags, onesheet JSX, and now PDF templates + the ZIP manifest). New `buildExportManifest()`-style function should follow the same "pure transform, no I/O" convention — I/O (Storage downloads, PDF rendering, archiver piping) stays in the route handler, not in this lib file, matching CLAUDE.md's "Pure functions preferred in lib/" convention.

---

### `lib/vault/pdf/credits-sheet.tsx` / `metadata-sheet.tsx` (new, PDF templates)

**Analog:** `app/(artist)/vault/[projectId]/metadata/onesheet/page.tsx` (data shape/fields) + `lib/metadata/schema.ts` `readComposers()` (data source)

**Data-read pattern to reuse** (schema.ts lines 188-208):
```typescript
export function readComposers(metadata: Record<string, unknown> | null | undefined): Composer[] {
  const raw = metadata?.composers
  if (!Array.isArray(raw)) return []
  return raw.map(r => {
    const o = (r ?? {}) as Record<string, unknown>
    // ...normalize role/pro/split with fallbacks...
  })
}
```
This is the exact function the credits-sheet PDF needs for its composer/split rows — call it directly, do not re-derive composer data.

**Field list precedent** (onesheet/page.tsx `PROJECT_COLS`/`TRACK_COLS`, lines 11-14): the metadata-sheet PDF's field set (ISRC/ISWC/BPM/key/language per D-10) matches these exact columns already selected elsewhere — reuse the same column list rather than inventing a new query shape.

**Note on render target:** onesheet's approach is "Print → Save as PDF" (client, browser-rendered HTML) — the new files must NOT copy that mechanism; they render actual PDF *files* server-side via `@react-pdf/renderer`'s `<Document>/<Page>/<View>/<Text>` component model per RESEARCH.md's explicit recommendation. Copy the *data shape and field selection*, not the rendering technique.

---

### `components/vault/StemsUpload.tsx` (new component, direct-to-storage upload)

**Analog:** `components/vault/TrackList.tsx` (`AudioSlot` function, lines 60-96, and `upload()`, lines 144-168)

**UI slot pattern to copy** (lines 60-96) — same visual/interaction shape (label, present/uploading states, hidden file input):
```typescript
function AudioSlot({
  label, present, uploading, accept, onPick,
}: {
  label: string; present: boolean; uploading: boolean; accept: string; onPick: (file: File) => void
}) {
  return (
    <label
      title={present ? `Replace ${label}` : `Upload ${label}`}
      className={`cursor-pointer rounded-md border px-2 py-1 text-xs transition ${
        present ? 'border-emerald-500/40 text-emerald-300 hover:border-emerald-400'
                : 'border-white/10 text-white/60 hover:border-white/30 hover:text-white'
      } ${uploading ? 'opacity-50' : ''}`}
    >
      {uploading ? '…' : present ? `${label} ✓` : `+ ${label}`}
      <input type="file" accept={accept} className="hidden" disabled={uploading}
        onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }} />
    </label>
  )
}
```
Per D-08, this component must be conditionally rendered/hidden entirely when absent (no disabled state) — TrackList's `present`/`hasAudio` boolean-gated rendering (e.g. `t.masterUrl && (<a .../>)` at line 259) is the direct precedent for "hide the affordance entirely," already used in this exact file.

**Upload orchestration to diverge from (NOT copy the `fetch(...): FormData` body)** — `upload()` (lines 144-168) proxies bytes through the Next.js route via `FormData`; this is explicitly the anti-pattern RESEARCH.md's Pitfall 1 forbids for the 250MB stems file. Instead follow RESEARCH.md Pattern 1 (`tus-js-client` direct-to-Supabase-Storage), then call the new JSON-only `/stems` or `/instrumental` route exactly the way `upload()` calls `/audio` today (same `setUploadingKey`/`setError`/`router.refresh()` state-management shape, lines 144-168) — just swap the byte-transfer mechanism, keep the surrounding React state pattern identical.

**Supabase browser client precedent** (`lib/supabase/client.ts`, 2 lines):
```typescript
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
export const createClient = () => createClientComponentClient()
```
Reuse this exact factory for the browser-side authenticated client that RESEARCH.md Pattern 1 uses to get the session token for the direct TUS upload — do not introduce a second client-creation pattern.

---

### `components/vault/PlaybackView.tsx` (modify — toggle fix, uploads, readiness widget)

**Analog:** itself (existing 325-line component)

**Toggle to fix** (lines 59, 146-156) — current non-functional 3-way toggle:
```typescript
const [source, setSource] = useState<'master' | 'stems'>('master')
// ...
{(['master', 'stems'] as const).map(s => (
  <button key={s} onClick={() => setSource(s)} ...>{s}</button>
))}
```
Per D-06, change to `'master' | 'instrumental'`, and per D-08 only render the toggle at all when `current.instrumentalUrl` is present (else show Master only, no toggle). Wire `<audio src={...}>` (line 319, currently unconditionally `current.audioUrl`) to actually branch on `source`.

**Empty-state precedent already in this file** (lines 228-230) — the exact "hide/replace when missing" pattern to extend to stems/instrumental:
```typescript
{!current.audioUrl && (
  <p className="mt-3 text-[12.5px] text-lavdim">No master uploaded for this track yet.</p>
)}
```

**Files column stems line to replace** (lines 124-127) — currently hardcoded placeholder text, replace with real `hasStems`-gated "Download stems" button/link (D-04) plus the new StemsUpload affordance:
```typescript
<div className="mt-2 flex items-center justify-between text-[13px]">
  <span className="text-lav">Stems</span>
  <span className="text-lavdim">Not added</span>
</div>
```

---

## Shared Patterns

### Owner-only ownership gate
**Source:** `app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts` lines 61-68, `.../metadata/embed/route.ts` lines 44-59, `app/(artist)/vault/[projectId]/metadata/onesheet/page.tsx` lines 51-56
**Apply to:** all three new/modified API routes (stems, instrumental, export) and the modified `/play` page
```typescript
const { data: row } = await supabase
  .from('<table>')
  .select('<cols>')
  .eq('id', id)
  .eq('user_id', user?.id ?? '') // or user.id when already null-checked
  .maybeSingle()
if (!row) return NextResponse.json({ error: '<Thing> not found' }, { status: 404 })
```

### DEMO-mode guard
**Source:** `app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts` lines 4, 34-36; `.../metadata/embed/route.ts` lines 12, 31-36
**Apply to:** stems route, instrumental route, export route (all mutate/generate real files — none should run in demo mode)
```typescript
const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
if (DEMO) {
  return NextResponse.json({ error: '<Feature> is not available in demo mode' }, { status: 400 })
}
```

### `metadata` JSONB sub-object extension (no migration)
**Source:** `app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts` lines 71-72, 93-95
**Apply to:** stems route, instrumental route — same shape, new keys
```typescript
const metadata = (track.metadata as Record<string, unknown> | null) ?? {}
update = { metadata: { ...metadata, stems: { path, size, name } } }
// and, separately: { ...metadata, instrumental: { path, size, ext } }
```

### Service-client Storage download → transform → re-upload → signed URL
**Source:** `app/api/vault/[projectId]/tracks/[trackId]/metadata/embed/route.ts` lines 84-145
**Apply to:** the export-pack route's archiver/PDF assembly + delivery step (RESEARCH.md Patterns 2 & 3 are the extended/generalized version of this exact existing sequence)

### Error response envelope
**Source:** used identically across all API routes inspected (`audio/route.ts`, `metadata/embed/route.ts`)
**Apply to:** all new routes
```typescript
return NextResponse.json({ error: '<message>' }, { status: <code> })
// success:
return NextResponse.json({ data: <payload> })
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Direct-to-Supabase-Storage upload via `tus-js-client` (browser-side transfer logic itself, inside `StemsUpload.tsx`) | client upload logic | file-I/O | No existing file in the codebase performs a direct browser→Storage upload — every existing upload proxies through a Route Handler's `FormData` body (`TrackList.tsx` → `/audio` route). RESEARCH.md Pattern 1 is the only available template; treat it as authoritative in place of a codebase analog. |
| ZIP archive assembly (`archiver` usage inside the export route) | transform/batch | event-driven/streaming | No prior ZIP-bundling code exists anywhere in this codebase. Use RESEARCH.md Pattern 2 verbatim as the template. |
| PDF generation via `@react-pdf/renderer` | utility (render) | transform | No prior server-rendered PDF exists (only the onesheet's browser "Print to PDF" pattern, which is explicitly not reusable as a technique — see credits-sheet/metadata-sheet notes above). Use RESEARCH.md's package docs/Code Examples as the template. |

## Metadata

**Analog search scope:** `app/api/vault/`, `components/vault/`, `lib/vault/`, `lib/metadata/`, `app/(artist)/vault/`
**Files scanned:** 10 read in full (audio route, TrackList, PlaybackView, VaultProjectCard, ProjectTabs, readiness.ts, metadata/embed route, onesheet page, lib/supabase/client.ts, schema.ts excerpt)
**Pattern extraction date:** 2026-07-06
