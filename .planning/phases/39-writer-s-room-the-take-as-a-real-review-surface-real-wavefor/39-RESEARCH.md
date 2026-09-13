# Phase 39: Writer's Room — the take as a real review surface - Research

**Researched:** 2026-09-12
**Domain:** Client-side audio waveform rendering, timed/range comment schema, per-viewer private
markers, keyboard-driven media transport, Postgres RLS/column-grant design on an existing
Supabase/Next.js 15 stack
**Confidence:** HIGH (grounded in direct code inspection of every file this phase touches; the
one external claim — `preservesPitch` browser support — is CITED against MDN)

## Summary

Phase 39 is a refinement of code that already exists and already works in production for an
adjacent surface. `lib/catalogue/record-over-beat.ts`'s `waveformPeaks()` and
`lib/catalogue/level-match.ts`'s `analyzePlaybackLevels()` already decode audio client-side via
the Web Audio API in production (`RecordOverBeatStudio`, `VersionComparisonPanel`'s level-match
button). `work_version_comments` (migration 160) already has the exact validated-RPC + RLS
shape this phase's range-comment work must extend. `work_versions` already accepts direct
authenticated table writes gated only by RLS (no column-grant lockdown) — a materially different,
simpler shape than `work_version_comments`'s revoke-and-column-grant pattern, and the one peaks
storage should follow.

The most consequential finding is that **the phase's own stated premise for Priority Unknown #1 is
built on a number that does not apply to this subsystem.** `docs/design/WRITERS-ROOM-WAVEFORM-NOTES-2027.md`,
the ROADMAP entry, and 39-CONTEXT.md's D-01 all frame the problem as "large uploaded mixes up to
250MB" needing a server-side fallback because client decode is infeasible at that size. The 250MB
ceiling is real, but it belongs to `lib/storage/index.ts`'s `MAX_AUDIO_SIZE` — the **Sound Vault**
release-track upload path (Wave 1), a subsystem this phase does not touch. The actual ceiling on
every `work_versions` row — hum, record-over, or direct upload — is `MAX_BYTES = 50 * 1024 * 1024`
in `lib/catalogue/audio-mime.ts`, whose own comment reads "Writer's Room per-take ceiling." At
50MB, a full song take (worst case ~4.9 minutes of uncompressed 16-bit/44.1kHz stereo WAV) decodes
client-side via `AudioContext.decodeAudioData()` in low single-digit seconds on ordinary hardware
— the exact same operation `level-match.ts` already performs today, just once instead of twice.
There is no ffmpeg dependency, no server-side audio decode precedent, and no native-binary audio
toolchain anywhere in this codebase today (Lyric Lift ships raw audio bytes to an external
transcription API — it never decodes PCM in Node). Building one for this phase would be new
infrastructure risk for a problem the real file-size ceiling does not create. Recommendation:
decode every take client-side, including plain uploads (the browser already holds the exact `Blob`
being uploaded — decode it before or after the upload call, no re-fetch needed), and skip the
server-side fallback described in D-01 entirely. D-03's lazy backfill-on-first-open path (already
locked, already using the identical client-decode primitive) is the suffrom safety net for the rare
decode failure — it makes a dedicated server path pure marginal redundancy, not a requirement.

Every other question below has a direct, concrete answer grounded in the existing schema and
components: peaks should be a plain `SMALLINT[]` column on `work_versions` with no grant changes
(it inherits the same open RLS-gated shape the label/archived columns already use); range comments
extend `work_version_comments` with a nullable `end_timestamp_ms` following the exact CHECK/RPC/
trigger pattern migration 160 already established; pins must be a dedicated table, never a flagged
row on `work_version_comments`, because that table's SELECT policy is "any room member may read
any row" and a flagged-row design would require a second, easily-misordered RLS policy on the same
table to carve out an exception — the wrong shape for a hard "never visible to anyone else"
constraint.

**Primary recommendation:** Extract peaks entirely client-side (no server fallback), store them as
`SMALLINT[]` on `work_versions` with no new grants, extend `work_version_comments` with a nullable
`end_timestamp_ms` following its existing validated-RPC pattern exactly, give pins their own table
gated by author-only RLS, and implement keyboard shortcuts as a single document-level listener
keyed to the most recently active `<audio>` element rather than one listener per mounted player.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Waveform peak extraction | Browser / Client | — | `AudioContext.decodeAudioData` is a browser-only API; the codebase has no server-side PCM decode path and the real file-size ceiling (50MB) does not require one |
| Peaks persistence (write-back) | API / Backend | Database / Storage | Client posts computed peaks to a Next.js route which writes the RLS-gated `work_versions` row; matches the existing PATCH-label/PATCH-archived pattern |
| Range comment validation | Database / Storage | API / Backend | The existing `validate_work_version_comment()` trigger + `create_work_version_comment()` RPC already own all comment invariants; range adds fields to the same functions, not a new tier |
| Private pins storage + visibility | Database / Storage | API / Backend | Author-only RLS is the correct enforcement point — a client-side "hide from other viewers" filter is not a security boundary and is explicitly forbidden by D-11's hard constraint |
| Keyboard shortcut dispatch | Browser / Client | — | Global transport keys must react to page-level focus state (`document.activeElement`, `isComposing`) that only the browser tier can observe |
| Playback speed / pitch preservation | Browser / Client | — | `HTMLMediaElement.playbackRate` / `.preservesPitch` are element properties with no server role |
| Realtime pin exclusion from presence | Browser / Client | — | The presence channel is a client-authored broadcast (`WriterRoomPresence.tsx`); the guarantee is "pins never call `channel.send()`," enforced by omission in client code, not a server gate |

## Standard Stack

No new external packages are required by this phase (see Package Legitimacy Audit below — the
recommended approach adds zero dependencies). Everything reuses functions and patterns already
present in the working tree.

### Core (existing, reused)
| Module | Purpose | Why it's the standard here |
|--------|---------|------------------------------|
| `lib/catalogue/record-over-beat.ts` → `waveformPeaks(buffer, barCount)` | Computes normalized peak values from an `AudioBuffer` | Already production-proven in `RecordOverBeatStudio`; CONTEXT.md explicitly forbids writing a second peaks function |
| `lib/catalogue/level-match.ts` → `decodeRms`'s `AudioContext.decodeAudioData` pattern | Client-side audio decode from a fetched URL | Directly reusable pattern for peak extraction from an already-uploaded take's signed URL |
| Supabase `.rpc()` + `SECURITY DEFINER` trigger functions (migration 160) | Server-validated mutation surface for comments | Established, audited pattern for exactly this table; range comments extend it in place |
| Next.js Route Handlers (`app/api/works/...`) | HTTP surface | Existing convention for every catalogue mutation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side peak extraction for uploads | Server-side extraction via `ffmpeg-static` + `fluent-ffmpeg` in a Node runtime route | Technically possible on Vercel (the stack already ships `sharp`, a native binary, proving native deps deploy fine) — but adds a new dependency family, cold-start weight, and `/tmp` scratch-space handling for a problem the real 50MB ceiling does not create. Rejected. |
| `SMALLINT[]` for peaks | `bytea` (packed `Uint8Array`) | Marginally smaller on disk (~200 bytes vs ~424 bytes/row incl. array overhead) but PostgREST/Supabase JS returns `bytea` as an encoded string requiring manual decode at every read call site (list views, comparison panel, both players) — real complexity added for a saving too small to matter at Funūn's row counts. Rejected. |
| `SMALLINT[]` for peaks | `jsonb` (`{"v":1,"peaks":[...]}`) | Buys forward-extensibility (e.g. a future second resolution) at the cost of a slightly larger row and one extra unwrap step everywhere peaks are read; not worth it when the array is fixed-cardinality and versioned by column-add, not by payload shape. Rejected, but noted as the fallback if barCount is ever expected to vary per-row. |
| `SMALLINT[]` for peaks | Normalized child table (`work_version_peaks(version_id, bar_index, value)`) | 200 rows per take instead of 1; every version-list query would need a join or a per-take N+1 to reconstruct one array that is always read/written as a single unit. No legitimate use case here. Rejected outright. |
| Dedicated `work_version_pins` table | Flagged row on `work_version_comments` (`is_pin BOOLEAN`) | Would require `body` to become nullable on a table whose CHECK constraint currently forces 1–2000 chars NOT NULL, would need every existing comment query (mentions, carry-forward eligibility, notification triggers) to filter pins out, and would need a **second** SELECT policy on the same table to carve out "author-only" visibility alongside the existing "any room member" policy — two policies on one table are OR'd, so a mistake in either one leaks a pin. Rejected; see Priority Unknown #6 below. |

## Package Legitimacy Audit

**No external packages are introduced by this phase.** The recommended design reuses
`waveformPeaks()`, `AudioContext`/`decodeAudioData` (browser built-in), and the existing Supabase/
Postgres/Next.js stack. If a planner is tempted to add an audio-processing package (a peak-picker
library, an ffmpeg wrapper, a WAV parser) for the server-fallback path this research recommends
dropping, that addition should be treated as a scope change requiring its own legitimacy check —
none is needed for the recommended plan.

**Packages removed due to [SLOP] verdict:** none — none proposed.
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
Take creation (hum / record-over / upload)
        │
        ▼
Browser holds the take's audio as an AudioBuffer or a Blob
        │
        ├─ hum / record-over ──► AudioBuffer already decoded (existing finishPunch()/render path)
        │                              │
        │                              ▼
        │                     waveformPeaks(buffer, ~200) [existing fn, reused as-is]
        │
        └─ direct upload ──────► Blob about to be uploaded (already in memory,
                                   pre- or post- uploadToSignedUrl())
                                          │
                                          ▼
                                 AudioContext().decodeAudioData(await blob.arrayBuffer())
                                          │
                                          ▼
                                 waveformPeaks(buffer, ~200)
        │
        ▼
POST /api/works/[workId]/versions/complete   (upload path, peaks in the same payload)
   or a follow-up PATCH .../versions/[versionId]  (hum/record-over path, after render)
        │
        ▼
work_versions.peaks SMALLINT[]  (RLS-gated direct write — no RPC needed, matches
                                  the existing label/archived PATCH shape)
        │
        ▼
TimedTrackPlayer / VersionComparisonPanel render real bars from work_versions.peaks
        │
        ▼
If peaks IS NULL on open (legacy take, or the decode above failed):
   show the flat rest-state bar → decode once client-side (same waveformPeaks call)
   → PATCH the peaks back → self-heals for every future viewer (D-03)
```

```
Range comment creation ("Mark span" mode)
        │
Writer presses "Mark span" ──► seek <input type=range> disabled, drag paints a shaded region
        │
Confirm ──► composer opens bound to { startMs, endMs }
        │
POST /api/works/[workId]/versions/[versionId]/comments
        { body, timestampMs: startMs, endTimestampMs: endMs, parentCommentId }
        │
        ▼
create_work_version_comment() RPC (extended with p_end_timestamp_ms)
        │
        ▼
validate_work_version_comment() trigger: existing timestamp_ms bound check,
   PLUS new: end_timestamp_ms IS NULL OR end_timestamp_ms > timestamp_ms,
             end_timestamp_ms <= version duration bound
        │
        ▼
work_version_comments row (end_timestamp_ms nullable — point comments unaffected)
```

```
Private pin (never touches the presence channel)
        │
Writer taps the waveform outside "Mark span" mode while NOT seeking
        │
        ▼
POST /api/works/[workId]/versions/[versionId]/pins  { timestampMs }
        │
        ▼
work_version_pins row, RLS: author_user_id = auth.uid() on every operation
        │
        ▼
GET .../pins returns ONLY the caller's own rows (RLS does the filtering —
   no application-layer "hide other people's pins" logic to get wrong)
        │
        ▼
Promote ──► POST .../comments with the pin's timestampMs, then DELETE the pin row
   (consumption is a delete-on-success, not a soft flag — D-12)
        │
(This flow never calls WriterRoomLiveHandle.broadcast(); no new event name
 is added to the 'lock_changed' | 'lyric_saved' | 'comment_changed' |
 'track_comment_changed' | 'suggestion_changed' union in WriterRoomPresence.tsx)
```

### Recommended file changes (no new top-level modules needed)
```
components/catalogue/
├── TimedTrackPlayer.tsx          # remove WAVE_BARS; render work_versions.peaks; add
│                                  # Mark-span mode, pin drop, keyboard binding, speed control
├── VersionComparisonPanel.tsx    # remove WAVE_BARS; render level-matched peaks (D-02);
│                                  # fix "timed notes" → "timed comments" copy (D-08)
├── RecordOverBeatStudio.tsx      # fix "open timed notes" copy (D-08); call waveformPeaks()
│                                  # on the final rendered mix, not just per-clip preview bars
└── WriterRoomPresence.tsx        # UNCHANGED — pins must add no event to its union type

lib/catalogue/
├── waveform.ts                    # NEW (small): shared client-decode-and-extract helper used
│                                  # by both the upload path and the D-03 lazy-backfill path,
│                                  # wrapping waveformPeaks() + AudioContext so the two call
│                                  # sites (creation-time, backfill-time) share one implementation
├── version-comments.ts           # extend WorkVersionComment/View mapping with endTimestampMs
└── version-upload-client.ts      # call the new decode helper before/around the upload call

app/api/works/[workId]/versions/
├── complete/route.ts             # accept optional peaks in the POST body (upload path)
├── [versionId]/route.ts          # accept a peaks PATCH (hum/record-over + D-03 backfill path)
└── [versionId]/comments/route.ts # accept/return endTimestampMs
└── [versionId]/pins/route.ts     # NEW route: GET (own rows only)/POST/DELETE
```

### Pattern 1: Client-side peak extraction, unified across creation paths
**What:** One helper function decodes an `AudioBuffer` (already available for hum/record-over,
or produced fresh from the upload `Blob`) and calls the existing `waveformPeaks()`.
**When to use:** At take-creation time for every source, and again (self-heal) on first open of
any take whose `peaks` column is still `NULL`.
**Example:**
```typescript
// Source: adapted from lib/catalogue/level-match.ts's decodeRms(), which already
// does exactly this decode step in production for VersionComparisonPanel's level-match button.
export async function extractPeaksFromBlob(blob: Blob, barCount = 200): Promise<number[]> {
  const context = new AudioContext()
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer())
    // waveformPeaks() from lib/catalogue/record-over-beat.ts — reused, not reimplemented
    return waveformPeaks(buffer, barCount).map(peak => Math.round(peak * 100))
  } finally {
    await context.close().catch(() => undefined)
  }
}
```
Scaling to `Math.round(peak * 100)` keeps the stored value in the same 0–100 percent-height range
`WAVE_BARS` already used, so the rendering JSX's `style={{ height: '${height}%' }}` needs no change
beyond swapping the data source.

### Pattern 2: Range comments as an additive nullable column, not a new table
**What:** `end_timestamp_ms INTEGER` nullable on `work_version_comments`, following the exact
shape of `timestamp_ms`'s existing CHECK/trigger discipline.
**When to use:** Every new comment created in "Mark span" mode; `NULL` for ordinary point
comments (the existing 100% of rows today).
**Example:**
```sql
-- Source: pattern matches migration 160's own CHECK style exactly
ALTER TABLE public.work_version_comments
  ADD COLUMN end_timestamp_ms INTEGER,
  ADD CONSTRAINT work_version_comments_end_after_start
    CHECK (end_timestamp_ms IS NULL OR end_timestamp_ms > timestamp_ms),
  ADD CONSTRAINT work_version_comments_end_range
    CHECK (end_timestamp_ms IS NULL OR end_timestamp_ms BETWEEN 1 AND 86400000);
```

### Pattern 3: Author-only RLS for pins (own table)
**What:** A brand-new table whose every policy is `author_user_id = auth.uid()` — no
"OR work_member_tier IS NOT NULL" branch at all, which is what every other Writer's Room table
has and is precisely the branch that must NOT exist here.
**Example:**
```sql
-- Source: pattern is Postgres/Supabase idiomatic own-row RLS; no direct precedent
-- table exists in this codebase's catalogue domain today, so this is a fresh design,
-- deliberately narrower than every existing work_* table's "any room member" SELECT policy.
CREATE TABLE public.work_version_pins (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id        UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  version_id     UUID NOT NULL REFERENCES public.work_versions(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp_ms   INTEGER NOT NULL CHECK (timestamp_ms BETWEEN 0 AND 86400000),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.work_version_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_version_pins_owner_only ON public.work_version_pins
  FOR ALL TO authenticated
  USING (author_user_id = auth.uid())
  WITH CHECK (author_user_id = auth.uid());
-- No SELECT-by-room-membership policy of any kind. This is the entire access model.
```
Room membership is still checked — but at INSERT time, in application code (the same
`resolveWorkAccess(..., 'contribute')` gate every other version-scoped route already calls) —
not by a second RLS policy, so there is exactly one way to read a pins row and it is "you wrote
it."

### Anti-Patterns to Avoid
- **A second SELECT policy on `work_version_comments` for pins:** Postgres OR's multiple
  permissive policies together. A bug in a second policy's `USING` clause silently widens
  visibility on the whole table, including real comments. Use a separate table instead.
- **Decoding the same `AudioBuffer` twice:** `RecordOverBeatStudio` already decodes on
  `finishPunch()`; do not re-fetch and re-decode the audio a second time just to extract peaks —
  extract from the buffer that's already in memory before it's discarded.
- **A peaks column that silently reintroduces `WAVE_BARS`-style constant fallback:** the HARD
  CONSTRAINT is explicit — a missing-peaks state must render the flat rest-state bar (D-03), never
  a hardcoded fake waveform shape.
- **Reapplying `preservesPitch`/`playbackRate` only once on mount:** `VersionComparisonPanel`
  swaps `src` on the same `<audio>` element when a side changes (`changeSide()`); browsers commonly
  reset media-element state on `src`/`load()`, so both properties need reapplication in the
  `onLoadedMetadata` handler, not only at initial mount.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Peak extraction | A second bar-count/RMS/peak-picking algorithm | `lib/catalogue/record-over-beat.ts`'s `waveformPeaks()` | Explicitly forbidden by CONTEXT.md; already production-tuned (0.08 floor, per-channel max) |
| Server-side audio decode | An ffmpeg/native-binary pipeline for the "large mix" fallback | Client-side decode via the same `AudioContext` pattern `level-match.ts` already uses | The real ceiling (50MB) never requires it; building it adds a whole new infra surface (binary packaging, `/tmp`, cold starts) for a case that mostly won't occur |
| Comment mutation validation | A second ad-hoc validation layer in the route handler | Extend the existing `validate_work_version_comment()` trigger + `create_work_version_comment()` RPC | Direct-table-write is already revoked on this table (migration 160); the trigger is the single source of truth for every invariant, and it must gain the new invariants, not a parallel check |
| Pin visibility filtering | An application-layer "don't show me other people's pins" filter on a shared table | RLS on a dedicated table (`author_user_id = auth.uid()`) | A client-side filter is not a security boundary; a server bug or a second surface (e.g. a future export) would leak pins instantly |

**Key insight:** every piece of new logic this phase needs already has a structurally identical
sibling shipped in production somewhere in this same file tree — the job is extension and
consistency, not invention.

## Runtime State Inventory

Not applicable — this is a feature-addition phase (new column, new table, new UI affordances), not
a rename/refactor/migration-of-existing-identifiers phase. No existing string, key, or identifier
is being renamed or moved. Skipping per the trigger condition in the verification protocol.

## Common Pitfalls

### Pitfall 1: Trusting the phase's stated 250MB ceiling
**What goes wrong:** A planner reads D-01/ROADMAP.md's "large uploaded mixes (up to 250MB)" and
designs a server-side extraction pipeline (or worse, gates the whole peaks feature behind an
async job queue) for a problem that doesn't exist at this table's real ceiling.
**Why it happens:** The 250MB figure is real, just misattributed — it is Wave 1's Sound Vault
`MAX_AUDIO_SIZE` (`lib/storage/index.ts`), copied into project-wide docs (`AGENTS.md`,
`.claude/CLAUDE.md`) that don't distinguish it from `work_versions`' separate 50MB ceiling.
**How to avoid:** Cite `lib/catalogue/audio-mime.ts:13` (`MAX_BYTES = 50 * 1024 * 1024`, comment:
"Writer's Room per-take ceiling") as the authoritative number for anything touching
`work_versions`.
**Warning signs:** Any plan task that mentions "ffmpeg," "background job," or "async extraction
queue" for this phase should be re-examined against the real ceiling first.

### Pitfall 2: One keydown listener per mounted `TimedTrackPlayer`
**What goes wrong:** `WorkPage.tsx` can render multiple `TimedTrackPlayer` instances
simultaneously (one per take in the version list). A naive `useEffect` adding
`document.addEventListener('keydown', ...)` inside each instance means every mounted player
responds to every keypress — space bar pauses/plays all of them at once, `[`/`]` navigates
comments on takes the writer isn't even looking at.
**Why it happens:** Each `TimedTrackPlayer` is otherwise self-contained (own `audioRef`, own
comment state), so a per-component listener looks natural.
**How to avoid:** Scope shortcuts to a single "active" player — the one whose `<audio>` element is
currently playing, or the most recently interacted-with one if none is playing — using a small
shared registry (a module-level ref set on `onPlay`/pointer-down, cleared on unmount) rather than
N independent listeners.
**Warning signs:** Pressing space with two takes' comment panels open pauses/plays more than one
audio element.

### Pitfall 3: Suppressing shortcuts only for `<input>`/`<textarea>`
**What goes wrong:** The room's comment composer is a `<textarea>` (fine, caught) but a future
IME composition sequence (e.g. a writer typing in Japanese/Korean/Chinese) can leave
`event.key === 'ArrowLeft'` firing during composition even while focus is technically in a text
field, or a `contenteditable` surface elsewhere in the app slips through a tag-name-only check.
**Why it happens:** A naive check like `if (tagName !== 'INPUT' && tagName !== 'TEXTAREA') handle()`
misses `contenteditable` elements and IME composition state.
**How to avoid:** Check three things before dispatching any shortcut: (1) `document.activeElement`
is not `INPUT`/`TEXTAREA` and does not have `isContentEditable === true`, (2) `event.isComposing`
is false, (3) the key isn't part of an active IME candidate selection (some IMEs fire keydown with
`keyCode === 229` during composition — treat that as "suppress" too).
**Warning signs:** A writer composing a comment finds the take skips backward/forward or the
audio pauses mid-sentence.

### Pitfall 4: Forgetting `preservesPitch` needs reapplication after `src` swap
**What goes wrong:** `VersionComparisonPanel.changeSide()` changes which take's URL is bound to
side A/B's `<audio src={...}>`. If `preservesPitch`/`playbackRate` were only set once at mount,
switching sides at a non-1x speed silently reverts to unity pitch/speed on the new source.
**Why it happens:** Media elements commonly reset several playback-adjacent properties on a new
`src`/implicit `load()`.
**How to avoid:** Reapply both properties in the `onLoadedMetadata` handler (which already exists
on every `<audio>` in this codebase) every time it fires, not only on first mount.
**Warning signs:** Speed control shows "0.75x" in the UI but audio plays at normal pitch/speed
after a take switch.

### Pitfall 5: Carried range comments silently losing their span
**What goes wrong:** The existing `review_work_version_comment_carry()` RPC clamps a carried
point comment's `timestamp_ms` with `LEAST(source.timestamp_ms, duration_bound)`. Applied
naively to a range comment, the same `LEAST()` clamp on `end_timestamp_ms` alone (without also
checking `timestamp_ms` itself) can produce a carried row where `end_timestamp_ms <= timestamp_ms`
— violating D-07's "still offered but flagged," and potentially the new CHECK constraint outright
(causing the whole carry-forward INSERT to fail for every comment in the batch, not just the
one with the out-of-range span).
**Why it happens:** The existing clamp logic was written for a single scalar; a span has two
values whose *relationship*, not just their individual bounds, must be preserved or explicitly
flagged.
**How to avoid:** Compute the carried span's clamp explicitly: if `timestamp_ms` (the in-point)
itself exceeds the new take's duration, don't silently clamp it into validity — carry the comment
with a `needs_reposition`-style flag (new column or a derived read-time computation) per D-07,
never coerce it into a technically-valid but musically-wrong span.
**Warning signs:** A jest test asserting one comment's carry-forward inadvertently causes the
whole `review_work_version_comment_carry()` call to raise `work_version_comments_end_after_start`
and roll back every other comment's carry in the same batch.

## Code Examples

### Suppressing shortcuts while any typing surface holds focus
```typescript
// Source: standard DOM focus-state check; no direct precedent in this codebase today
// (TimedTrackPlayer's take-rename <input> only has its own local onKeyDown, not a
// page-level listener) — this is the missing piece D-16 requires.
function shouldSuppressShortcut(event: KeyboardEvent): boolean {
  if (event.isComposing || event.keyCode === 229) return true
  const active = document.activeElement
  if (!active) return false
  const tag = active.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return (active as HTMLElement).isContentEditable === true
}
```

### Reapplying preservesPitch/playbackRate on every loadedmetadata
```typescript
// Source: MDN HTMLMediaElement.preservesPitch (Baseline "widely available" since Dec 2023);
// webkitPreservesPitch kept alongside for older WebKit/iOS Safari per MDN's compatibility note.
function applyPlaybackShape(audio: HTMLAudioElement, rate: number) {
  audio.playbackRate = rate
  audio.preservesPitch = true
  ;(audio as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true
}
// Call this both immediately after changing `rate`, AND inside every onLoadedMetadata
// handler — the second call is the one that fixes Pitfall 4 above.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `WAVE_BARS` hardcoded 48-value array, identical for every take | Persisted per-take `peaks` computed from the real `AudioBuffer` | This phase | A writer can finally see where the chorus is, or that v3 clips louder than v2 |
| Prefixed `webkitPreservesPitch`-only pitch handling | Unprefixed `preservesPitch` is Baseline-available (MDN: widely available since Dec 2023) across Chrome/Edge/Firefox/Safari | ~Dec 2023 | Safe to set `preservesPitch` directly; keep the webkit-prefixed alias only as a defensive no-op for older WebKit builds already in the wild on some devices |

**Deprecated/outdated:** the 2027 design doc's "Waveform Notes"/"Track Notes" naming question is
settled by D-08 as neither — "timed comment" / "range comment" / "section comment," with "Studio
Notes" unchanged as the surface name, not a record type.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Modern Safari (iOS/macOS, current field population) supports unprefixed `preservesPitch` reliably enough that the `webkitPreservesPitch` fallback is defensive-only, not load-bearing | Priority Unknown #3 / Code Examples | If a meaningful slice of the artist base is on an older iOS/Safari version, pitch preservation could silently fail at 0.5x on those devices specifically; low risk given MDN's "Baseline: widely available since Dec 2023" classification, but not verified against Funūn's actual device telemetry |
| A2 | A ~200-value `SMALLINT[]` scaled 0–100 (matching the existing `WAVE_BARS` percent-height convention) gives visually sufficient waveform resolution for a single-take player | Standard Stack / Pattern 1 | If writers want finer visual detail (this is explicitly the pressure valve D-15's rationale assumes zoom will absorb, and zoom is out of scope), 200 bars may look coarse on a wide desktop viewport; cheap to bump the constant later since it's just a `barCount` argument, no schema change needed unless bar count itself becomes per-row-variable |
| A3 | Client-side decode of every direct-upload `Blob` at creation time (rather than the stated server-side fallback) fully satisfies D-01's "a writer never sees a placeholder for a take they just made" for the near-100% of takes at or under the real 50MB ceiling | Summary / Pattern 1 | If some fraction of decode attempts silently fail in specific browsers for specific codecs (historically FLAC-in-Safari has been inconsistent), those takes fall through to D-03's lazy backfill — which is already the locked, accepted fallback UI, so the downside is bounded to "briefly shows the flat rest-state bar," not a broken feature |

## Open Questions

1. **Minimum viable span length (Claude's Discretion in CONTEXT.md).**
   - What we know: CONTEXT.md flags "guard against accidental sub-100ms spans" as an open
     discretion item, not a locked decision.
   - What's unclear: whether 100ms is the right floor or whether it should scale with a take's
     total duration (a 100ms span is a bigger fraction of a 10-second snippet than a 4-minute mix).
   - Recommendation: use a flat 250ms floor at the drag-interaction layer (client-side, before the
     POST fires) — generous enough to filter out a single accidental tap-drag, small enough not to
     block a legitimately tight vocal-comp span; document it as a named constant so it's a one-line
     change if usage shows it's wrong.

2. **Whether `end_timestamp_ms` needs its own bound against the take's `duration_seconds`, or
   whether `timestamp_ms`'s existing bound (checked against `duration_seconds` in the trigger)
   is sufficient once the new `end > start` constraint exists.**
   - What we know: `validate_work_version_comment()` already checks `NEW.timestamp_ms >
     ceil(v_version.duration_seconds * 1000)` and raises `comment_timestamp_out_of_range`.
   - What's unclear: whether that same check needs an explicit twin for `end_timestamp_ms`, or
     whether the table-level CHECK (`end_timestamp_ms BETWEEN 1 AND 86400000`) plus the trigger's
     existing start-point bound is sufficient in practice (an end-point past the take's actual
     duration but under the 86400000ms absolute ceiling would currently slip through).
   - Recommendation: add the twin check explicitly in the trigger (mirroring the existing
     `timestamp_ms` duration check) rather than relying on the coarser absolute-ceiling CHECK
     alone — the planner should treat this as a required trigger edit, not an optional one.

## Environment Availability

Not applicable in the "external tool/service" sense this section is designed for — every capability
this phase needs (Web Audio API, Postgres, Next.js Route Handlers, Supabase RLS) is either a
browser built-in already exercised in production by sibling code, or the existing project database/
framework. No new CLI, runtime, or service dependency is introduced. See Package Legitimacy Audit
above for the explicit "no new packages" statement, which is the closest equivalent finding for
this phase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (existing project-wide config, `jest.config.js`) |
| Config file | `jest.config.js` (repo root) |
| Quick run command | `npx jest lib/catalogue/waveform.test.ts lib/catalogue/version-comments.test.ts` (once those files exist) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
(No requirement IDs are pre-assigned to this phase — CONTEXT.md's D-01..D-18 are the requirement
set per the phase's own framing. Mapped by decision ID.)

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|--------------|
| D-01/D-03 | `waveformPeaks()` output shape and scaling stay stable when wrapped by the new decode helper | unit | `npx jest lib/catalogue/record-over-beat.test.ts` | Yes — extend existing file |
| D-02 | Level-matched peaks in `VersionComparisonPanel` reflect `analyzePlaybackLevels()`'s volumes, not raw peaks | unit | `npx jest lib/catalogue/level-match.test.ts` | ✅ Yes |
| D-04/D-06/D-07 | Range-comment CHECK constraints (`end > start`, duration bound) and carry-forward clamping | unit (pure logic twin) + migration content test | `npx jest __tests__/migration-224-writer-room-take-review.test.ts` (new file, follows the numbered migration-test convention) | ❌ Wave 0 — new test file |
| D-10/D-11/D-12/D-13 | Pin RLS: author can read/write own rows; a second authenticated user gets zero rows for the same `version_id`; promotion deletes the pin | RLS smoke (SQL, run against a local/staging Supabase instance — the pattern this repo's `31.2-01`/`25-07` production security smokes already use) | Manual/scripted smoke checklist, not a pure jest unit (RLS cannot be exercised meaningfully without a real Postgres role context) | ❌ Wave 0 — new smoke checklist |
| D-14/D-15/D-16 | Keyboard shortcuts suppressed while any input/textarea/contenteditable holds focus; `[`/`]` navigate; two mounted players don't double-fire | unit (pure `shouldSuppressShortcut()` logic) + component test for the "active player" registry | `npx jest components/catalogue/TimedTrackPlayer.test.tsx` (new) | ❌ Wave 0 |
| D-17/D-18 | Speed resets to 1x per take; `preservesPitch` reapplied on `loadedmetadata` | component test asserting `audio.playbackRate`/`audio.preservesPitch` after simulated `src` change | `npx jest components/catalogue/VersionComparisonPanel.test.tsx` | ✅ Partial — file likely exists; extend |

### Sampling Rate
- **Per task commit:** the relevant file's quick-run jest command above.
- **Per wave merge:** `npm test` (full suite) + `npx tsc --noEmit` (per this repo's own
  "no build while dev server runs" convention — never `npm run build` during active development).
- **Phase gate:** full suite green, plus the RLS pin-visibility smoke run manually against a real
  Supabase project (local or staging) before migration 224 is applied in production, exactly
  like the six-account adversarial smoke Phase 38's D-48 RLS branch required.

### Wave 0 Gaps
- [ ] `lib/catalogue/waveform.ts` + `lib/catalogue/waveform.test.ts` — the new shared
      decode-and-extract helper (Pattern 1) and its unit coverage
- [ ] `__tests__/migration-224-writer-room-take-review.test.ts` for the `end_timestamp_ms` ALTER
      and updated trigger, following the numbered migration-test convention
- [ ] A pins RLS smoke checklist (author-only visibility, cross-author zero-rows, promotion
      deletes the pin) — this cannot be a pure jest unit test since RLS requires a real Postgres
      role boundary
- [ ] `components/catalogue/TimedTrackPlayer.test.tsx` if it does not already exist — needed for
      the "active player" keyboard-scoping registry and shortcut-suppression logic

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Unaffected — this phase adds no auth surface |
| V3 Session Management | No | Unaffected |
| V4 Access Control | Yes | Author-only RLS on `work_version_pins` (own table, no room-membership OR-branch); existing `is_work_owner`/`work_member_tier` gate extended, not weakened, on `work_version_comments` |
| V5 Input Validation | Yes | Zod schema extension for `endTimestampMs` at the route layer (mirrors the existing `CommentBodySchema`); DB-level CHECK constraints as the authoritative backstop (never trust the client-side "Mark span" mode alone) |
| V6 Cryptography | No | Not applicable |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| A second RLS policy on `work_version_comments` accidentally exposing a pin-as-flagged-row to other room members | Information Disclosure | Don't do the flagged-row design at all — dedicated table with a single, narrow, author-only policy (Pattern 3) |
| A pin implementation that calls `WriterRoomLiveHandle.broadcast()` "by accident" (e.g. a shared `announceRoomActivity` helper gets reused for pin creation) | Information Disclosure | Code review checkpoint: grep the pin route/component for any call into `broadcast(...)` or `channel.send(...)` before merge — it must be zero |
| Carried range comment bypassing the new `end > start` CHECK via the `review_work_version_comment_carry()` RPC's existing `LEAST()`-only clamp | Tampering (data integrity) | Explicit clamp logic covering both endpoints together, per Pitfall 5, tested against a comment whose in-point already exceeds the new take's duration |
| Client-supplied peaks array trusted verbatim (a malicious client could POST a huge or malformed `peaks` array) | Tampering / Denial of Service | Bound the array server-side: fixed length (reject anything != the agreed `barCount`), each value an integer in `[0,100]`, reject otherwise — cheap Zod/array check before the `work_versions` UPDATE |

## Sources

### Primary (HIGH confidence — direct code inspection this session)
- `components/catalogue/TimedTrackPlayer.tsx` (full file read) — `WAVE_BARS`, seek/comment/marker
  logic, take rename `<input>` keydown handling
- `components/catalogue/VersionComparisonPanel.tsx` (full file read) — `WAVE_BARS`, level-match
  flow, side-switching `src` swap behavior
- `lib/catalogue/record-over-beat.ts` (full file read) — `waveformPeaks()`, `encodeWav()`,
  `renderRoughMix()`, `RecordingClip` shape
- `lib/catalogue/level-match.ts` (full file read) — `decodeRms()`/`analyzePlaybackLevels()`
  client-side decode precedent
- `components/catalogue/WriterRoomPresence.tsx` (full file read) — the exact broadcast event
  union pins must never join
- `supabase/migrations/160_writer_room_timed_track_comments.sql` (full file read) — table shape,
  CHECK constraints, RLS policy, `validate_work_version_comment()` trigger,
  `create_work_version_comment()`/`review_work_version_comment_carry()` RPCs
- `supabase/migrations/146_writer_room_section_comments.sql` — confirms this is a sibling table
  (`work_lyric_block_comments`), not the same table as 160. Migration 146 is applied; its deferred
  multi-account UAT remains separate from Phase 39.
- `supabase/migrations/135_works_core.sql`, `136_*.sql` — `work_versions` table shape and its
  plain `FOR ALL` RLS policy (no REVOKE/column-grant lockdown), contrasted with 160's locked-down
  shape
- `app/api/works/[workId]/versions/complete/route.ts`,
  `app/api/works/[workId]/versions/[versionId]/route.ts`,
  `app/api/works/[workId]/versions/[versionId]/comments/route.ts` (all full-file reads) —
  confirms direct-table-write pattern on `work_versions`, RPC pattern on `work_version_comments`
- `lib/catalogue/version-upload-client.ts`, `lib/catalogue/audio-mime.ts`, `lib/storage/index.ts`
  — the `MAX_BYTES = 50MB` (Writer's Room) vs `MAX_AUDIO_SIZE = 250MB` (Sound Vault) distinction,
  confirmed via `grep` across the whole repo for both constants
- `.planning/todos/pending/2026-09-01-writers-room-section-comments-production-activation.md`
  — applied migration 146 and its remaining deferred multi-account UAT
- `docs/design/WRITERS-ROOM-WAVEFORM-NOTES-2027.md`, `.planning/ROADMAP.md` § Phase 39,
  `39-CONTEXT.md` — phase scope and locked decisions
- `package.json` — confirms no ffmpeg/audio-decode/native-binary dependency exists today aside
  from `sharp` (image processing) and `node-id3` (ID3 tag read/write, not PCM decode)

### Secondary (MEDIUM confidence)
- MDN `HTMLMediaElement.preservesPitch` — "Widely available… Baseline… since December 2023,"
  cited via WebFetch this session for the browser-compatibility claim in Priority Unknown #3

### Tertiary (LOW confidence)
- None — every claim in this document traces to either direct code inspection or the MDN citation
  above.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every recommended pattern already exists and runs in production in this
  exact codebase
- Architecture: HIGH — grounded in full-file reads of every component and migration this phase
  touches
- Pitfalls: HIGH — five of five pitfalls are derived from specific code paths read this session,
  not generic advice
- The one genuinely external claim (`preservesPitch` Safari support) is MEDIUM — CITED against
  MDN's Baseline classification, not independently verified against Funūn's own device telemetry

**Research date:** 2026-09-12
**Valid until:** 30 days (stable internal codebase facts) for the schema/architecture findings;
re-verify the `preservesPitch` browser-compatibility claim if this phase's execution slips past
~60 days, since browser Baseline status can still shift meaningfully for edge WebKit versions

## RESEARCH COMPLETE
