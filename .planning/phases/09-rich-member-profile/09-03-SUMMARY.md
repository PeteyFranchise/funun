---
phase: 09-rich-member-profile
plan: 03
subsystem: public-playback
tags: [player, public-share, lyrics, credits, resharing]
dependency-graph:
  requires: [09-01b]
  provides: [PublicPlaybackView, PublicTrackView, LyricsPanel]
  affects: ["app/r/[projectId]/page.tsx"]
tech-stack:
  added: []
  patterns:
    - "Public-only sibling component instead of forking a private component (D-01)"
    - "Distinct public track type (PublicTrackView) decoupled from the private TrackView to avoid cross-type leakage of split/splitTotal"
    - "Click-outside dropdown pattern (mousedown listener) reused for the overflow menu"
    - "Web-Share-first, clipboard-fallback share pattern (navigator.share as first sync statement, no leading await)"
    - "Server-side omission (not CSS-hiding) of a UI affordance gated by a boolean column"
key-files:
  created:
    - components/vault/PublicPlaybackView.tsx
    - components/vault/LyricsPanel.tsx
  modified:
    - "app/r/[projectId]/page.tsx"
decisions:
  - "PublicTrackView is a standalone exported type (no split/splitTotal) rather than a subset/Omit<> of PlaybackView.TrackView, per the plan's Warning-1 resolution (option c) — keeps the private and public track shapes fully decoupled"
  - "Release type (Single/EP/Album) for the player's eyebrow label is derived client-side from track count (1 = Single, <=6 = EP, else Album) since no releaseType prop/data was in scope for this plan"
  - "avatarUrl/monthlyListeners/verified are optional PublicPlaybackView props (not wired from page.tsx in this plan) — forward-compatible slots per the plan's 'if available' guidance, omitted from the meta block when absent"
  - "Credits list (View credits) renders as a centered modal overlay rather than an inline dropdown panel, since no existing analog dictated its exact shape beyond 'names+roles only, no split'"
metrics:
  duration: 25min
  completed: 2026-07-12
status: complete
---

# Phase 9 Plan 3: Public Playback Split Summary

Split the public share player from the owner's private working room: a brand-new `PublicPlaybackView` stream-only component (with overflow menu for credits/lyrics/copy-link) plus a `LyricsPanel` slide-up sheet now render at the unchanged `/r/[projectId]` URL, while `PlaybackView.tsx` and the owner's `/vault/[projectId]/play` route stay byte-identical.

## What Was Built

- **`components/vault/PublicPlaybackView.tsx`** — a genuinely new `'use client'` sibling component (not a fork of `PlaybackView`), exporting a distinct `PublicTrackView` type (`credits: {name;role}[]`, no split/splitTotal, plus per-track `lyrics: string | null`). Renders the artist-profile.html-style now-playing screen: app bar (back chevron, "NOW PLAYING" label, overflow ⋯ trigger), 560px hero art with scrim gradient, meta block (FUNŪN pill, release-type eyebrow, 58px/900 title, artist row with optional avatar/verified-check/monthly-listeners), a simple 6px click-to-seek scrub bar (no waveform), a 78px gradient play-circle transport row, an "allow-resharing"-gated Share button, and a "More from {Artist}" up-next list with a `gtext` + equalizer-glyph active-row treatment. The overflow menu (click-outside-to-close, reusing `CollaboratorPicker`'s mousedown pattern) offers View credits (names+roles only, opens a small modal — no split % anywhere), View lyrics (omitted entirely when the active track has no lyrics), and Copy link (clipboard + "Link copied!" label swap, no toast library).
- **`components/vault/LyricsPanel.tsx`** — a static lyrics bottom sheet (`open`/`onClose`/`trackTitle`/`lyricsText` props), covering ~78% of viewport height, sliding up/down over 280ms ease-out with a `prefers-reduced-motion` cross-fade fallback. Dismissible via the drag-handle, the close button, or a scrim tap — all three wired to `onClose`. Renders `lyricsText` as static newline-split paragraphs only; `lyrics.synced` (D-13's forward-compatible schema field) is intentionally not read or highlighted this phase.
- **`app/r/[projectId]/page.tsx`** — the render swapped from `<PlaybackView>` to `<PublicPlaybackView>`. `toTrackViews()` now returns `PublicTrackView[]`: dropped `isrc`/`iswc`/`bpm`/`language`/`instrumentalUrl`/`hasStems`/`stemsUrl`/`splitTotal` from both the Supabase `select()` and the projection, stripped `split` from each credit entry (names + role labels only), and added a per-track `lyrics` field via `readLyrics(t.metadata)?.text ?? null`. The `artist_profiles` select now also fetches `allow_resharing`, defaulting to `false` when null/absent, and passes it through as `allowResharing`. The `is_public` gate, service-client signed-URL mint (`createSignedUrls`, 2-hour expiry), and artist-name lookup are unchanged.

## Deviations from Plan

None — plan executed exactly as written. All three tasks' acceptance criteria verified via the exact grep/tsc/build commands specified in the plan (see Self-Check below).

## Known Stubs

None. Every rendered field is backed by real data already returned by `toTrackViews()`/the existing signed-URL mint — no hardcoded empty arrays, placeholder text, or unwired props feeding the UI.

## Threat Flags

None. This plan's implementation matches the plan's own `<threat_model>` register exactly:
- T-09-08 (owner-only detail leakage) — mitigated: no Master/Stems toggle, waveform, ISRC/ISWC/BPM table, or split % anywhere in `PublicPlaybackView.tsx`/`LyricsPanel.tsx`; only `audio_file_url` (share MP3) is signed, `metadata.master` is never read.
- T-09-09 (draft/private streaming) — mitigated: the existing `is_public` gate in `page.tsx` is unchanged.
- T-09-10 (visitor re-enabling Share) — mitigated: the Share button is omitted server-side (`{allowResharing && (...)}` around the JSX, not a CSS class) when `allow_resharing` is false/null.
- T-09-11 (signed-URL replay) — accepted per plan, no change to the existing 2-hour expiry.

No new network endpoints, auth paths, or schema changes were introduced — this plan only swaps a rendered component and narrows a data projection.

## Self-Check: PASSED

- `components/vault/PublicPlaybackView.tsx` — FOUND
- `components/vault/LyricsPanel.tsx` — FOUND
- Commit `936834b` (PublicPlaybackView) — FOUND in `git log`
- Commit `4f8dde6` (LyricsPanel) — FOUND in `git log`
- Commit `f6cca5a` (page.tsx render swap) — FOUND in `git log`
- `grep -Ec "import .*['\"](@/components/vault/PlaybackView|\./PlaybackView)['\"]" components/vault/PublicPlaybackView.tsx` → `0`
- `grep -Ec "reduced-motion|prefers-reduced|motion-reduce" components/vault/LyricsPanel.tsx` → `2`
- `grep -c "PublicPlaybackView" "app/r/[projectId]/page.tsx"` → `2`; `grep -Ec "<PlaybackView" "app/r/[projectId]/page.tsx"` → `0`
- `grep -Ec "from '@/components/vault/PlaybackView'" "app/r/[projectId]/page.tsx"` → `0`
- `grep -c "allow_resharing" "app/r/[projectId]/page.tsx"` → `2`
- `git diff --stat` shows no changes to `components/vault/PlaybackView.tsx` or `app/(artist)/vault/[projectId]/play/page.tsx`
- `npx tsc --noEmit` → clean (no output)
- `npm run build` → succeeded, `/r/[projectId]` route compiled
