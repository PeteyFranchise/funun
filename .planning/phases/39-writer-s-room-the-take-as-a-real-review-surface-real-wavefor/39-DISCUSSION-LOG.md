# Phase 39: Writer's Room — the take as a real review surface - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-12
**Phase:** 39-writer-s-room-the-take-as-a-real-review-surface
**Areas discussed:** What the waveform shows and when · Marking a span without breaking scrub ·
Range comments across takes · Private pins · Keyboard · Playback speed

---

## What the waveform shows, and when

| Option | Description | Selected |
|--------|-------------|----------|
| At creation, server fallback | Hum/record-over compute client-side from the AudioBuffer already held; large uploads fall back to server-side | ✓ |
| Server-side for everything | One code path; costs a worker; brief placeholder after recording | |
| Client-side on first play | Cheapest; first listener (usually the writer who just recorded) sees a flat bar | |

**User's choice:** At creation, server fallback
**Notes:** Scouting found `RecordOverBeatStudio.tsx:397` already decodes an `AudioBuffer`, and
`waveformPeaks()` takes exactly that — so for in-app takes the peaks are free and instant. That
finding reframed the option set; the original two-way framing (server vs first-play) missed it.

| Option | Description | Selected |
|--------|-------------|----------|
| Level-matched in A/B only | A/B playback is already level-matched, so the drawing matches the audio there; raw elsewhere | ✓ |
| Raw peaks everywhere | One array, loudness visible; but you'd see a louder take while hearing a matched one | |
| Raw, with a level-match toggle | Writer chooses; another control in a dense panel, per-viewer state | |

**User's choice:** Level-matched in A/B only
**Notes:** Established the principle *"the picture matches what you are actually hearing."*

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy backfill on first open | Decode once client-side, cache back; self-healing, doubles as retry path | ✓ |
| One-time backfill job | Uniform immediately; a job to write, run and babysit against a live catalogue | |
| Placeholder, new takes only | Cheapest; the existing back catalogue stays flat forever | |

**User's choice:** Lazy backfill on first open
**Notes:** Raised because whatever the fallback is, it must not be the fake `WAVE_BARS` the
phase exists to remove.

---

## Marking a span without breaking scrub

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit "Mark span" mode | Press, seek overlay steps aside, drag paints the span; one model on desktop and mobile | ✓ |
| In/out from the playhead | DAW-style set-in/set-out; no drag at all, keyboard-first | |
| Modifier-drag / long-press | Shift-drag desktop, long-press mobile; two models, undiscoverable | |

**User's choice:** Explicit "Mark span" mode
**Notes:** Scouting found an invisible `<input type="range">` already covering the whole
waveform for seeking (`TimedTrackPlayer.tsx:377`), so plain drag is taken — which surfaced the
in/out option that the original framing hadn't offered.

| Option | Description | Selected |
|--------|-------------|----------|
| Play the span once, loop is a toggle | Predictable on open, repeatable on demand | ✓ |
| Loop automatically while open | Immediate for detail work; keeps playing while you read and type | |
| Seek to the start, don't auto-play | Quietest; an extra press every time, loses the in-context moment | |

**User's choice:** Play the span once, loop is a toggle

| Option | Description | Selected |
|--------|-------------|----------|
| 2 seconds of pre-roll | ~2s before the timestamp/in-point, clamped at 0:00 | ✓ |
| No pre-roll | Exact and literal; no run-in to judge a transition against | |
| Pre-roll, writer-adjustable | off/2s/5s setting; per-viewer preference to persist | |

**User's choice:** 2 seconds of pre-roll
**Notes:** Asked as a parameter of the playback behaviour just chosen, not as new scope. Settles
an open question the 2027 doc had explicitly left ("default pre-roll duration"). Chosen against
tempo: at 90 BPM a bar is ~2.7s.

---

## Range comments across takes

| Option | Description | Selected |
|--------|-------------|----------|
| Span intact, clamped to v2 | Keeps the span; ones whose in-point falls past the end are flagged, not dropped | ✓ |
| Collapse to a point | Always lands somewhere valid; loses the span meaning ranges exist for | |
| Don't offer ranges for carry | Honest (a span is about one performance); unresolved feedback stops following the work | |

**User's choice:** Span intact, with misfits flagged
**Notes:** Owner added that carry-forward generally *"is a nice touch we should keep."*

### Terminology (owner-raised mid-area, not a pre-planned question)

The owner stopped the discussion to say **"we should probably call them comments because it's
confusing — I thought you were talking about musical notes at first."**

| Option | Description | Selected |
|--------|-------------|----------|
| Records only, keep Studio Notes | Every record is a comment; Studio Notes stays as the surface name; copy fix only, no migration | ✓ |
| Rename the surface too | Removes all ambiguity; renames two tables, a component, migration 180's lineage, every string | |

**User's choice:** Records only, keep Studio Notes
**Notes:** Checking first showed the schema already agreed — `work_version_comments`,
`work_lyric_block_comments`, `idea_comments` — and only the copy had drifted. This closed the
2027 doc's open name question ("Waveform Notes" vs "Track Notes") as *neither*.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — quiet "from v1" line | `carried_from_version_id` already stored; explains a comment that predates its take | ✓ |
| No — carried comments read as native | Cleanest surface; no route back to the original thread | |

**User's choice:** Yes — quiet "from v1" line

---

## Private pins

| Option | Description | Selected |
|--------|-------------|----------|
| Wordless | Purely a position; writing a sentence is the friction being removed | ✓ |
| Optional short label | "flat", "check"; survives coming back later, but blurs into a private comment system | |

**User's choice:** Wordless

| Option | Description | Selected |
|--------|-------------|----------|
| Nothing at all | Truly private — no pin, no count, no trace; stays outside the comments doctrine | ✓ |
| Bare count, no content | A light "someone listened" signal; turns a scratchpad into an activity metric | |

**User's choice:** Nothing at all

| Option | Description | Selected |
|--------|-------------|----------|
| Pin is consumed | Becomes the comment and disappears; one marker per moment | ✓ |
| Pin remains alongside | Keeps your listening map; two marks at one timestamp, one invisible | |

**User's choice:** Pin is consumed

| Option | Description | Selected |
|--------|-------------|----------|
| Stay on the take they were dropped on | Scratch about one performance; costs nothing to re-drop | ✓ |
| Offered for carry like comments | Consistent with comments; real machinery for a wordless mark | |

**User's choice:** Stay on the take they were dropped on

---

## Keyboard

| Option | Description | Selected |
|--------|-------------|----------|
| Space + arrows | Web-player conventions; zero learning curve | ✓ |
| Space + arrows + J/K/L | Adds the DAW triad; free muscle memory for producers | |
| J/K/L only | Coherent for an audio tool; space doing nothing reads as broken | |

**User's choice:** Space + arrows

| Option | Description | Selected |
|--------|-------------|----------|
| Comments too | Keys step between comments, seeking with pre-roll; meets the doc's accessibility ask | ✓ |
| Transport only | Fewest bindings; keyboard users can't reach threads | |

**User's choice:** Comments too

### Binding clash (caught after the fact)

Both selected options bound **⇧← / ⇧→** — one to fine 1s nudge, one to comment navigation.

| Option | Description | Selected |
|--------|-------------|----------|
| Comments move to [ and ] | Fine nudge keeps the arrow family; [ ] reads as marker navigation | ✓ |
| Fine nudge moves to , and . | Video-editor frame-step convention; precision leaves the arrow family | |
| Drop the 1s fine nudge | Smallest surface; leaves only 5s steps (~7 bars at 90 BPM) with no zoom to fall back on | |

**User's choice:** Comments move to [ and ]
**Notes:** Decided in favour of keeping fine nudge on the arrows because zoom is deferred, making
the 1s step a writer's only precision tool for placing a comment.

---

## Playback speed

| Option | Description | Selected |
|--------|-------------|----------|
| 0.5 / 0.75 / 1 / 1.5 | Covers transcription, detail, listening, skimming; resets to 1× per take | ✓ |
| 0.75 / 1 / 1.25 | Tiny control; not slow enough to catch words you can't make out | |
| Continuous slider 0.5–2× | Full control; fiddly on a phone, a second slider beside the seek bar | |

**User's choice:** 0.5 / 0.75 / 1 / 1.5

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve pitch | Same key at 0.5×, so intonation stays judgeable; smearing on transients | ✓ |
| Let it drop (tape/varispeed) | No artifacts, classic ear-learning trick; wrong key, can't judge tuning | |

**User's choice:** Preserve pitch
**Notes:** Flagged that browsers default `preservesPitch` to true, so this was a real choice
rather than an inherited default.

---

## Claude's Discretion

- Peak resolution (~200 values/take), storage shape on `work_versions`, exact rest-state visual.
- Minimum usable span length (guard against accidental sub-100ms spans).
- Whether pins live on their own table or as a flagged row, subject to D-11's constraints.
- Shortcut suppression mechanics while an input/textarea/contenteditable holds focus (D-16).
- Exact migration number — migration 224 was reserved during the 2026-09-13 final planning
  cleanup after the production baseline reached 223 and the collision scan passed.

## Deferred Ideas

- Waveform zoom — owner-deferred; revisit only if usage shows writers hitting the ceiling.
- Renaming the Studio Notes surface — its own small phase if ever.
- Shared/team markers; adjusting a posted span without rewriting the comment.
- From the notetracks.com teardown: clickable transcript pane, DAW marker export, stacked
  multi-track lanes, guest reviewer links.
