# Song Lyrics — capture & embed

> Status: Spec / not yet built · Last updated: 2026-06-18

## Goal
Let an artist enter **lyrics per track**, store them inside the song's
metadata, and carry them through everywhere metadata travels — the in-app
metadata views, the embedded audio file (ID3), the sidecar export, and the
one-sheet. Lyrics become a first-class part of a release's metadata, not a
loose note.

## Where lyrics live (data model)
Lyrics are **track-level** and stored in the existing `tracks.metadata`
JSONB (no new column needed), alongside composers:

```jsonc
// tracks.metadata
{
  "composers": [ /* … */ ],
  "lyrics": {
    "text": "Verse 1…\nChorus…",   // plain UTF-8, line breaks preserved
    "language": "en",                // optional; defaults to track.language
    "explicit": false,               // optional advisory flag
    "updated_at": "2026-06-18T…Z"
  }
}
```

- Keep it plain text for v1. Time-synced/LRC lyrics are a later extension
  (add a `synced: [{ ms, line }]` array under the same `lyrics` object).
- Source of truth is the JSONB; nothing else duplicates the lyric body.

### Schema touch points
- `lib/metadata/schema.ts` — add a `TrackLyrics` type to `TrackMetadata`,
  plus `readLyrics(metadata)` / `sanitizeLyrics()` helpers mirroring
  `readComposers` / `sanitizeComposers`.

## Where lyrics are captured (UI)
- **Metadata Studio** — `app/(artist)/vault/[projectId]/metadata/page.tsx`,
  per track: a collapsible "Lyrics" textarea next to the composer/splits
  editor. Autosave to `tracks.metadata.lyrics` via the existing track
  metadata PATCH path.
- Show a character/line count and the explicit toggle. Empty lyrics are
  allowed (lyrics are not a readiness gate).

## Where lyrics embed (the "into the metadata" part)
1. **Embedded audio (ID3)** — `…/tracks/[trackId]/metadata/embed`: write
   the lyric body into the **`USLT`** (Unsynchronised Lyrics) frame with the
   right language code. This is what DSPs and players read.
2. **Sidecar export** — `…/tracks/[trackId]/metadata/sidecar`: include a
   `lyrics` block in the JSON sidecar.
3. **One-sheet** — `…/metadata/onesheet`: optionally render lyrics in a
   collapsible section.
4. **Registration packages** — lyrics are NOT required by PROs/The MLC, so
   they stay out of the CWR/registration views (informational only).

## Readiness / eligibility
- Lyrics are **not** a readiness gate or a direct-overlay eligibility gate
  — they don't affect payout or rights. They're a metadata-completeness
  nicety. (If we later want a "lyrics present" readiness item, it'd be an
  advisory, non-blocking check.)

## Implementation checklist
1. `schema.ts`: `TrackLyrics` type + `readLyrics` / `sanitizeLyrics`.
2. Metadata Studio: per-track Lyrics textarea + explicit toggle, autosave to
   `tracks.metadata.lyrics`.
3. ID3 embed: write `USLT` from `lyrics.text` + language.
4. Sidecar + one-sheet: include the `lyrics` block.
5. (Later) LRC / time-synced lyrics; optional "lyrics present" advisory.

## Open questions
- Do we want a max length cap? (Suggest ~20k chars — long enough for any song.)
- Surface lyrics on the public **Now Playing** / profile views? (Out of scope
  for v1; the player stays clean per the current decision.)
