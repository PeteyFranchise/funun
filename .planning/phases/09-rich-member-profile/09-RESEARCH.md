# Phase 9: Rich Member Profile - Research

**Researched:** 2026-07-12
**Domain:** Next.js 15 App Router server components + Supabase (schema, storage, RLS) for a public profile page and a public-only music player, plus Web Share API integration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Player Split — Public vs. Private**
- **D-01:** Build a genuinely separate, clean, public-only "now playing" component for `/r/[projectId]` that matches `artist-profile.html`'s design — stream-only, no file-status, no Master/Stems toggle, no raw ISRC/ISWC/BPM metadata table, no split percentages. The existing full-detail `PlaybackView` component continues to serve the owner's private room (`/vault/[projectId]/play`) unchanged.
- **D-02:** Keep the existing `/r/[projectId]` URL — do NOT introduce a new route. Only the component rendered at that URL changes.
- **D-03:** "Playlist" means an existing multi-track release (a `vault_projects` row with its `tracks` array), not a new cross-project playlist concept. No new data model needed.

**Share Action (PROFILE-08)**
- **D-04:** Two share entry points: a per-track share (overflow `⋯` menu on the public player) and a whole-profile share (existing dead "Share" button stub in `ProfileView.tsx`, owner view). One shared mechanism/toggle covers both.
- **D-05:** Share mechanism: native Web Share API where supported (opens OS share sheet), with clipboard copy as the fallback on desktop browsers without support. Confirm success with a brief toast/confirmation on the fallback path.
- **D-06:** Shared link includes a short pre-filled caption, track-focused only — e.g. `"Listen to 'Paper' by Maya Reyes on Funūn → [link]"`.
- **D-07:** Visitors can reshare a track/profile they're viewing (organic reach), gated by an artist-controlled global toggle ("allow others to share my music"), scoped to already-public (`is_public`) releases only. When off, the Share affordance simply isn't shown to visitors (no disabled state, no message). Royalty/payout implications of visitor resharing are explicitly deferred.

**Lyrics & Credits (new to the public player)**
- **D-08:** Lyrics surface via a slide-up panel over the player (Spotify/Apple Music style) — player keeps running underneath; dismiss returns to full player view.
- **D-09:** If a track has no lyrics entered, hide the lyrics affordance entirely — no disabled/grayed button.
- **D-10:** Credits accessible any time via the overflow `⋯` menu (not auto-surfaced at song end).
- **D-11:** Public credits show names + roles only — NO split percentages. Linking a collaborator's name to their own `/u/[handle]` profile is deferred.
- **D-12:** Existing data is sufficient for names/roles/lyrics-text — `readComposers()` and `readLyrics()` already provide what's needed. No new migration required for the D-08–D-11 baseline.
- **D-13:** Add the timestamped-lyrics data shape in this phase (forward-compatible, additive) so it's ready, but ship the player with static lyrics display for now. The timing-entry method (manual vs. forced-alignment) is an explicit open fast-follow decision, NOT resolved here.
- **D-14:** Overflow (`⋯`) menu contents: View credits + View lyrics + Copy link.

### Claude's Discretion
- Exact visual layout/animation of the lyrics slide-up panel (D-08) — follow `app.css` motion tokens (160–480ms ease-out, no bounce; respect `prefers-reduced-motion`).
- Exact shape of the new timestamped-lyrics schema (D-13) — build forward-compatible with both manual and automated (forced-alignment) population.
- Toast notification component/pattern for share-link-copied confirmation (D-05) — reuse an existing pattern if one exists, otherwise a minimal implementation.

### Deferred Ideas (OUT OF SCOPE)
- **Export Pack** (`playback.html`'s "Export pack" button) — Sound Vault/playback-room feature area, not Phase 9.
- **Private playback room enhancements** (`/vault/[projectId]/play`, `playback.html`'s full domain) — explicitly out of Phase 9 scope.
- **Royalty/payout implications of visitor resharing** — not designed or addressed; the D-07 toggle exists partly to defer this.
- **Collaborator cross-discovery** — linking a credited collaborator's name to their own profile (D-11).
- **Lyric sync highlighting** (karaoke-style) and its timing-entry method — data shape added now (D-13), feature itself deferred.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROFILE-01 | Rich profile header — banner, avatar with online presence dot, name, pronouns, verified badge, multi-role badges with lead role highlighted | Header/banner/avatar/name/verified/roles already rendered in `ProfileView.tsx` (see "Existing Profile Infrastructure"). Presence dot and pronouns-edit are new. "Lead role" = array-order convention, already implemented via `roles[0]` styling — confirm as the locked convention, no schema change. |
| PROFILE-02 | Custom title alongside standard industry roles | `ProfileRole` type (`{kind:'preset', slug}` \| `{kind:'custom', label}`) and `roles: ProfileRole[]` column already exist and already render correctly in `ProfileView.tsx`. Gap is edit UI + API allowlist (settings page has zero UI for this field today). |
| PROFILE-03 | Location + tenure ("On Funūn since [year]") | Both already implemented and rendering (`location` column already editable via `/api/profile`; `since` derived from `created_at` in `buildProfileData()`). No gap. |
| PROFILE-04 | "Open to" availability chips | `open_to: OpenTo[]` column + `OPEN_TO_LABELS` already exist and already render (header pill + sidebar "Open to" card). Gap is edit UI + API allowlist. |
| PROFILE-05 | Pin one release as "Featured" spotlight | `artist_profiles.featured_project_id` column + integrity triggers already exist (migration 034) and `ProfileView.tsx` already renders the Featured section. Gap is a picker UI (owner-only) + API allowlist entry with friendly validation. |
| PROFILE-06 | Stats sidebar: followers, monthly listeners, placements, avg. readiness | Followers (`follows` COUNT), monthly listeners (self-reported column), avg. readiness (computed client-side) all already wired. **"Placements" is the one true gap** — no aggregate query exists; `activity_events.kind='placement'` COUNT is the correct source, consistent with the notifications' "compute unread via COUNT, never a cached counter" convention. |
| PROFILE-07 | Releases grid with readiness rings | Already fully implemented in `ReleaseCard` (conic-gradient ring + score). No gap. |
| PROFILE-08 | Owner sees Edit profile/Share/View analytics; visitor sees Follow/Message/more-options | Edit profile (live), Follow (live, `follows` table + `FollowButton.tsx`), Message (live, `DmWidget.tsx`) all already wired. Share is a dead stub (`<button>` no `onClick`) — real gap, see D-04–D-07. "View analytics" is explicitly out of v1 scope (REQUIREMENTS.md "Out of Scope") — stub only, do not wire. Visitor "more-options" (⋯) menu does not exist at all — genuine new build. |
| PROFILE-09 | Upload/edit own banner and avatar | No route exists. `lib/storage/index.ts`'s `uploadReleaseArtwork()`/`ASSET_BUCKET` is dead, unwired code pointing at a bucket (`release-assets`) that was never created by any migration — do NOT reuse it. The live, correct pattern is `app/api/vault/[projectId]/assets/route.ts` against the real `vault-assets` public bucket (migration 002). Needs: new API route(s), new `CoverArtUpload`-style client component, and `avatar_url`/`banner_url` added to the `/api/profile` PATCH allowlist. |
</phase_requirements>

## Summary

Phase 9 is less "build a profile page" and more "close nine specific, well-scoped gaps in an already-largely-built profile page." `components/profile/ProfileView.tsx` and `app/u/[handle]/page.tsx` already implement roughly 70% of the locked hi-fi design: banner, avatar, name, verified badge, pronouns, role badges (with array-order = lead-role styling already applied), location, tenure string, "Open to" chips (header + sidebar), Featured spotlight (backed by a real column with DB-level integrity triggers from migration 034), a readiness-ring releases grid, a stats sidebar, and fully-live Follow/Message actions (backed by real `follows` and `dm_threads`/`dm_messages` tables from Wave 3/4 migrations). The real work in this phase is: (1) a small set of genuinely missing pieces — presence dot, a "placements" stat, an avatar/banner upload flow, edit UI for roles/open-to/featured-pin, and a working Share button — and (2) the public player split, which the user's CONTEXT.md discussion spent most of its time on: `/r/[projectId]` currently reuses the full-detail owner-facing `PlaybackView.tsx` (master/stems toggle, split percentages, ISRC/ISWC/BPM table) and must instead render a new, sibling "now-playing" component matching `artist-profile.html`'s clean stream-only design, at the same URL, gated by the same `is_public` check, reading only `tracks.audio_file_url` (the "share" MP3) via the same short-lived signed-URL pattern already used today.

No new external npm packages are required. The Web Share API is a browser built-in (feature-detected via `navigator.share`); the clipboard-copy fallback and its "Copied" label-swap confirmation pattern are already established in three places in this codebase (`PitchCard.tsx`, `PitchPlugForm.tsx`, `ExportPackPanel.tsx`) and should be reused verbatim rather than introducing a toast library. Two new database columns are needed (`artist_profiles.allow_resharing boolean`, and the additive `synced` shape nested inside the existing `tracks.metadata.lyrics` JSONB — no migration needed for the latter since it's JSONB). The `/api/profile` PATCH allowlist needs to grow by five fields (`roles`, `open_to`, `pronouns`, `avatar_url`, `banner_url`, `featured_project_id`, `allow_resharing`) with type-specific validation for each, mirroring the existing `sanitize()` function's per-field branches.

**Primary recommendation:** Treat this phase as "wire the missing 30%," not a rebuild — reuse `ProfileView.tsx`'s existing data shapes and rendering wherever possible, extend `buildProfileData()`/`ArtistProfile` minimally, and build the public player as a brand-new sibling component (not a stripped-down fork of `PlaybackView.tsx`) so the owner's private room stays untouched and unaffected by any public-facing simplification.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Profile header/hero rendering (badges, chips, stats) | Frontend Server (SSR) | — | `app/u/[handle]/page.tsx` already fetches and projects all profile data server-side; `ProfileView.tsx` is a pure presentational server-renderable component (client-only children are opt-in: `FollowButton`, `DmWidget`) |
| Presence dot (online/offline) | Browser / Client | API / Backend (Phase 11) | Visual-only in Phase 9 (no live infra exists yet); real tracking is Supabase Realtime Presence, explicitly scheduled for Phase 11 per ROADMAP.md |
| Avatar/banner upload | Browser / Client (file input, dimension read) | API / Backend (validate + write to Storage + DB) | Mirrors `CoverArtUpload.tsx` → `/api/vault/[projectId]/assets` pattern exactly |
| Featured spotlight pin | API / Backend | Database / Storage | `featured_project_id` write goes through `/api/profile` PATCH; DB-level triggers (migration 034) enforce it can only reference the owner's own public project |
| Stats aggregation (followers, placements, avg. readiness) | Database / Storage (COUNT queries) | Frontend Server (SSR) | Server component computes/queries counts at request time; no cached counters (matches project's notifications convention) |
| Public player (`/r/[projectId]`) | Frontend Server (SSR) + Browser / Client | API / Backend (signed URL minting) | Server component gates on `is_public`, mints signed URLs via service client; new client component renders playback UI only, no file-management concerns |
| Share mechanism (Web Share API / clipboard) | Browser / Client | — | Entirely a client-side browser API; no server round-trip needed beyond building the shareable URL/caption |
| Reshare toggle enforcement | API / Backend | Database / Storage | `allow_resharing` column read server-side when building the public player/profile page; Share affordance conditionally omitted from server-rendered markup (not just CSS-hidden) so a determined visitor can't trivially re-enable it client-side |
| Lyrics slide-up panel | Browser / Client | Frontend Server (SSR, initial lyrics text passed as prop) | Purely a UI overlay driven by data already fetched server-side |

## Standard Stack

### Core

No new libraries are required for this phase. Every capability (Web Share API, clipboard copy, image upload, presence-dot markup, drop-up panels) is achievable with what's already in the stack: Next.js 15 App Router, React 18 client components, Tailwind, and native browser APIs.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none — Web Share API) | native (Baseline "widely available" since ~2023 desktop, longer on mobile) | Share sheet trigger (D-05) | Browser built-in; feature-detect via `if (navigator.share)`, no dependency |
| (none — Clipboard API) | native | Copy-link fallback (D-05, D-14) | Already the established codebase pattern (`navigator.clipboard.writeText`) in 3 files |

### Supporting

Not applicable — no supporting libraries are needed. `date-fns` and `lucide-react` were mentioned in Wave 4's earlier cross-phase research notes (STATE.md) as anticipated additions for Phase 11/12, but neither is installed yet (`npm view` confirms both exist on the registry: date-fns 4.4.0, lucide-react 1.24.0 — [VERIFIED: npm registry] — but they are not phase-9 dependencies). Do not add them in this phase; the codebase's existing `yearOf()` helper and inline-SVG icon convention already cover everything Phase 9 needs, and introducing an icon library here would be inconsistent with every other icon in `ProfileView.tsx`/`PlaybackView.tsx` (all hand-written inline `<svg>`).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native Web Share API + clipboard fallback | A toast/share library (e.g. `react-hot-toast`, `react-share`) | Adds a dependency for something the codebase already does inline 3 times; rejected — D-05 explicitly says reuse existing pattern if one exists |
| Static (Phase-9-only) presence dot | Building full Supabase Realtime Presence now | Realtime Presence is explicitly Phase 11 scope (PRESENCE-01/02/03) with its own unsubscribe/visibilitychange/user-scoped-key research already logged in STATE.md; building it early in Phase 9 would duplicate that work outside its planned phase and risk drift before Phase 11's dedicated research |
| Inline `<svg>` icons (existing convention) | `lucide-react` | Every icon in this codebase today is hand-written inline SVG (verified via grep across `ProfileView.tsx`, `PlaybackView.tsx`, `FollowButton.tsx`); switching icon systems mid-file for one phase would be a stylistic regression |

**Installation:** None required.

## Package Legitimacy Audit

No new packages are installed by this phase — this section is not applicable. (If a planner later decides to add `date-fns`/`lucide-react` opportunistically, both are extremely well-established — [VERIFIED: npm registry], multi-year history, tens of millions of weekly downloads — but that decision belongs to whichever phase actually needs them, not Phase 9.)

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │  Visitor or Owner requests /u/[handle]       │
                    └───────────────────┬───────────────────────────┘
                                        ▼
                    app/u/[handle]/page.tsx (Server Component)
                    ├─ SELECT artist_profiles (explicit public column list, D-11)
                    │    → if !is_public: notFound()
                    ├─ SELECT vault_projects WHERE user_id + is_public (owner sees all; public page filters)
                    ├─ SELECT COUNT(*) FROM follows WHERE followee_id  ─┐
                    ├─ SELECT COUNT(*) FROM activity_events             │  stats
                    │    WHERE profile_id AND kind='placement'  ───────┤  sidebar
                    ├─ avgReadiness = avg(release.score) client-computed┘
                    ├─ auth.getUser() → viewerId
                    │    → follow/dm/wall/endorsements/comments state
                    └─ buildProfileData(profile, projects, {...}) ──────┐
                                        ▼                                │
                    ProfileView.tsx (mode: 'owner' | 'public')  ◄────────┘
                    ├─ Header: banner, avatar (+ presence-dot slot),
                    │   name, verified, pronouns, role badges (i===0 = lead)
                    ├─ "Open to" chips, location, tenure string
                    ├─ Actions:
                    │   owner  → Edit profile | Share (NEW: wired) | Analytics (stub, OK)
                    │   visitor→ Follow (live) | Message (live) | ⋯ more-options (NEW)
                    ├─ Featured spotlight → Link to /r/[projectId]
                    ├─ Releases grid (readiness rings) → Link to /r/[projectId]
                    └─ Owner-only: banner/avatar upload triggers, Featured picker

                    ── separately ──

                    Visitor/curator opens /r/[projectId] (public share link)
                    app/r/[projectId]/page.tsx (Server Component, UNCHANGED gate)
                    ├─ SELECT vault_projects + tracks WHERE id ─── is_public gate
                    ├─ mint short-lived signed URLs (service client, track-audio bucket)
                    ├─ toTrackViews(): readComposers() → names+roles only (no split%, D-11)
                    │                  readLyrics() → static text (D-12), synced (D-13, unused for now)
                    └─ renders NEW <PublicPlaybackView> (NOT <PlaybackView>)  ◄── D-01
                         ├─ hero art, scrub bar, transport (shuffle/prev/play/next/repeat)
                         ├─ "More from [Artist]" up-next list (D-03: existing tracks[], no new model)
                         ├─ overflow ⋯ menu: View credits | View lyrics | Copy link (D-14)
                         ├─ lyrics slide-up panel (D-08/D-09, hidden if no lyrics)
                         └─ Share button (Web Share API / clipboard fallback, D-05/D-06)
                              gated server-side on artist_profiles.allow_resharing (D-07)
```

### Recommended Project Structure

```
components/profile/
├── ProfileView.tsx          # existing — extend: presence-dot slot, wired Share, ⋯ menu, Featured-pin owner UI
├── ProfileForm.tsx          # existing (settings) — extend: roles editor, open-to picker, avatar/banner upload
├── FollowButton.tsx         # existing, unchanged — pattern reference for optimistic-toggle style
├── DmWidget.tsx             # existing, unchanged
├── AvatarBannerUpload.tsx   # NEW — mirrors components/vault/CoverArtUpload.tsx
├── ShareButton.tsx          # NEW — Web Share API + clipboard fallback, reusable for profile + per-track share
└── ProfileMoreMenu.tsx      # NEW — visitor "⋯" more-options menu (report/block hooks land in Phase 13; stub-safe now)

components/vault/
├── PlaybackView.tsx         # existing — UNCHANGED, continues serving /vault/[projectId]/play only
├── PublicPlaybackView.tsx   # NEW — sibling component for /r/[projectId], stream-only per D-01
└── LyricsPanel.tsx          # NEW — slide-up panel (D-08), used only by PublicPlaybackView

app/api/profile/
├── route.ts                 # existing — extend EDITABLE_FIELDS + sanitize() branches
├── avatar/route.ts          # NEW — mirrors app/api/vault/[projectId]/assets/route.ts, bucket=vault-assets
└── banner/route.ts          # NEW — same pattern, or combine into one route with a `type` param

lib/profile/
└── load.ts                  # existing — extend ProfileData/buildProfileData for placementsCount, allowResharing
```

### Pattern 1: Optimistic client-side toggle with server revert
**What:** A client component owns local boolean state, calls the API, and reverts on failure — no loading spinner needed for the common case.
**When to use:** Follow/unfollow, and identically for the Share button's own resharing-toggle setting in the settings page (not the public share action itself, which has no "on/off" client state, just a fetch of the current server-computed permission).
**Example:**
```typescript
// Source: components/profile/FollowButton.tsx (existing, in this codebase)
async function toggle() {
  if (!canFollow || busy) return
  setBusy(true)
  const next = !following
  setFollowing(next) // optimistic
  const res = await fetch('/api/follows', {
    method: next ? 'POST' : 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ followeeId: profileUserId }),
  })
  setBusy(false)
  if (!res.ok) { setFollowing(!next); return } // revert
  router.refresh()
}
```

### Pattern 2: Image upload via multipart FormData to a scoped API route
**What:** Client reads optional pixel dimensions, POSTs `FormData` with `file` + `type`, server validates MIME/size, uploads to the real public `vault-assets` Storage bucket (RLS-scoped by first path segment = `auth.uid()`), writes the resulting public URL to a DB column.
**When to use:** Avatar and banner upload (PROFILE-09) — this is the correct, live-wired pattern. Do NOT use `lib/storage/index.ts`'s `uploadReleaseArtwork()`/`ASSET_BUCKET` — that function targets a bucket (`release-assets`) that no migration ever created and is not called from anywhere in the app today (`grep` confirms zero call sites outside its own definition).
**Example:**
```typescript
// Source: app/api/vault/[projectId]/assets/route.ts (existing, live, this codebase)
const BUCKET = 'vault-assets' // created by supabase/migrations/002_vault_assets_storage.sql
// ...
const path = `${user.id}/${projectId}/${type}-${Date.now()}.${ext}`
const { error: uploadError } = await supabase.storage
  .from(BUCKET)
  .upload(path, file, { contentType: file.type, upsert: false })
const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
```
For avatar/banner, adapt the path to `${user.id}/profile/${type}-${Date.now()}.${ext}` (no `projectId` segment — profile-level, not project-level) — the existing RLS policy (`(storage.foldername(name))[1] = auth.uid()::text`) already covers this without any new migration, since it only checks the first path segment.

### Pattern 3: Server-minted short-lived signed URLs for a private Storage bucket, gated by a public-column check
**What:** `track-audio` is a PRIVATE bucket; a public page may only stream from it after confirming `vault_projects.is_public = true`, then using the service-role client (not the session client) to mint time-limited signed URLs.
**When to use:** The new `PublicPlaybackView` must keep using exactly this pattern (already correct in `app/r/[projectId]/page.tsx` today) — do not change the gate or the bucket, only the rendering component per D-01/D-02.
**Example:**
```typescript
// Source: app/r/[projectId]/page.tsx (existing, live, this codebase)
if (!data || !(data as { is_public?: boolean }).is_public) notFound()
// ...
const service = createServiceClient()
const { data: signed } = await service.storage
  .from('track-audio')
  .createSignedUrls(paths, 60 * 60 * 2) // 2-hour expiry
```

### Pattern 4: Click-outside dropdown/menu
**What:** `useState` for open/closed + a `mousedown` listener on `document` that closes the menu when the click target is outside a ref'd container.
**When to use:** The new overflow `⋯` menu on the public player (D-14: View credits / View lyrics / Copy link) and the visitor "more-options" menu on the profile (PROFILE-08).
**Example:**
```typescript
// Source: components/collaborators/CollaboratorPicker.tsx (existing, this codebase)
useEffect(() => {
  function handleOutside(e: MouseEvent) {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
  }
  if (open) document.addEventListener('mousedown', handleOutside)
  return () => document.removeEventListener('mousedown', handleOutside)
}, [open])
```

### Pattern 5: Web Share API with clipboard fallback (NEW pattern for this phase)
**What:** Feature-detect `navigator.share`; call it with `{ title, text, url }` inside a user-gesture handler (required by the browser — must be called directly from an `onClick`, not after an `await` that yields the event loop, or Safari/Chrome will silently reject it). Fall back to `navigator.clipboard.writeText()` + the existing "Copied" label-swap confirmation pattern (no toast library needed).
**Example:**
```typescript
// New pattern — combine D-05/D-06 with the codebase's existing copy-confirmation convention
async function share(url: string, caption: string) {
  if (navigator.share) {
    try {
      await navigator.share({ title: caption, url })
      return
    } catch (err) {
      // AbortError = user cancelled the OS share sheet; not a failure, do nothing.
      if ((err as DOMException)?.name === 'AbortError') return
      // Fall through to clipboard on any other failure.
    }
  }
  await navigator.clipboard.writeText(`${caption} → ${url}`)
  setCopied(true) // existing label-swap convention (see PitchCard.tsx)
  setTimeout(() => setCopied(false), 1500)
}
```

### Anti-Patterns to Avoid
- **Forking `PlaybackView.tsx` with props to hide sections:** D-01 explicitly calls for a genuinely separate component, not a `canManage`-style conditional inside the existing 400-line component. `PlaybackView.tsx` already has a `canManage` flag suppressing the Files section for the public route today — but it still ships the Master/Stems toggle, split percentages, and ISRC/ISWC/BPM table unconditionally. Adding more conditionals to strip those out would make an already-large component harder to reason about and risks a conditional leaking back on for the private room. Build `PublicPlaybackView.tsx` as its own file.
- **CSS-hiding the Share button when `allow_resharing` is false:** D-07 requires the affordance to not be shown at all to visitors when the toggle is off — this must be a server-side conditional in the JSX (omit the element), not a client-side `display:none`, or a visitor could re-enable it via devtools and still trigger a share flow the artist opted out of (low-stakes here since sharing itself has no privileged action, but the correct implementation is still server-side omission per the decision's literal wording).
- **Storing "lead role" as a new schema field:** The existing convention (first element of the `roles` array is the lead role, styled distinctly via `i === 0` in `ProfileView.tsx`) already satisfies PROFILE-01. Adding an `is_lead` boolean or separate `lead_role` column would be redundant schema for a UI convention that already works and already has an edit-reorder affordance implied by "array order" — just needs a reorder control in the new roles-editor UI (e.g. drag-to-reorder or "Set as lead" button that moves an entry to index 0).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Share-sheet UI (social app picker, Messages/Mail/AirDrop) | A custom share modal listing social platforms | Native Web Share API (`navigator.share`) | The OS-provided sheet already includes every installed app; a custom modal would need per-platform deep-link logic (mailto:, sms:, whatsapp://, etc.) that the OS does for free, and D-05 explicitly specifies this approach |
| Signed URL generation for private Storage | A custom signed-token/JWT scheme for track playback | Supabase Storage `createSignedUrls()` (already used in `app/r/[projectId]/page.tsx`) | Already correctly implemented; reuse verbatim in the new public player |
| Toast notification system | A new global toast provider/context | The existing local-state "Copied" label-swap pattern (`PitchCard.tsx`, `ExportPackPanel.tsx`) | Three call sites in the codebase already solve "confirm a copy succeeded" without any global state or dependency; introducing a toast library for one new button would be inconsistent and unnecessary |
| Featured-project ownership/publicness validation | Custom app-level check re-implementing "must be my own public project" | The existing DB trigger (`check_featured_project_is_public()`, migration 034) | Already enforces this at the database level with a clear exception; the API layer only needs to catch and rewrap that exception into a friendly 400 response, not re-implement the check |
| "Placements" counter | A new denormalized/cached count column on `artist_profiles` | `SELECT COUNT(*) FROM activity_events WHERE profile_id = X AND kind = 'placement'` | Matches the project's explicit architectural decision (STATE.md): "notifications are 1:1 events only ... compute unread via COUNT, never a cached counter that can drift" — the same reasoning applies to any stat derived from an event-sourced table |

**Key insight:** This phase's biggest risk is *doing more work than necessary* because most of the "hard" infrastructure (identity schema, follows, DMs, featured-project integrity, signed URLs, RLS-scoped storage) was already built in Phase 8 and earlier waves. The research above repeatedly confirms "already exists, just needs wiring" — resist the urge to introduce new schema, new libraries, or new architectural patterns where an existing, already-tested one covers the need.

## Common Pitfalls

### Pitfall 1: Reusing `lib/storage/index.ts`'s `uploadReleaseArtwork()` for avatar/banner
**What goes wrong:** It uploads to `ASSET_BUCKET = 'release-assets'`, a bucket name that does not exist in any migration (the real, migrated public-image bucket is `vault-assets`). An upload would fail at runtime with a Supabase "bucket not found" error, and even if a bucket were manually created with that name, its RLS policies (or lack thereof) would not match the ones already governing `vault-assets`.
**Why it happens:** The function looks like the obvious, already-built utility for "upload an image" — its name (`uploadReleaseArtwork`) and its `type: '... | 'banner'` union even include `'banner'` already, making it look purpose-built for this phase.
**How to avoid:** Follow `app/api/vault/[projectId]/assets/route.ts`'s inline pattern instead (bucket `vault-assets`, confirmed live via migration 002). Either write new dedicated routes or delete/ignore the dead utility.
**Warning signs:** Any `npm run build` or runtime error mentioning "release-assets" bucket not found; `grep -rn "release-assets"` returns only `lib/storage/index.ts` itself.

### Pitfall 2: Treating the presence dot as though PRESENCE-01 infrastructure exists
**What goes wrong:** PROFILE-01's copy ("avatar with online presence dot") reads like a live feature, but no presence/online-tracking system exists anywhere in the codebase yet (confirmed via exhaustive grep — zero matches for Supabase Realtime Presence channel usage). Building live presence tracking inside Phase 9 duplicates infrastructure explicitly scoped to Phase 11 (PRESENCE-01/02/03) and risks conflicting with that phase's already-researched design (user-scoped presence key, `visibilitychange`-driven re-track, explicit `unsubscribe()` on unmount — logged in STATE.md).
**Why it happens:** The requirement text doesn't distinguish "the visual dot element" from "the live data behind it," and the design mockup renders the dot as always-on ("Online").
**How to avoid:** Render the presence-dot markup/slot in this phase (satisfies the visual requirement and gives Phase 11 a drop-in target), but drive it from a static/absent value (e.g., omit it entirely, or hardcode `false`) rather than building any Realtime subscription. Flag this explicitly to the user/planner as a sequencing decision, since it's a product call, not purely technical.
**Warning signs:** A plan task that mentions "subscribe to a presence channel" inside Phase 9 — that work belongs in Phase 11.

### Pitfall 3: Extending `PATCH /api/profile` without validating the new array/enum fields
**What goes wrong:** `roles` and `open_to` are typed as discriminated unions/enums in TypeScript, but the API layer receives raw untyped JSON from `request.json()`. Naively spreading `body.roles` into the update without validating each element's `kind`/`slug`/`label` shape (or each `open_to` string against the known `OpenTo` union) allows a malformed or malicious payload to write garbage into a column two other server components (`ProfileView.tsx`, `buildProfileData()`) trust as already-validated.
**Why it happens:** The existing `sanitize()` function's array-handling branches (`industry_roles`, `genres`) filter against a known slug list — but `roles` is a more complex nested shape (`{kind: 'preset', slug} | {kind: 'custom', label}`), and it's easy to copy the simpler string-array pattern without extending it for the union type.
**How to avoid:** Write a dedicated validator for `roles` that checks each array element has `kind === 'preset'` with `slug` in `PROFILE_ROLES`, or `kind === 'custom'` with a non-empty, length-capped `label` string. Reuse Zod (already a project dependency) for this rather than hand-rolled type guards, consistent with the project's stated conventions ("Zod 3.23.0 - TypeScript-first schema validation for API inputs").
**Warning signs:** A role badge rendering as `undefined` or blank on the public profile after an edit; TypeScript `as` casts inside the API route without a preceding runtime check.

### Pitfall 4: Featured-project picker allowing a non-public or non-owned project
**What goes wrong:** The DB trigger (migration 034) will reject an invalid `featured_project_id` with a raw Postgres exception (`RAISE EXCEPTION 'featured_project_id must reference a public vault_project'`), which — if not caught — surfaces as an ugly 500 with a raw SQL error message to the artist trying to pin a still-draft release.
**Why it happens:** It's tempting to treat the DB trigger as "handles validation, nothing to do here" and skip building a friendly pre-check.
**How to avoid:** In the API route, before the update, verify the chosen project both belongs to the requesting user AND has `is_public = true`; return a clear 400 ("Only public releases can be featured — publish it first") if not, rather than relying solely on the trigger's exception message reaching the client unmangled.
**Warning signs:** A featured-project picker UI that lets the owner select any of their releases (including private drafts) without filtering the list first.

### Pitfall 5: Web Share API called after an `await` (fails silently on some browsers)
**What goes wrong:** `navigator.share()` must be invoked synchronously within a user-gesture event handler. If the caption/URL is built via an `await fetch(...)` before calling `.share()`, some browsers (notably Safari) will throw a `NotAllowedError` because the "user activation" window has expired.
**Why it happens:** It's natural to reach for the current signed-in-user's data or the release title via an async call right before sharing.
**How to avoid:** Pre-compute the share URL/caption as static props passed into the client component at render time (server component already has this data), so the `onClick` handler calls `navigator.share()` as the very first statement with no intervening `await`.
**Warning signs:** Share works in Chrome/desktop but silently no-ops (or throws `NotAllowedError` in the console) on Safari/iOS.

## Code Examples

### Extending the PATCH /api/profile allowlist (illustrative shape, not exhaustive)
```typescript
// Extend app/api/profile/route.ts's EDITABLE_FIELDS + sanitize() with new branches:
const EDITABLE_FIELDS = [
  // ...existing fields...
  'pronouns', 'roles', 'open_to', 'avatar_url', 'banner_url',
  'featured_project_id', 'allow_resharing',
] as const

// roles: validate each element against the ProfileRole union (use Zod)
const ProfileRoleSchema = z.union([
  z.object({ kind: z.literal('preset'), slug: z.enum(PROFILE_ROLES) }),
  z.object({ kind: z.literal('custom'), label: z.string().trim().min(1).max(40) }),
])
if (key === 'roles' && Array.isArray(value)) {
  const parsed = z.array(ProfileRoleSchema).max(6).safeParse(value)
  if (parsed.success) update[key] = parsed.data
  continue
}

// open_to: filter against the known OpenTo union (mirrors the existing genres/industry_roles pattern)
if (key === 'open_to' && Array.isArray(value)) {
  update[key] = (value as unknown[]).filter(
    (s): s is string => typeof s === 'string' && OPEN_TO_VALUES.includes(s as OpenTo)
  )
  continue
}

// featured_project_id: pre-check ownership + is_public before the DB trigger ever fires
if (key === 'featured_project_id') {
  if (value === null) { update[key] = null; continue }
  const { data: proj } = await service
    .from('vault_projects')
    .select('id, is_public')
    .eq('id', value)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!proj) return NextResponse.json({ error: 'Release not found' }, { status: 404 })
  if (!proj.is_public) return NextResponse.json({ error: 'Only public releases can be featured' }, { status: 400 })
  update[key] = value
  continue
}
```

### Placements stat query (extends `app/u/[handle]/page.tsx`'s existing Promise.all)
```typescript
// Add alongside the existing follows COUNT query in the same Promise.all:
supabase
  .from('activity_events')
  .select('*', { count: 'exact', head: true })
  .eq('profile_id', profile.id)
  .eq('kind', 'placement'),
```

### Additive timestamped-lyrics shape (D-13) — extends `TrackLyrics` in `lib/metadata/schema.ts`
```typescript
// Existing (unchanged):
export type TrackLyrics = {
  text: string
  language?: string
  explicit?: boolean
  updated_at?: string
}
// Proposed additive extension — nests, does not replace, the plain-text shape:
export type TrackLyrics = {
  text: string
  language?: string
  explicit?: boolean
  updated_at?: string
  /** Optional line-level timestamps for future sync-highlighting (D-13).
   *  Absent = static display only, which is exactly what Phase 9 ships. */
  synced?: {
    lines: { atMs: number; text: string }[]
    method: 'manual' | 'forced_alignment'
    updated_at: string
  }
}
```
No migration required — `lyrics` already lives inside the `tracks.metadata` JSONB column; `readLyrics()`'s existing defensive-parse pattern (loose read + type guard) already tolerates additive optional fields without a schema change.

## State of the Art

Not heavily applicable to this phase — the codebase's own prior-wave conventions (established as recently as migration 042) are the relevant "state of the art" to follow, not external ecosystem trends. One relevant browser-platform note:

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `document.execCommand('copy')` for clipboard fallback | `navigator.clipboard.writeText()` | Clipboard API reached broad support years ago; already the exclusive pattern used in this codebase (`PitchCard.tsx`, `ExportPackPanel.tsx`, `PitchPlugForm.tsx`) | No action needed — codebase already on the modern API |

**Deprecated/outdated:** None identified specific to this phase's scope.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The presence dot should be shipped as static/inert markup in Phase 9, with live tracking deferred to Phase 11 | Pitfall 2, Architectural Responsibility Map | If the user actually wants a lightweight live indicator now (e.g., derived from a simple `last_seen_at` timestamp heuristic rather than full Realtime Presence), this recommendation under-delivers; low risk since it's easily upgraded in Phase 11 without redesign |
| A2 | `activity_events.kind = 'placement'` COUNT is the correct/intended source for the "placements" stat (no other placements-tracking table exists) | Standard Stack / Don't Hand-Roll / Phase Requirements table | If placements are meant to come from a different, not-yet-built source (e.g., a dedicated `placements` table tied to sync licensing deals), this undercounts; exhaustive grep found no such table, so this is the best available signal today |
| A3 | `allow_resharing` should be a single global boolean on `artist_profiles` (not per-project) | Architecture Patterns, Anti-Patterns | Matches D-07's literal wording ("artist-controlled global toggle") — low risk, directly sourced from the locked decision, not inferred |
| A4 | The new public player component should be entirely new code, not a refactor extracting shared pieces from `PlaybackView.tsx` into a common base | Anti-Patterns to Avoid | If a future refactor wants shared waveform/transport logic between the two players, some duplication between `PlaybackView.tsx` and `PublicPlaybackView.tsx` will need reconciling later; D-01's explicit wording ("genuinely separate... clean") supports starting duplicated rather than prematurely abstracting |
| A5 | `date-fns`/`lucide-react` should NOT be added in this phase despite being mentioned in STATE.md's Wave 4 research notes | Standard Stack | If the planner had already silently decided to bring these in during Phase 9 for some UI reason, this recommendation conflicts; no evidence found that Phase 9 specifically needs either, and neither exists in package.json today |

**If this table is empty:** N/A — see entries above.

## Open Questions

1. **Should the presence dot be wired to any signal at all in Phase 9 (e.g., a coarse `last_seen_at` timestamp updated on each authenticated request), or purely static/absent until Phase 11?**
   - What we know: No presence infrastructure exists anywhere in the codebase; Phase 11 (Presence & Messaging) is the explicitly planned home for PRESENCE-01 (live dot) with its own already-logged research (Realtime Presence, user-scoped keys, `visibilitychange` handling).
   - What's unclear: Whether the user considers "avatar with online presence dot" in PROFILE-01 to require ANY signal in Phase 9, or whether a purely cosmetic/hidden dot satisfies the requirement until Phase 11 lands.
   - Recommendation: Default to static/hidden (Assumption A1) and flag this explicitly for user confirmation during planning — it's a low-cost, easily-reversible sequencing choice, not an architecture risk.

2. **Does "monthly listeners" and "total streams" (self-reported, per Out-of-Scope table: "Pulling live Spotify/SoundCloud stats automatically... self-reported stats with a 'provided by artist' label are sufficient for v1") need a "provided by artist" label added to the stats sidebar in this phase, or is that a Phase 12/discovery-layer concern?**
   - What we know: REQUIREMENTS.md's Out of Scope table explicitly calls for a "provided by artist" label on self-reported stats.
   - What's unclear: Which phase is meant to add that label — it reads like a Phase 9 concern (it's rendered on the Phase 9 stats sidebar) but isn't listed among PROFILE-01..09's acceptance criteria.
   - Recommendation: Add the label in this phase since the stats sidebar itself is being touched anyway (to add "placements") — low-cost, closes a documented requirement gap, and avoids a future phase needing to re-open `ProfileView.tsx`'s Stats card.

## Environment Availability

Not applicable — this phase has no new external tool/service/runtime dependencies. All work happens within the already-provisioned Supabase project (existing buckets, existing tables) and the existing Next.js/React toolchain.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.4.2 + ts-jest 29.4.11 |
| Config file | `jest.config.js` (root) — `testEnvironment: 'node'`, `@/*` path mapping configured |
| Quick run command | `npx jest __tests__/<file>.test.ts` |
| Full suite command | `npx jest` |

**Gap:** `package.json` has no `"test"` script defined — only the `jest`/`ts-jest`/`@types/jest` devDependencies and `jest.config.js` exist. All 4 existing test files (`__tests__/capability-*.test.ts`, `__tests__/schema-stems-instrumental.test.ts`) are run via direct `npx jest` invocation. Existing tests are unit-level (pure function testing, e.g. schema readers), not integration/API-route tests — there is no supertest/msw/API-mocking infrastructure in the project today.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROFILE-02 | `roles` array validation accepts valid preset/custom shapes, rejects malformed ones | unit | `npx jest __tests__/profile-roles-validation.test.ts` | ❌ Wave 0 |
| PROFILE-04 | `open_to` filter rejects unknown enum strings | unit | `npx jest __tests__/profile-roles-validation.test.ts` (same file, co-located) | ❌ Wave 0 |
| PROFILE-05 | Featured-project pre-check rejects non-owned / non-public project IDs before hitting the DB trigger | unit (pure validation logic extracted from route) | `npx jest __tests__/featured-project-validation.test.ts` | ❌ Wave 0 |
| PROFILE-06 | `buildProfileData()` correctly derives `placementsCount` and `avgReadiness` from fixture inputs | unit | `npx jest __tests__/profile-load.test.ts` | ❌ Wave 0 |
| D-13 | `readLyrics()` still parses legacy plain-text lyrics after the additive `synced` field is introduced (backward compatibility) | unit | `npx jest __tests__/schema-lyrics.test.ts` | ❌ Wave 0 |
| PROFILE-09, D-01/D-02, D-05/D-07 | Upload flow, public player gating, Share visibility toggle | manual-only | — | N/A — no browser/E2E test runner (Playwright/Cypress) exists in this project; these require human verification (file upload UX, audio playback, native OS share sheet cannot be meaningfully unit-tested) |

### Sampling Rate
- **Per task commit:** `npx jest __tests__/<relevant-file>.test.ts`
- **Per wave merge:** `npx jest` (full suite — only 4 existing files today, fast)
- **Phase gate:** Full suite green before `/gsd-verify-work`; human verification required for upload/playback/share flows per the manual-only row above.

### Wave 0 Gaps
- [ ] `__tests__/profile-roles-validation.test.ts` — covers PROFILE-02, PROFILE-04 (roles/open_to sanitize validation)
- [ ] `__tests__/featured-project-validation.test.ts` — covers PROFILE-05
- [ ] `__tests__/profile-load.test.ts` — covers PROFILE-06 (`buildProfileData()` extension)
- [ ] `__tests__/schema-lyrics.test.ts` — covers D-13 backward-compatibility
- [ ] Add `"test": "jest"` to `package.json` scripts — not currently defined; every existing test file is run via a raw `npx jest` invocation with no npm script wrapper

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (new work) | Already handled by Supabase Auth cookies + middleware; no new auth surface in this phase |
| V3 Session Management | No (new work) | Unchanged — existing `createServerClient()`/`createApiClient()` session handling |
| V4 Access Control | Yes | Ownership checks on every new mutation: avatar/banner upload (path scoped to `auth.uid()`, enforced by existing RLS policy on `vault-assets`), featured-project pin (must be caller's own `is_public` project — pre-checked in API + DB trigger), Share visibility (server-side omission of the Share affordance when `allow_resharing` is false, not client-side hiding) |
| V5 Input Validation | Yes | Zod validation for `roles` (discriminated union), `open_to` (enum array), image MIME/size validation (mirror `EXT_BY_MIME`/`MAX_BYTES` pattern from the existing assets route) |
| V6 Cryptography | No | No new cryptographic surface — signed URLs are minted via Supabase's existing `createSignedUrls()`, not hand-rolled |

### Known Threat Patterns for Next.js 15 + Supabase (this stack)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Mass assignment via PATCH /api/profile (client sends unexpected fields, e.g. `verified: true` or `member_type: 'industry'`) | Tampering | Explicit `EDITABLE_FIELDS` allowlist already exists — new fields (`roles`, `open_to`, `pronouns`, `avatar_url`, `banner_url`, `featured_project_id`, `allow_resharing`) must be added to this same allowlist, never widened to `select('*')` / spread-all |
| Featured-project reference leaking a private draft's UUID through the public profile (T-08-01, already identified and mitigated in migration 034) | Information Disclosure | Already mitigated by `check_featured_project_is_public()` + `clear_featured_if_unpublished()` triggers; the new API-layer pre-check (Pitfall 4) is a UX improvement on top of an already-secure DB layer, not a substitute for it |
| Uploaded avatar/banner file used to smuggle a non-image payload (MIME-sniffing bypass) | Tampering / Elevation of Privilege | Reuse the existing `EXT_BY_MIME` allowlist keyed off `file.type` (not file extension alone) and the existing 10MB `MAX_BYTES` cap from the assets route pattern; do not trust client-declared `type` for anything beyond bucket-path naming |
| Reshare toggle bypassed via direct PostgREST call (client hits `artist_profiles` table directly instead of going through the server-rendered page) | Elevation of Privilege | Not a meaningful bypass here — `allow_resharing` only gates whether the UI *offers* a share affordance; sharing a public `/r/[projectId]` URL is not privileged information (the URL itself is already public once `is_public` is true), so this is a UX preference, not an access-control boundary. No RLS change needed beyond ensuring `allow_resharing` isn't in a column an unauthenticated client could read as sensitive (it isn't sensitive) |
| Visitor "more-options" menu (PROFILE-08) later growing to include Report/Block (Phase 13 SAFETY-01/02) before those features exist | Denial of Service (of the wrong kind — broken UI) | Build the menu container now but keep its action list empty or limited to non-privileged actions (e.g., Copy profile link) in Phase 9; wire Report/Block in Phase 13 per REQUIREMENTS.md's own phase mapping — do not stub buttons that appear functional but silently no-op |

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection (Read/Grep tool calls, this session) — `components/profile/ProfileView.tsx`, `app/u/[handle]/page.tsx`, `app/r/[projectId]/page.tsx`, `components/vault/PlaybackView.tsx`, `app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts`, `lib/profile/load.ts`, `lib/storage/index.ts`, `app/api/vault/[projectId]/assets/route.ts`, `components/vault/CoverArtUpload.tsx`, `components/profile/FollowButton.tsx`, `components/collaborators/CollaboratorPicker.tsx`, `components/tools/PitchCard.tsx`, `components/tools/PitchPlugForm.tsx`, `components/vault/ExportPackPanel.tsx`, `lib/metadata/schema.ts`, `lib/social/activity.ts`, `types/index.ts`, `app/api/profile/route.ts`, `app/(artist)/settings/page.tsx`, `components/profile/ProfileForm.tsx`, `jest.config.js`, `package.json`, `.planning/config.json`
- `supabase/migrations/012_social_layer.sql`, `034_member_identity_wave4.sql`, `035_connections_blocks.sql`, `002_vault_assets_storage.sql`, `004_track_audio_storage.sql` — direct schema/RLS/trigger inspection
- `docs/design/wave-4-social-layer/user-profile.html`, `artist-profile.html`, `README.md` — locked design mockups, structural markup inspected directly

### Secondary (MEDIUM confidence)
- `npm view date-fns version` / `npm view lucide-react version` (registry check, this session) — confirms both packages exist and are current, used only to substantiate the "don't add them" recommendation

### Tertiary (LOW confidence)
- None — all findings in this research were grounded in direct codebase/schema/design-file inspection during this session; no unverified web search claims were used.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages needed; conclusion is grounded in exhaustive grep of the existing codebase, not external research
- Architecture: HIGH — every pattern cited (upload flow, signed URLs, click-outside menu, optimistic toggle) is copied from working, already-shipped code in this exact repository
- Pitfalls: HIGH — each pitfall (dead storage utility, missing presence infra, allowlist validation gap, trigger-exception UX, Web Share timing) was discovered via direct inspection, not inferred from general domain knowledge
- Security: HIGH — threat patterns map directly onto already-documented security decisions in STATE.md (migration 034's T-08-01 fix, column-privilege lockdown pattern) rather than generic ASVS boilerplate

**Research date:** 2026-07-12
**Valid until:** 30 days (stable — this research is grounded in the current state of a specific codebase, not a fast-moving external ecosystem; re-verify only if Phase 8/10/11 work lands and changes the `follows`/`activity_events`/`artist_profiles` schema before Phase 9 planning begins)
