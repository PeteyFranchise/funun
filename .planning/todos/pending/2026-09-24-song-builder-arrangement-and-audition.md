---
created: 2026-09-24T00:00:00Z
title: Song Builder — arrange sections, stack takes, audition as one song
area: writers-room
severity: medium
status: pending
---

## What

A **Song** surface in the Writer's Room where a writer lays the song out in sections,
assigns takes to each one, and plays the result through as a single song — so "does
take 2's verse work against take 10's hook?" is a question you answer by listening
rather than imagining.

Owner-requested 2026-09-24 during the bench-01 design session. Prototype in
`private/bench/index.html` (gitignored) under the **Song** tab.

## The decision the whole feature rests on

**The sections ARE the lyric blocks. There is no second list.**

`lib/catalogue/blocks.ts` already defines eight block types (verse, pre_chorus, chorus,
bridge, intro, outro, hook, custom) and derives their numerals from position. The
arrangement is those blocks, in their order, each given a length in **bars**.

Consequences, all of them free:

- Reordering the words reorders the song.
- `deriveBlockNumerals()` keeps labels honest — the arrangement can never say "Verse 2"
  while the lyrics say otherwise.
- A **linked repeat** (REPEAT RULE) inherits its source's take assignment by default,
  which is almost always what a repeated chorus wants.

A separate section list would drift from the lyrics within a week. Do not build one.

**Do not reuse `take-spans.ts` for this.** Its header is explicit that a span is
"creative context only and never moves automatically between takes" — those are range
*comments*, a different thing.

## What already exists and must not be rebuilt

`lib/catalogue/record-over-beat.ts` is already a clip timeline. It was written for one
beat plus vocal clips; a song builder is the same engine pointed at many takes.

| Existing | What it gives the builder |
|----------|---------------------------|
| `RecordingClip` | id, `startMs`, `durationMs`, `trimStartMs/EndMs`, `muted`, `position`, decoded `AudioBuffer` |
| `clipTimelineWindow()` | returns `{timelineStartMs, sourceOffsetMs, playableDurationMs}` — exactly the `source.start(when, offset, duration)` triple Web Audio needs, including a global `timingOffsetMs` for nudging |
| `clipOverlapsRange()`, `sessionDurationMs()` | what plays in a window; total length |
| `encodeWav(buffer)` | render an `OfflineAudioContext` result to a WAV Blob |
| `DRY_VOCAL_STEM_LEVELS` | `{beatGain: 0, vocalGain: 1}` — the beat/vocal split already modelled |
| `lib/catalogue/level-match.ts` | `rmsFromChannels()`, `levelMatchedVolumes(a, b)` — balances two sources |
| `lib/catalogue/waveform.ts` | `decodeAudioData` → `AudioBuffer` pipeline, already in production |

## Model

### The instrumental is one continuous bed, not a per-section clip

**Song-level**, scheduled once for the whole arrangement. Sections do not own it; they
only **mute** it, and muting is gain automation on that single source
(`gain.setValueAtTime(0, sectionStart)` … `setValueAtTime(1, sectionEnd)`).

Why it matters: a section with no vocal keeps playing rather than dropping out, there
are no seam artefacts at section boundaries, and a real a cappella drop costs nothing.

Warn only when the bed is **shorter than the arrangement** (name the bar it runs out
at). Do **not** warn that a muted bed with no vocal is silent — that is the direct
result of a click the writer just made.

### Vocals are a STACK, not a single slot

Each section holds a **list** of layers, all scheduled at the same `when` so they sound
together:

```
{ take, role, gain }   role ∈ Lead | Double | Harmony | Ad-lib | BGV
```

This is what makes the feature work **with no instrumental at all** — an a cappella
arrangement of stacked takes is a legitimate song, and "None — a cappella" must be a
clean, warning-free state, not a degraded one.

`levelMatchedVolumes()` handles two sources; N layers need a gain per layer (the
prototype uses a slider per layer, Lead at 100% and others defaulting to 60%).

**BGV as a role is not cosmetic** — it touches the BGV clause in
`.planning/deliberations/the-catalogue-unreleased-works.md`. Confirm the rights
treatment before shipping that label.

### Tempo, metre and key belong to the SONG

This was got wrong first time in the prototype and corrected by the owner. Storing bpm
per take makes every take look untempo'd when the song plainly has a tempo.

Correct shape is the **DEFAULT-PERFORMER RULE's** inheritance: a song-level default that
every take inherits, with a per-take override only for a take genuinely cut to a
different click. The only honest warnings are then:

- the song has no tempo at all, or
- a take carries a deliberate override that disagrees with the song (it will drift).

Note the song passport stores `bpm` on `recording_version` (`delivery_safe`, feeds DDEX
and the buyer `bpmMin`/`bpmMax` filters in `lib/deals/catalog.ts`). That is correct for
delivery. The room's working tempo is a song fact that each version **inherits into**
that field — not a conflict, but the inheritance has to be explicit or the data will
carry the same confusion.

## Schema this needs

1. **`'assembly'` as a fourth `VersionSource`** (alongside `hum | recording | upload`).
   A rendered audition must never be mistaken for a human take — the **human-take
   registry behind the Crate vocal rule** depends on that distinction.
2. **Credits on an assembly DERIVE from its contributing takes** and are never
   re-declared. The DEFAULT-PERFORMER RULE says "a credit becomes fact only when a
   version carries that performance" — an assembly genuinely carries them. Without
   derivation you could launder a credit by assembling.
3. **Bar length per lyric block.** Blocks currently have no duration.
4. **Arrangement persistence** — bed, per-section bars, mute, and the layer stack.
   Reconcile against live block ids on load so a deleted block cannot resurrect its
   row; `reconcileWriterRoomLayout()` already does exactly this for layout — reuse it
   rather than writing a second reconciler.
5. **`is_favorite` on work_versions** (separate but adjacent — see the take-browser
   work). Precedent: `collaborators.is_favorite`, `IdeaRating`.

## The constraint that will actually bite

**Tempo agreement.** Two takes at 96 and 98 BPM drift apart inside sixteen bars and no
UI fixes it. It works cleanly where `RecordOverBeatStudio` supplied the click, because
BPM and downbeat are then *known*, not estimated. For hums and free takes, expect
nudging by ear — `clipTimelineWindow()` already accepts a `timingOffsetMs`.

## Scope boundary

**This is not a DAW.** No effects, no automation beyond the bed duck, no per-clip EQ, no
mixing. It answers "does this arrangement work?" and produces a rough assembly that is
labelled as one. The moment it tries to be a mixer it competes with Pro Tools and loses.

## Files

- `private/bench/index.html` — prototype, Song tab (gitignored)
- `lib/catalogue/record-over-beat.ts` — the clip timeline and WAV encoder
- `lib/catalogue/level-match.ts` — level matching
- `lib/catalogue/blocks.ts` — the sections
- `lib/catalogue/versions.ts` — `VersionSource`, numeral derivation
- `lib/catalogue/take-transport.ts` — active-player registry; both the Audition control
  and the docked transport must route through it rather than assuming one player
- `lib/song-passport/schema.ts` — where `bpm` lands for delivery
