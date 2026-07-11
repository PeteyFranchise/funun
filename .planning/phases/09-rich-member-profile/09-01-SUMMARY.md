---
phase: 09-rich-member-profile
plan: "01"
subsystem: public-player-share
tags: [public-player, share, web-share-api, lyrics, credits, reshare-toggle, privacy, rls, next15]
status: complete

dependency_graph:
  requires:
    - collaborators-table
    - artist_profiles-column-privileges
    - readComposers
    - readLyrics
    - vault_projects-is_public-gate
  provides:
    - allow_resharing-column
    - TimedLyricLine-type
    - hasTimedLyrics
    - PublicPlayer-component
    - useShare
    - Toast-useToast
    - ProfileShareButton-component
    - public-stream-only-player
    - reshare-toggle
  affects:
    - app/r/[projectId]/page.tsx
    - components/profile/ProfileView.tsx
    - app/api/profile/route.ts
    - components/profile/ProfileForm.tsx
    - app/(artist)/settings/page.tsx
    - types/index.ts
    - lib/metadata/schema.ts
    - lib/profile/load.ts
    - app/globals.css

tech_stack:
  added: []
  patterns:
    - "Stream-only public projection (toPublicTracks) drops split/ISRC/ISWC/BPM before data reaches the client component"
    - "Web Share API with clipboard-copy + toast fallback (native share sheet where supported, desktop copy otherwise)"
    - "Column-scoped GRANT SELECT for a new artist_profiles column (mirrors migration 040 lockdown); no UPDATE grant — written via service client"
    - "Additive JSONB shape extension (TrackLyrics.lines) — forward-compatible, no migration, back-compatible readers"
    - "Overflow menu dismissed via document mousedown listener (existing picker/menu pattern)"

key_files:
  created:
    - supabase/migrations/041_artist_profiles_allow_resharing.sql
    - components/player/PublicPlayer.tsx
    - components/player/useShare.ts
    - components/ui/Toast.tsx
    - components/profile/ProfileShareButton.tsx
  modified:
    - lib/metadata/schema.ts
    - types/index.ts
    - app/r/[projectId]/page.tsx
    - components/profile/ProfileView.tsx
    - app/api/profile/route.ts
    - components/profile/ProfileForm.tsx
    - app/(artist)/settings/page.tsx
    - lib/profile/load.ts
    - app/globals.css

decisions:
  - "D-01: /r/[projectId] renders a new stream-only PublicPlayer, not PlaybackView — the owner's private room (/vault/[projectId]/play) keeps PlaybackView unchanged"
  - "D-02: same /r/[projectId] URL + is_public gate preserved so already-sent curator pitch links keep working"
  - "D-07 default off: allow_resharing defaults FALSE; visitors see no Share affordance until the artist opts in; the owner always sees it (viewerIsOwner computed from the auth user vs vault_projects.user_id)"
  - "D-11: public credits are names + roles only — split percentages never enter the public projection"
  - "D-13: shipped the timed-lyrics data shape (TrackLyrics.lines) now but render static text only; karaoke sync + the timing-entry method remain a deferred fast-follow"
  - "migration 041 grants only SELECT on allow_resharing (authenticated/anon); the toggle is written on the service-role client in /api/profile after an ownership check, so no UPDATE grant is needed"

verification:
  - "npx tsc --noEmit: clean"
  - "next build: all routes compile, including /r/[projectId], /settings, /u/[handle]"
  - "Runtime (DEMO): /r/demo-single-1 returns 200 with no ISRC/ISWC/IPI/Master/Stems and no split % in the payload; credits name renders; /r/demo-ep-1 shows the 'More from' up-next; /settings renders the reshare toggle; /profile renders the wired Share button"

metrics:
  completed: "2026-07-11"
  tasks_completed: 3
  tasks_total: 3
  files_created: 5
  files_modified: 9
---

# Phase 09 Plan 01: Public Player & Share Summary

**One-liner:** A clean, stream-only public "now playing" component replaces the owner's full-detail player at `/r/[projectId]` so share links no longer leak split percentages, ISRC/ISWC/BPM, or master/stems file status, plus a Web Share + clipboard share action gated by an artist-controlled reshare toggle, credits and static lyrics panels, and a forward-compatible timed-lyrics shape.

---

## What Was Built

### The privacy fix (D-01/D-02)

`app/r/[projectId]/page.tsx` previously rendered `components/vault/PlaybackView.tsx` — the same component the owner uses in their private room — feeding it per-track split percentages, ISRC/ISWC/BPM, and master/stems status. A public share link (the kind Wave 3 pitch emails already send to curators) therefore exposed all of that.

The route now renders a new `components/player/PublicPlayer.tsx`. The page's `toPublicTracks()` projection keeps only what a stream needs: title, duration, the share MP3 (`audio_file_url`), credits as `{ name, role }` (no split), and plain lyrics text. The `is_public` gate and the `/r/[projectId]` URL are unchanged, so existing curator links keep working. The owner's `/vault/[projectId]/play` room still renders `PlaybackView`, untouched.

### The share action (PROFILE-08, D-04..D-07)

- `components/player/useShare.ts` — Web Share API when available (opens the OS share sheet), clipboard copy as the desktop fallback, confirmed with a toast. `shareCaption()` builds the track-focused caption (D-06).
- `components/ui/Toast.tsx` — a minimal `useToast()` hook + bubble (no toast library in the repo).
- `components/profile/ProfileShareButton.tsx` — wires the previously-dead Share button in the owner profile header (`ProfileView.tsx`) to a profile-focused share.
- On the player, Share and "Copy link" live in the overflow menu. The owner always sees them; a visitor sees them only when the artist's `allow_resharing` toggle is on (`viewerIsOwner || allowResharing`).

### The reshare toggle (D-07)

- Migration `041_artist_profiles_allow_resharing.sql` adds `allow_resharing BOOLEAN NOT NULL DEFAULT FALSE` and `GRANT SELECT (allow_resharing)` to `authenticated, anon`. The grant is required because migration 040 locked `artist_profiles` to column-scoped grants; without it the `/r/` page's session/anon-role read would 42501. No UPDATE grant: the toggle is written on the service-role client in `app/api/profile/route.ts` after an ownership check, so `authenticated` never writes it via PostgREST.
- `app/api/profile/route.ts` adds `allow_resharing` to `EDITABLE_FIELDS` with a boolean branch in `sanitize()`.
- `components/profile/ProfileForm.tsx` adds a "Sharing" section with a switch; `ArtistProfile` (and both demo fixtures) carry the new field.

### Credits & lyrics panels (D-08..D-12)

The overflow `⋯` menu offers **View credits · View lyrics · Copy link · Share**. Credits show names + roles only (never splits, D-11). Lyrics open in a slide-up sheet over the running player and are hidden entirely when a track has none (D-09). Both reuse `readComposers()` / `readLyrics()` — no new data reads.

### Timed-lyrics shape (D-13)

`TrackLyrics` gains an optional `lines: { t: number; text: string }[]` for future karaoke-style highlighting, plus `hasTimedLyrics()`. It is additive — a row with only `text` is still valid, `readLyrics`/`sanitizeLyrics` carry `lines` through when present, and the player renders static text for now. Populating `lines` (manual marking vs. forced alignment) is the deferred fast-follow.

## Deviations

- None from the approved plan. Lint is not a gate in this repo (no committed ESLint config; `next lint` prompts interactively), so verification relied on `tsc --noEmit`, a full `next build`, and a DEMO-mode runtime smoke test.

## Deferred (unchanged from 09-CONTEXT)

Karaoke lyric-sync feature and its timing-entry method; collaborator cross-discovery links in public credits; Export Pack; royalty/payout implications of visitor resharing; private playback-room enhancements.
