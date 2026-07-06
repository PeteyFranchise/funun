# Phase 9: Rich Member Profile - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-06
**Phase:** 9-Rich Member Profile
**Areas discussed:** Share entry points & mechanism, Lyrics & credits surfacing, "Playlist" scope, URL / route strategy

---

## Pre-discussion correction

Before the structured discussion began, investigating the user's reference design file (`artist-profile.html`) against the codebase revealed the phase's original framing was wrong: a public MP3 player already exists (`/r/[projectId]`), already gated by `is_public`, already streaming only the "share" MP3 (never the master WAV). The real gap was that it reuses the same `PlaybackView` component as the owner's private playback room (`playback.html`'s domain), over-exposing credits/splits, metadata, and a master/stems toggle to public visitors. This reframing shaped every area below.

---

## Share entry points & mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Web Share API + clipboard fallback | Native OS share sheet on supported browsers; clipboard copy fallback on desktop | ✓ |
| Custom share modal with platform icons | Hand-built modal with explicit per-platform buttons | |
| Copy-link only | Single button, clipboard only | |

**User's choice:** Web Share API + clipboard fallback

| Option | Description | Selected |
|--------|-------------|----------|
| URL + short pre-filled caption | e.g. "Listen to 'Paper' by Maya Reyes on Funūn → [link]" | ✓ |
| Bare URL only | Just the link | |

**User's choice:** URL + short pre-filled caption, track-focused only (not cross-promoting the full profile)

| Option | Description | Selected |
|--------|-------------|----------|
| Brief toast notification | "Link copied!" toast | ✓ |
| Button text changes | Button relabels to "Copied!" | |

**User's choice:** Brief toast notification

| Option | Description | Selected |
|--------|-------------|----------|
| Visitors can share too | Fans resharing supports organic reach | ✓ (conditional) |
| Owner only | Only the artist sees Share | |

**User's choice:** Visitors can share too, but explicitly gated by an artist-controlled toggle — user's own words: "if the artist allows it because I don't want to get into royalty payouts yet."
**Notes:** This surfaced a real product concern (royalty/payout implications of visitor-driven sharing) that the user deliberately wants deferred, not designed now.

| Option | Description | Selected |
|--------|-------------|----------|
| One global setting | Single toggle covers everything | ✓ (refined) |
| Per-release setting | Granular per-project control | |

**User's choice:** One global setting, refined to: "only for released tracks that are placed into a Now Playing section of the app as a project or release" — i.e., scoped to already-`is_public` releases, which matches the existing `/r/[projectId]` gate anyway.

| Option | Description | Selected |
|--------|-------------|----------|
| Share button simply isn't shown | No button when resharing is off | ✓ |
| Button shows but explains why | Disabled state with explanation | |

**User's choice:** Share button simply isn't shown

| Option | Description | Selected |
|--------|-------------|----------|
| Track-focused only | Caption stays about the song | ✓ |
| Include profile link too | Caption cross-promotes the full profile | |

**User's choice:** Track-focused only

| Option | Description | Selected |
|--------|-------------|----------|
| One toggle covers both | Single setting for per-track and profile-level share | ✓ |
| Separate toggles for each | Independent controls | |

**User's choice:** One toggle covers both

---

## Lyrics & credits surfacing

| Option | Description | Selected |
|--------|-------------|----------|
| Slide-up panel | Panel slides over the player, Spotify/Apple Music style | ✓ |
| Separate full-screen view | Distinct route, mini-player continues | |
| Inline below transport controls | Always visible, no toggle | |

**User's choice:** Slide-up panel

| Option | Description | Selected |
|--------|-------------|----------|
| Accessible any time via overflow menu | No dependency on playback completion | ✓ |
| Auto-surface at end of playback | Spotify-style post-song credits | |

**User's choice:** Accessible any time via overflow menu

| Option | Description | Selected |
|--------|-------------|----------|
| Names + roles only | No split percentages shown publicly | ✓ |
| Names + roles + profile link | Same, plus links to collaborator's own profile | |

**User's choice:** Names + roles only (option 1), with a note: "we need to figure out how to drive cross-discovery between artists/collaborators on Funūn at some point so make that a note" — captured as a deferred idea, not built now.

| Option | Description | Selected |
|--------|-------------|----------|
| Existing data is enough | No new migration needed | ✓ |
| Something's missing | User would describe a gap | |

**User's choice:** Existing data is enough (for the names/roles/static-text baseline — see the lyrics-sync follow-up below, which did surface a real gap)

| Option | Description | Selected |
|--------|-------------|----------|
| Hide the lyrics button entirely | No affordance when lyrics are empty | ✓ |
| Show it disabled/grayed | Visible but non-functional | |

**User's choice:** Hide the lyrics button entirely

| Option | Description | Selected |
|--------|-------------|----------|
| Static text for now | No new schema needed | |
| Sync highlighting | Karaoke-style, needs new timestamp schema | ✓ (then refined) |

**User's choice:** Sync highlighting was the actual preference. Follow-up question then asked how timestamps get created:

| Option | Description | Selected |
|--------|-------------|----------|
| Manual entry by the artist | Artist marks timing per line | |
| Automated alignment | AI/forced-alignment service | |
| Structure the schema now, build the timing UI later | Add the data shape now, ship static display first | ✓ |

**User's choice:** Structure the schema now, build the timing UI later — sync highlighting itself and the timing-entry method are both deferred as a fast-follow.

| Option | Description | Selected |
|--------|-------------|----------|
| View credits + View lyrics + Copy link | Consolidated overflow menu | ✓ |
| Just View credits — lyrics gets its own icon | Lyrics as a primary, always-visible affordance | |

**User's choice:** View credits + View lyrics + Copy link

---

## "Playlist" scope

| Option | Description | Selected |
|--------|-------------|----------|
| Existing multi-track releases | EP/album, already fully supported | ✓ |
| New cross-project playlist concept | New table/UI, real new scope | |

**User's choice:** Existing multi-track releases — no new data model needed.

---

## URL / route strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Keep /r/[projectId] | Preserves existing Wave 3 curator pitch email links | ✓ |
| New route (e.g. /u/[handle]/p/[releaseId]) | More "branded" but breaks existing links | |

**User's choice:** Keep /r/[projectId]

| Option | Description | Selected |
|--------|-------------|----------|
| Keep private room as-is | No changes to /vault/[projectId]/play | |
| Also needs updates | Something about the private room should change | ✓ (redirected) |

**User's choice:** User asked to open a separate, dedicated planning discussion about the private playback room right now, rather than answering within Phase 9's scope. Resolved via a sequencing question: finish Phase 9's CONTEXT.md first, then start fresh on the playback room as its own discussion (it's a Wave 1 Sound Vault concern, not a Phase 9 requirement).

---

## Claude's Discretion

- Exact visual layout/animation of the lyrics slide-up panel — follow `app.css` motion tokens.
- Exact shape of the new timestamped-lyrics schema — informed by whichever timing-entry method gets decided later.
- Toast notification component/pattern for share-link-copied confirmation.

## Deferred Ideas

- Export Pack (`playback.html`'s "Export pack" button) — revisit after the private Playback room is solid.
- Private playback room enhancements (`/vault/[projectId]/play`) — separate discussion, next.
- Royalty/payout implications of visitor resharing — deliberately not designed now.
- Collaborator cross-discovery (linking credited names to their own Funūn profile) — not built now.
- Lyric sync highlighting + timing-entry method (manual vs. automated) — schema shape added now, feature is a fast-follow.
