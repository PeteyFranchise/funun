# Phase 9: Rich Member Profile - Pattern Map

**Mapped:** 2026-07-12
**Files analyzed:** 16 (new + modified)
**Analogs found:** 14 / 16

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `components/profile/ProfileView.tsx` (extend) | component | request-response | itself (existing) | exact — extending in place |
| `components/profile/ProfileForm.tsx` (extend, settings) | component | CRUD | itself (existing, not read this pass — settings form) | exact — extending in place |
| `components/profile/AvatarBannerUpload.tsx` (NEW) | component | file-I/O | `components/vault/CoverArtUpload.tsx` | exact |
| `components/profile/ShareButton.tsx` (NEW) | component | event-driven | `components/tools/PitchCard.tsx` (`CopyButton`) | exact (clipboard pattern); Web Share itself has no in-repo analog — new pattern per RESEARCH.md Pattern 5 |
| `components/profile/ProfileMoreMenu.tsx` (NEW) | component | event-driven | `components/collaborators/CollaboratorPicker.tsx` (dropdown/click-outside) | exact (menu shell), role differs (picker vs. static menu) |
| `components/vault/PublicPlaybackView.tsx` (NEW) | component | streaming | `components/vault/PlaybackView.tsx` | role-match, deliberately NOT forked (D-01) — reference only for transport/scrub structure |
| `components/vault/LyricsPanel.tsx` (NEW) | component | transform | `components/collaborators/CollaboratorPicker.tsx` (overlay/dismiss) + no direct slide-up-panel analog | partial — motion/dismiss pattern only |
| `app/api/profile/route.ts` (extend PATCH) | route/controller | CRUD | itself (existing) | exact — extending `sanitize()`/`EDITABLE_FIELDS` in place |
| `app/api/profile/avatar/route.ts` (NEW) | route/controller | file-I/O | `app/api/vault/[projectId]/assets/route.ts` | exact |
| `app/api/profile/banner/route.ts` (NEW, or combined w/ avatar) | route/controller | file-I/O | `app/api/vault/[projectId]/assets/route.ts` | exact |
| `app/r/[projectId]/page.tsx` (modify — swap component) | route (server component) | request-response | itself (existing) | exact — same file, swap `<PlaybackView>` for `<PublicPlaybackView>` |
| `app/u/[handle]/page.tsx` (extend — placements stat, allow_resharing read) | route (server component) | request-response | itself (existing) | exact — extending in place |
| `lib/profile/load.ts` (extend `buildProfileData`) | service/transform | CRUD | itself (existing) | exact — extending in place |
| `lib/metadata/schema.ts` (extend `TrackLyrics`) | model/schema | transform | itself (existing) | exact — additive extension only |
| `__tests__/profile-roles-validation.test.ts` (NEW) | test | unit | `__tests__/schema-stems-instrumental.test.ts` (pattern reference, not read this pass) | role-match |
| `__tests__/schema-lyrics.test.ts` (NEW) | test | unit | same as above | role-match |

## Pattern Assignments

### `components/profile/AvatarBannerUpload.tsx` (component, file-I/O)

**Analog:** `components/vault/CoverArtUpload.tsx` (full file, 97 lines — copy structure near-verbatim)

**Imports pattern** (lines 1-4):
```typescript
'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
```

**Client-side dimension read (reuse verbatim for banner crop-check if needed)** (lines 6-22):
```typescript
function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }) }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}
```

**Core upload pattern** (lines 38-64) — adapt endpoint to `/api/profile/avatar` or `/api/profile/banner`, drop the `projectId` param, keep `type` field (`'avatar' | 'banner'`) and error/uploading state exactly:
```typescript
async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  setUploading(true)
  setError(null)
  const body = new FormData()
  body.append('file', file)
  body.append('type', 'cover_art') // -> 'avatar' | 'banner' for this phase
  const dims = await readImageSize(file)
  if (dims) { body.append('width', String(dims.width)); body.append('height', String(dims.height)) }
  const res = await fetch(`/api/vault/${projectId}/assets`, { method: 'POST', body }) // -> /api/profile/avatar
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    setError(json.error ?? 'Upload failed')
    setUploading(false)
    return
  }
  setUploading(false)
  if (inputRef.current) inputRef.current.value = ''
  router.refresh()
}
```

**Hover-overlay + error text markup** (lines 66-96) — copy the button/overlay/error-text shell; UI-SPEC section 3 specifies avatar gets a camera-icon "Edit photo" overlay (160ms fade) and banner gets the existing `.edit-cover` frosted pill — build both as small variants of this one component (a `variant: 'avatar' | 'banner'` prop), not two separate files.

**Error copy:** Use UI-SPEC's exact strings, not the generic "Upload failed" fallback — `"Image must be JPG, PNG, or WebP"` / `"Image must be under 10MB"` (map from the API's 400 `error` message, or replicate the check client-side before POST for instant feedback).

---

### `app/api/profile/avatar/route.ts` + `app/api/profile/banner/route.ts` (route, file-I/O)

**Analog:** `app/api/vault/[projectId]/assets/route.ts` (full file, 119 lines)

**Bucket/constants pattern** (lines 5-24) — reuse verbatim, trim `VALID_TYPES` to just the two needed:
```typescript
const BUCKET = 'vault-assets'
const MAX_BYTES = 10 * 1024 * 1024
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
```
Per RESEARCH.md Copywriting Contract, only JPG/PNG/WebP are accepted for avatar/banner (no GIF) — narrower than the vault-assets route's list.

**Auth + ownership pattern** (lines 62-76) — for profile-level upload there's no separate project row to check; the path itself IS the ownership boundary (`${user.id}/profile/...`), so skip the `vault_projects` ownership SELECT and go straight from `auth.getUser()` to the storage upload:
```typescript
const supabase = createApiClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

**Upload + path pattern** (lines 77-87) — adapt path, no `projectId` segment:
```typescript
const path = `${user.id}/profile/${type}-${Date.now()}.${ext}` // type = 'avatar' | 'banner'
const { error: uploadError } = await supabase.storage
  .from(BUCKET)
  .upload(path, file, { contentType: file.type, upsert: false })
if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })
const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
```

**Write-back to profile column** (mirrors lines 109-116's "cover art doubles as project's display image" pattern, adapted to `artist_profiles.avatar_url`/`banner_url`):
```typescript
await supabase
  .from('artist_profiles')
  .update({ [type === 'avatar' ? 'avatar_url' : 'banner_url']: publicUrl })
  .eq('id', user.id)
return NextResponse.json({ data: { url: publicUrl } })
```
No rollback-on-orphan needed here (no separate `vault_assets` insert step) — if the profile-column update fails, still return the uploaded URL and let the client retry the PATCH, or fold this into a single `PATCH /api/profile` call with `avatar_url`/`banner_url` in the allowlist instead of a bespoke DB write (simpler, matches "extend EDITABLE_FIELDS" from RESEARCH.md).

---

### `app/api/profile/route.ts` (extend PATCH, CRUD)

**Analog:** itself (existing file, full 128 lines read)

**Existing allowlist + sanitize skeleton** (lines 8-96) — add new branches following the exact same shape as `industry_roles`/`genres` (simple array-filter) and `mailing_address` (object passthrough):
```typescript
const EDITABLE_FIELDS = [
  // ...existing 22 fields...
  'pronouns', 'roles', 'open_to', 'avatar_url', 'banner_url',
  'featured_project_id', 'allow_resharing',
] as const
```

**Array-filter pattern to copy for `open_to`** (lines 74-80, `industry_roles` branch):
```typescript
if (key === 'industry_roles') {
  if (Array.isArray(value)) {
    update[key] = (value as unknown[])
      .filter((s): s is string => typeof s === 'string' && ALL_INDUSTRY_ROLE_SLUGS.includes(s))
  }
  continue
}
```
Apply identically for `open_to`, filtering against `OPEN_TO_VALUES`.

**New Zod validator needed for `roles`** (discriminated union, no existing analog in this file — see RESEARCH.md's Code Examples section for the exact `ProfileRoleSchema` shape to add) and a new pre-check branch for `featured_project_id` (ownership + `is_public` check before the DB trigger fires — see RESEARCH.md Pitfall 4 code example, `service.from('vault_projects').select('id, is_public').eq('id', value).eq('user_id', user.id).maybeSingle()`).

**Service-client write-back note** (lines 111-124) — this route already uses `createServiceClient()` for the actual `.update()` to bypass RLS column grants; keep that pattern for all new fields, no change needed to the PATCH handler's outer shape.

---

### `components/profile/ShareButton.tsx` (component, event-driven)

**Analog:** `components/tools/PitchCard.tsx`'s `CopyButton` (lines 8-22) for the clipboard-and-label-swap half; Web Share itself is a new pattern (no in-repo analog) — use RESEARCH.md's Pattern 5 code block verbatim.

**Clipboard + label-swap pattern to reuse exactly** (lines 8-22):
```typescript
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="..."
    >
      {copied ? 'Copied' : label}
    </button>
  )
}
```

**New Web-Share-first pattern** (from RESEARCH.md, no repo precedent — must call `.share()` as the first synchronous statement in the click handler, no leading `await`):
```typescript
async function share(url: string, caption: string) {
  if (navigator.share) {
    try { await navigator.share({ title: caption, url }); return }
    catch (err) { if ((err as DOMException)?.name === 'AbortError') return }
  }
  await navigator.clipboard.writeText(`${caption} → ${url}`)
  setCopied(true)
  setTimeout(() => setCopied(false), 1500)
}
```

**Wiring target:** `components/profile/ProfileView.tsx` line 214-216 — the existing dead stub:
```tsx
<button className="inline-flex items-center gap-[9px] rounded-[11px] border border-hairstrong bg-card px-[22px] py-[13px] text-[15px] font-bold text-white">
  Share
</button>
```
Replace with `<ShareButton url={...} caption={...} />` reusing this exact className, per UI-SPEC section 5 ("wire `onClick` only, no restyle").

---

### `components/profile/ProfileMoreMenu.tsx` (component, event-driven)

**Analog:** `components/collaborators/CollaboratorPicker.tsx` — click-outside dropdown shell (lines 3, 31, 45-56, 96-120)

**Imports + refs pattern** (lines 3, 31):
```typescript
'use client'
import { useEffect, useRef, useState } from 'react'
// ...
const containerRef = useRef<HTMLDivElement>(null)
```

**Click-outside-to-close pattern** (lines 45-56) — reuse verbatim, this is also the exact pattern cited in RESEARCH.md Pattern 4:
```typescript
useEffect(() => {
  function handleOutside(e: MouseEvent) {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setOpen(false)
    }
  }
  if (open) document.addEventListener('mousedown', handleOutside)
  return () => document.removeEventListener('mousedown', handleOutside)
}, [open])
```

**Trigger + panel shell** (lines 96-120) — simplify: no search input, no grouped list, just a static list of menu items (per UI-SPEC section 9, Phase 9 ships exactly one item: "Copy profile link"). Reuse the panel's positioning/shadow classes (`absolute ... rounded-xl border border-hairstrong bg-card shadow-xl`) but drop the `role="listbox"` / search / grouped-sections machinery — that's CollaboratorPicker-specific complexity this menu doesn't need.

**Same shell reused for the public player's overflow (⋯) menu** (`components/vault/PublicPlaybackView.tsx`'s internal menu, item 8 in UI-SPEC) — build one shared `<DropdownMenu>` internal pattern (or literally duplicate this small click-outside hook) rather than importing `CollaboratorPicker` directly, since that component carries roster-fetching logic irrelevant here.

---

### `components/vault/PublicPlaybackView.tsx` (component, streaming) — NEW, sibling, not a fork

**Analog:** `components/vault/PlaybackView.tsx` (full file, 403 lines) — reference for transport/scrub/state-management shape only. **Do not import or extend this component** (D-01, Anti-Pattern explicitly called out in RESEARCH.md).

**State/audio-ref pattern worth copying (lines 77-117):**
```typescript
const [currentId, setCurrentId] = useState(tracks[0]?.id ?? '')
const [playing, setPlaying] = useState(false)
const [position, setPosition] = useState(0)
const audioRef = useRef<HTMLAudioElement>(null)

useEffect(() => {
  const el = audioRef.current
  if (!el) return
  if (playing) el.play().catch(() => setPlaying(false))
  else el.pause()
}, [playing, currentId])

function seekToFraction(f: number) {
  const el = audioRef.current
  const d = duration || el?.duration || 0
  const t = f * d
  setPosition(t)
  if (el) el.currentTime = t
}
```

**Transport button markup (play/pause/prev/next icons)** (lines 262-302) — copy the inline-SVG icon markup verbatim (shuffle/prev/play/next/repeat), just restyle sizing per UI-SPEC's 78px play circle / 42px gaps (portrait layout, not the 3-column layout).

**Hidden `<audio>` element pattern** (lines 394-400) — reuse exactly:
```tsx
<audio
  ref={audioRef}
  src={activeAudioUrl ?? undefined}
  onTimeUpdate={e => setPosition(e.currentTarget.currentTime)}
  onEnded={() => setPlaying(false)}
/>
```

**Explicitly do NOT copy:** Master/Instrumental toggle (lines 202-215), Files/StemsUpload section (lines 151-186), waveform bars implementation (lines 40-50, 233-256 — UI-SPEC calls for a simple scrub bar, not a waveform), credits-with-split-percentage block (lines 311-342 — public credits must omit `%`, see D-11), Metadata dl (lines 344-360 — ISRC/ISWC/BPM table excluded entirely per D-01).

**Data-loading pattern to keep unchanged** — from `app/r/[projectId]/page.tsx` (see below), `toTrackViews()` and the `is_public` + signed-URL gate are untouched; only the rendered component changes.

---

### `app/r/[projectId]/page.tsx` (route, modify only the render call)

**Analog:** itself (existing file, full 131 lines read)

**Everything above the return statement is UNCHANGED** (lines 1-103) — `is_public` gate (line 76), signed-URL minting (lines 92-100), `toTrackViews()` (lines 25-50, extend to strip `splitTotal`/keep credits names+roles only per D-11, and add `lyrics` via `readLyrics()`).

**Only this render call changes** (lines 118-128):
```tsx
// BEFORE:
<PlaybackView
  releaseTitle={project.title}
  artist={artist}
  coverUrl={project.cover_art_url}
  tracks={tracks}
  projectId={projectId}
  userId=""
  canManage={false}
  readinessScore={0}
  miniLeft="0px"
/>
// AFTER:
<PublicPlaybackView
  releaseTitle={project.title}
  artist={artist}
  coverUrl={project.cover_art_url}
  tracks={tracks}
  projectId={projectId}
  allowResharing={/* read from artist_profiles.allow_resharing, D-07 */}
/>
```

**`toTrackViews()` credits pattern to reuse, strip split** (lines 29-30, 46):
```typescript
const composers = readComposers(t.metadata)
// existing: credits: composers.map(c => ({ name: c.name, role: COMPOSER_ROLE_LABELS[c.role], split: c.split }))
// new (D-11): credits: composers.map(c => ({ name: c.name, role: COMPOSER_ROLE_LABELS[c.role] })) // no split field at all
```

---

### `lib/profile/load.ts` (extend `buildProfileData`)

**Analog:** itself (existing file, full 128 lines read)

**Existing derive-and-return shape** (lines 87-128) — add `placementsCount` and `allowResharing` as new inputs (like `followerCount` is already threaded through as an options-bag param) and new output fields on `ProfileData`:
```typescript
export function buildProfileData(
  profile: ArtistProfile,
  projects: ProfileProjectRow[],
  { publicOnly, followerCount = null, placementsCount = null }: { publicOnly: boolean; followerCount?: number | null; placementsCount?: number | null }
): ProfileData {
  // ...existing body unchanged...
  return {
    // ...existing fields...
    placementsCount, // NEW
  }
}
```
`allow_resharing` doesn't need to flow through `buildProfileData` — it's a server-side visibility gate consumed directly in `app/u/[handle]/page.tsx` / `app/r/[projectId]/page.tsx` before rendering the Share button, not part of the display-data projection.

**Placements stat query pattern** — add alongside the existing `followers` COUNT query in `app/u/[handle]/page.tsx`'s `Promise.all` (lines 122-130):
```typescript
supabase
  .from('activity_events')
  .select('*', { count: 'exact', head: true })
  .eq('profile_id', profile.id)
  .eq('kind', 'placement'),
```

---

### `lib/metadata/schema.ts` (extend `TrackLyrics`, additive)

**Analog:** itself (existing file, lines 76-85 for current shape, lines 237-260 for `readLyrics()`/`sanitizeLyrics()` read/write pattern — not fully read this pass, but signature confirmed via grep)

**Current shape** (lines 78-83):
```typescript
export type TrackLyrics = {
  text: string
  language?: string
  explicit?: boolean
  updated_at?: string
}
```

**Additive extension (D-13)** — append optional `synced` field, do not touch existing fields or `readLyrics()`'s defensive-parse logic (it already tolerates unknown/absent optional keys):
```typescript
export type TrackLyrics = {
  text: string
  language?: string
  explicit?: boolean
  updated_at?: string
  synced?: {
    lines: { atMs: number; text: string }[]
    method: 'manual' | 'forced_alignment'
    updated_at: string
  }
}
```
No migration required — `lyrics` lives in `tracks.metadata` JSONB (confirmed via `TrackMetadata` type, line 129).

---

## Shared Patterns

### Click-outside dropdown (used by `ProfileMoreMenu.tsx` AND the public player's overflow `⋯` menu)
**Source:** `components/collaborators/CollaboratorPicker.tsx` lines 45-56
**Apply to:** Both new menu components in this phase (items 8 and 9 in UI-SPEC)
```typescript
useEffect(() => {
  function handleOutside(e: MouseEvent) {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
  }
  if (open) document.addEventListener('mousedown', handleOutside)
  return () => document.removeEventListener('mousedown', handleOutside)
}, [open])
```

### Clipboard-copy + label-swap confirmation (no toast library)
**Source:** `components/tools/PitchCard.tsx` lines 8-22 (`CopyButton`)
**Apply to:** `ShareButton.tsx`'s fallback path, and the overflow menu's "Copy link" item (D-14)
```typescript
await navigator.clipboard.writeText(text)
setCopied(true)
setTimeout(() => setCopied(false), 1500)
```

### Image upload via multipart FormData to a scoped route
**Source:** `app/api/vault/[projectId]/assets/route.ts` (full file) + `components/vault/CoverArtUpload.tsx` (full file)
**Apply to:** `AvatarBannerUpload.tsx` + new `app/api/profile/avatar|banner/route.ts`
```typescript
const BUCKET = 'vault-assets' // NOT 'release-assets' — see RESEARCH.md Pitfall 1
const path = `${user.id}/profile/${type}-${Date.now()}.${ext}` // profile-level, no projectId segment
```

### PATCH allowlist + sanitize() array/object branch pattern
**Source:** `app/api/profile/route.ts` lines 36-96
**Apply to:** New `roles`, `open_to`, `featured_project_id`, `allow_resharing` branches in the same `sanitize()` function
```typescript
if (key === 'open_to' && Array.isArray(value)) {
  update[key] = (value as unknown[]).filter(
    (s): s is string => typeof s === 'string' && OPEN_TO_VALUES.includes(s as OpenTo)
  )
  continue
}
```

### Server-minted signed URL for private Storage bucket
**Source:** `app/r/[projectId]/page.tsx` lines 92-100 (unchanged by this phase)
**Apply to:** No change needed — `PublicPlaybackView.tsx` consumes the same `TrackView.audioUrl` the page already produces.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `components/vault/LyricsPanel.tsx` | component | transform (overlay) | No slide-up/bottom-sheet component exists anywhere in the codebase yet — nearest conceptual neighbor (`CollaboratorPicker`'s dropdown-with-outside-dismiss) only covers the dismiss-on-outside-click half, not the drag-handle/slide animation half. Build fresh per UI-SPEC section 7's pixel spec (motion tokens from `app.css`, 160-480ms budget); no existing bottom-sheet pattern to copy. |
| Web Share API invocation itself (`navigator.share(...)`) | — | event-driven | Zero call sites in the codebase today (confirmed via RESEARCH.md's exhaustive search) — this is genuinely new browser-API usage, not a codebase pattern. Use RESEARCH.md's Pattern 5 code block as the canonical source instead of a repo analog. |

## Metadata

**Analog search scope:** `components/profile/`, `components/vault/`, `components/tools/`, `components/collaborators/`, `app/api/profile/`, `app/api/vault/[projectId]/assets/`, `app/r/[projectId]/`, `app/u/[handle]/`, `lib/profile/`, `lib/metadata/`
**Files scanned:** 12 read in full (ProfileView.tsx, CoverArtUpload.tsx, assets/route.ts, profile/route.ts, PitchCard.tsx, CollaboratorPicker.tsx, PlaybackView.tsx, r/[projectId]/page.tsx, profile/load.ts, FollowButton.tsx, u/[handle]/page.tsx, metadata/schema.ts partial)
**Pattern extraction date:** 2026-07-12
