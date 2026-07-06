# Phase 9: Rich Member Profile - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 9 delivers the hi-fi public profile (`/u/[handle]`) pixel-faithful to the locked `user-profile.html` design — rich header, role badges, "Open to" chips, stats sidebar, releases grid, Featured spotlight, owner-vs-visitor view switching (PROFILE-01..09). This discussion focused specifically on **PROFILE-08's "Share" action** and the public music-playback experience it points to, since a working player already exists (`/r/[projectId]`) but currently over-exposes internal detail meant only for the artist's own private working room.

**Correction to the original phase framing, discovered mid-discussion:** the public MP3 player is NOT new-build work — `app/r/[projectId]/page.tsx` already exists, gated by `vault_projects.is_public`, and already streams only the "share" MP3 (`tracks.audio_file_url`), never the master WAV (`tracks.metadata.master`). The actual gap is that it currently reuses the exact same `PlaybackView` component as the owner's private playback room (`app/(artist)/vault/[projectId]/play/page.tsx`), so a public visitor today sees the same credits/splits, ISRC/ISWC/BPM metadata, Master/Stems toggle, and file-upload status the owner sees privately — none of which belongs on a public stream-only share link (per `artist-profile.html`'s design intent: a clean "now playing" experience, no file access, no download).

**Explicitly out of scope for this phase** (captured as a deferred idea, not addressed here): the private playback room itself (`playback.html`'s domain — tracklist editing, WAV/stems upload, credits/splits editing, metadata editing, "Export pack") is a Wave 1 Sound Vault concern, not a Phase 9 / Rich Member Profile requirement. The user wants a separate, dedicated discussion on it next.

</domain>

<decisions>
## Implementation Decisions

### Player Split — Public vs. Private
- **D-01:** Build a genuinely separate, clean, public-only "now playing" component for `/r/[projectId]` that matches `artist-profile.html`'s design — stream-only, no file-status, no Master/Stems toggle, no raw ISRC/ISWC/BPM metadata table, no split percentages. The existing full-detail `PlaybackView` component continues to serve the owner's private room (`/vault/[projectId]/play`) unchanged — it is already correct for that context.
- **D-02:** Keep the existing `/r/[projectId]` URL — do NOT introduce a new route. This preserves every link already sent via Wave 3 curator pitch emails (PITCH-02). Only the component rendered at that URL changes, not the URL itself.
- **D-03:** "Playlist" (as in "share the playlist or player itself") means an **existing multi-track release** (EP/album — a `vault_projects` row with its `tracks` array), not a new cross-project playlist concept. No new data model needed for this — the up-next "More from [Artist]" list already covers it.

### Share Action (PROFILE-08)
- **D-04:** Two share entry points: a per-track share (via an overflow `⋯` menu on the public player, matching `artist-profile.html`'s top-bar overflow button) and a whole-profile share (the existing "Share" button stub in `ProfileView.tsx`, owner view). One shared mechanism and one shared on/off toggle covers both (see D-06).
- **D-05:** Share mechanism: native **Web Share API** on supported browsers/devices (opens the OS share sheet — already includes every installed social app, Messages/SMS, Mail, AirDrop, etc.), with **clipboard copy as the fallback** on desktop browsers without Web Share support. Confirm success with a brief toast notification ("Link copied!") on the fallback path.
- **D-06:** Shared link includes a short pre-filled caption, track-focused only (not cross-promoting the full profile) — e.g. `"Listen to 'Paper' by Maya Reyes on Funūn → [link]"`.
- **D-07:** Visitors (not just the owner) can reshare a track/profile they're viewing — this supports organic reach (a fan shares to a friend, who shares to another friend). This is gated by an **artist-controlled global toggle** ("allow others to share my music"), scoped to already-public (`is_public`) releases only — draft/private releases are already unreachable via `/r/[projectId]` regardless. When the toggle is off, the Share button/affordance simply isn't shown to visitors at all (no disabled state, no explanatory message).
- **Explicit product note:** the reshare toggle exists partly so royalty/payout implications of visitor-driven sharing can be deferred — not designed or addressed in this phase.

### Lyrics & Credits (new to the public player, not in original PROFILE-01..09 text but introduced during this discussion)
- **D-08:** Lyrics surface via a **slide-up panel** over the player (Spotify/Apple Music style) — the player keeps running underneath; dismiss returns to the full player view.
- **D-09:** If a track has no lyrics entered (`tracks.metadata.lyrics` empty/null), hide the lyrics affordance entirely — no disabled/grayed button.
- **D-10:** Credits are accessible **any time** via the overflow `⋯` menu (not auto-surfaced only at song end) — simpler to build, no playback-completion detection needed.
- **D-11:** Public credits show **names + roles only** — explicitly NO split percentages (that stays private, consistent with Phase 8's column-privacy work). Linking a collaborator's name to their own `/u/[handle]` profile (cross-discovery) is a deferred idea, not built now.
- **D-12:** Existing data is sufficient for names/roles/lyrics-text — `readComposers()` and `readLyrics()` (`lib/metadata/schema.ts`) already provide what's needed. No new migration required for the D-08–D-11 baseline.
- **D-13 (bigger lift, deliberately deferred to a fast-follow):** Lyrics sync highlighting (karaoke-style, current line highlights as the song plays) was the user's actual preference, but the current `tracks.metadata.lyrics.text` is unstructured plain text with no per-line/word timestamps — sync highlighting requires new schema (a timestamped-lyrics shape). Resolution: **add the timestamped-lyrics data shape in this phase** (so it's ready), but **ship the player with static lyrics display for now**. The timing-entry method itself (manual per-line marking by the artist vs. an automated forced-alignment service) is an open decision, explicitly not resolved here — treat as a fast-follow once decided.
- **D-14:** Overflow (`⋯`) menu contents: **View credits + View lyrics + Copy link** (the last one a manual fallback alongside the primary Share action).

### Claude's Discretion
- Exact visual layout/animation of the lyrics slide-up panel (D-08) — follow `app.css` motion tokens (160-480ms ease-out, no bounce).
- Exact shape of the new timestamped-lyrics schema (D-13) — planner's call, informed by whatever timing-entry method gets decided later; build it forward-compatible with both manual and automated population.
- Toast notification component/pattern for share-link-copied confirmation (D-05) — reuse an existing toast pattern if one exists in the codebase, otherwise Claude's call on a minimal implementation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 9: Rich Member Profile" — goal, requirements PROFILE-01..09, 4 success criteria
- `.planning/REQUIREMENTS.md` §PROFILE-01..09 — full requirement text
- `.planning/PROJECT.md` §"What This Is" / §"Context" — confirms `/r/[projectId]` as existing "Track player... public shareable player, embedded in Featured spotlight / release cards on profiles"

### Design references
- `docs/design/wave-4-social-layer/artist-profile.html` — the target public "now playing" screen (portrait 820×952): app bar with back/overflow, 560px hero art with scrim, `FUNŪN · Artist profile` chip, scrub bar, shuffle/prev/play/next/repeat transport, "More from [Artist]" up-next list. This is what the NEW public component should match.
- `docs/design/wave-4-social-layer/playback.html` — the private working-room screen (3-column: tracklist+files / center player+master-stems-toggle / credits+splits+metadata). This is what the EXISTING `PlaybackView.tsx` / `/vault/[projectId]/play` already implements and should continue to serve, unchanged, for the owner only.
- `docs/design/wave-4-social-layer/user-profile.html` — Phase 9's primary locked design reference for the profile page itself (header, roles, stats, releases grid, Featured spotlight, owner-vs-visitor actions including the "Share" button)
- `docs/design/wave-4-social-layer/README.md` — design tokens, shared shell conventions, interaction/motion guidance

### Codebase integration points
- `app/r/[projectId]/page.tsx` — current public "Now Playing" page; gates on `vault_projects.is_public`; currently renders the shared `PlaybackView` (D-01 replaces this with a new public-safe component, same route)
- `app/(artist)/vault/[projectId]/play/page.tsx` — owner's private playback room; also renders `PlaybackView`; unaffected by this phase (D-01)
- `components/vault/PlaybackView.tsx` — the current full-detail player component (tracklist+files, master/stems toggle, waveform scrub, transport, credits & splits, metadata, persistent mini-player). Continues serving the private room; the public route gets a new sibling component instead of reusing this one.
- `app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts` — confirms the master (`tracks.metadata.master`) vs. share MP3 (`tracks.audio_file_url`) split; the public player must keep using only `audio_file_url`
- `lib/metadata/schema.ts` — `readComposers()`, `readLyrics()`, `LYRICS_MAX` (20,000 chars) — existing data readers to reuse for the new public player's credits/lyrics
- `components/profile/ProfileView.tsx` — existing "Share" button (owner view, line ~213) is currently a dead placeholder (`<button>` with no `onClick`) — D-04/D-05/D-06/D-07 define what it should actually do; also the existing `/r/${r.id}` links from the releases grid (line 79) and Featured spotlight (line 268), which now point at the new public component per D-01/D-02
- `components/tools/PitchCard.tsx`, `components/tools/PitchPlugForm.tsx` — existing `mailto:`/clipboard patterns in the codebase (curator-pitching tool), useful as implementation reference for D-05's clipboard fallback, though this is a different, unrelated flow

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/metadata/schema.ts` (`readComposers`, `readLyrics`) — direct reuse for the new public player's credits/lyrics data, no new reads needed for the D-08–D-12 baseline
- `components/vault/PlaybackView.tsx` — not reused directly for the public player (D-01), but its waveform/scrub/transport implementation patterns are a solid reference to adapt

### Established Patterns
- App-level `is_public` gate on `vault_projects` before rendering any public track/release page (`app/r/[projectId]/page.tsx:70`) — the new public component keeps this same gate
- Master vs. "share" MP3 file separation is already established (`role: 'master' | 'share'` in the audio upload route) — the public player must continue reading only the share file

### Integration Points
- New public player component replaces `PlaybackView` specifically at `app/r/[projectId]/page.tsx` — same route, same `is_public` gate, same data-loading shape (`toTrackViews()`), different rendering
- `ProfileView.tsx`'s dead "Share" button gets wired to the new share mechanism (D-04–D-07); its existing `/r/${id}` links need no change (D-02)
- New timestamped-lyrics schema shape (D-13) will need a small `tracks.metadata` addition — shape is Claude's discretion, but must not conflict with the existing plain-text `lyrics.text` shape (additive, not a breaking change)

</code_context>

<specifics>
## Specific Ideas

- The public player should feel like "any standard streaming player" (user's words) — Spotify/Apple-Music-style now-playing experience, not a metadata/rights tool.
- Sharing is explicitly about letting people "click play and listen," never about granting file/download access — this boundary (stream-only, no downloads) is the core design constraint threading through every decision in this phase.
- The user is thinking ahead to royalty/payout questions tied to visitor resharing but deliberately does not want that designed or built now — the artist-controlled toggle is partly there to keep that door closed for the moment.

</specifics>

<deferred>
## Deferred Ideas

- **Export Pack** (`playback.html`'s "Export pack" button — bundling metadata/stems/master/MP3 for a music supervisor) — doesn't exist yet anywhere in the codebase. Revisit after the private Playback room is solid. Belongs to the Sound Vault/playback-room feature area, not Phase 9.
- **Private playback room enhancements** (`/vault/[projectId]/play`, `playback.html`'s full domain) — explicitly out of Phase 9 scope; a Wave 1 Sound Vault concern. The user wants a separate, dedicated discussion on this immediately after this Phase 9 context is written.
- **Royalty/payout implications of visitor resharing** — not designed or addressed; the D-07 toggle exists partly to defer this question.
- **Collaborator cross-discovery** — linking a credited collaborator's name in the public credits view to their own `/u/[handle]` Funūn profile, if they're a member. Not built now (D-11).
- **Lyric sync highlighting** (karaoke-style, current-line highlighting during playback) and its timing-entry method (manual per-line marking by the artist vs. automated forced-alignment) — the data shape is added now (D-13), but the feature itself and how timestamps get created is an open fast-follow decision.

### Reviewed Todos (not folded)
None — no pending todos matched Phase 9's scope (`todo.match-phase` returned zero matches).

</deferred>

---

*Phase: 9-Rich Member Profile*
*Context gathered: 2026-07-06*
