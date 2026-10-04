# Writer's Room — what belongs in the canvas, and what needs its own tab

**Opened:** 2026-10-04, while scoping the Writer's Room restyle.
**Status:** one question open for the owner (Studio Notes). Everything else below is a
proposed refinement awaiting owner ratification, not a decision already taken.
**Supersedes nothing yet.** Phase 37 decision 001 stands until the owner rules.

---

## Where this came from

The bench (`private/bench/index.html`, gitignored) draws the work page as **seven peer
tabs** — Notes · Chat · Lyrics · Song · Takes · Diary · Splits. The shipped page does
something different, and `LyricsPad.tsx:101-102` states it plainly:

> *"Fixed room modules that may be placed **between lyric blocks**."*

Lyrics are the canvas; Versions, Diary and Studio Notes are interleaved into the lyric
stream (`hybridEnabled`). That is Phase 37 decision 001, owner-ratified 2026-08-30 and
recorded in `sketch-findings-funun`: two-column desktop, single-stream diary on mobile,
*"the diary is the canvas"*.

Framing the bench as "a restyle" would have reversed that silently. It was split out:
**part 1** (cosmetic, three components) shipped separately; **part 2** is this document.

**Owner observation 2026-10-04, which reframed the question:** *"Some of the features
don't work in canvas mode… so we would have to decide which do and which should be their
own tab."*

That is the right question. It is not tabs-versus-canvas. It is a sorting problem, and
the codebase already has the seam.

---

## The test

**Is it anchored to a lyric block, or is it about the whole song?**

`LyricsPad.tsx:68-74` gives the answer for the three things interleaved today:

```ts
export type WriterRoomModule = {
  key: WriterRoomModuleKey
  label: string
  description: string
  content: ReactNode
  empty?: boolean
}
```

**There is no block reference.** A module cannot say which lyric it belongs beside,
because the type has nowhere to put it. And their own descriptions
(`WorkPage.tsx:1443-1485`) confirm what they are:

| module | description in code | scope |
|---|---|---|
| Versions | `"N active takes"` | whole song |
| Diary | `"Chronological song history"` | whole song |
| Studio Notes | `"N open threads"` | whole song |

All three are whole-song surfaces dropped between blocks at arbitrary points, because
the layout had nowhere else to put them.

**That is the "doesn't work in canvas mode" the owner hit.** Not a bug — a category
error. A whole-song surface wedged into a per-block stream has no correct position, so
every position is equally arbitrary.

Meanwhile the genuinely per-block surfaces already exist as their own components:
`LyricCommentsPanel`, `LyricHistoryPanel`, `LyricSuggestionPanel`, `LyricLiftPanel`.
A comment on a line, the history of a line, a suggestion for a line. These are
canvas-native — move them to a tab and they lose their meaning, because the anchor *is*
the content next to them.

---

## The proposed sort

**Stays in the canvas** — answers *"about this line"*: per-block comments, per-block
history, suggestions, lift, per-block authorship, and the AI-entry and re-author nudges.

**Becomes a tab** — answers *"about this song"*: Takes, Diary, Splits, Chat, the Song
builder.

This explains why the bench felt right: it moved exactly the three homeless modules out
and left the lyric stream alone.

### This refines decision 001 rather than reversing it

Worth being precise, because it changes what the owner is being asked to sign.

Decision 001 said *the diary is the canvas*. On the evidence above, the **lyrics** are
the canvas and the diary was never anchored to anything — it had been borrowing the
canvas for want of a home. The correction keeps 001's intent (one continuous read of the
song, not a filing cabinet) while fixing the thing that made it awkward in practice.

**The mobile case still needs deciding on its own.** 001 chose a single stream on mobile
deliberately. Six tabs on a phone is a different object, and "it works on desktop" is not
evidence about the phone. Do not let the desktop answer settle the mobile one by default.

---

## Studio Notes — route by kind, not by surface (owner leaning 2026-10-04)

**Owner:** *"If we do 1, we can still open a thread and view the notes below? I'm leaning
toward this"* — i.e. no catch-all Notes tab; Notes live next to what they are about.

**Threads already work.** `StudioNotes.tsx` is 455 lines with replies, resolve/unresolve
and `StudioNoteThreadView` in the types. Opening a thread and reading its notes is
existing behaviour and survives being nested anywhere. That part of the question is
settled by the code.

### A note is not one thing — there are three kinds

`lib/catalogue/studio-notes.ts` normalizes three sources into one list:

| kind | source row | anchored to |
|---|---|---|
| `song` | `WorkStudioNote` — **the base table** | nothing; the whole song |
| `audio` | `WorkVersionComment` | a version + `timestampMs` (`"2:14 in Take 4"`) |
| `lyrics` | lyric comments | a lyric block |

So today's single "Studio Notes" module is three unrelated things wearing one label — a
`label-integrity-funun` instance, and the reason it has no natural home.

### Decided, subject to ratification

- **`audio` → inside Takes**, beside the waveform. The anchor is audio time and the
  waveform is the only surface where that position is visible and clickable. A note
  reading "2:14 in Take 4" shown away from the waveform makes the reader carry a number
  somewhere else.
- **`lyrics` → the canvas**, beside the block, where `LyricCommentsPanel` already lives.
  It passes the per-block test outright.

### OPEN SUB-QUESTION — where does the `song` kind go?

**This is the one still to settle, and it is bigger than it looks.**

`normalizeSongNote(row: WorkStudioNote)` reads the **base** studio-notes table. A
song-level note is not a leftover category — it is the **ordinary** Studio Note ("we
should re-cut the bridge"), and probably the most common kind. `audio` and `lyrics` are
the specialised ones layered on top.

**Routing it to the Diary was proposed and withdrawn.** Twice wrong: a Studio Note is a
*thread* (replies, resolve state, participants) while the Diary is an *event ledger*
(version chips, sheet events, roster events) — dropping resolvable conversations into a
chronological event list repeats the exact category error this document was opened to
diagnose. And it would route the default note type into the surface least able to hold
it.

Two honest options:

**A — keep a Notes tab, scoped to song-level notes only.** Seven tabs again, but the tab
now has a definition ("notes about the song") instead of being a catch-all, and the
anchored kinds have moved to their anchors. Smaller and more coherent than today's Notes.

**B — put them at the canvas root**, above the first lyric block. If the lyrics are the
canvas, a song-level note is anchored to the song — the canvas root. Keeps six tabs and
song notes stay visible while reading.

*Recommendation: A.* B is elegant but puts a growing thread list permanently above the
lyrics, which fights the "one continuous read" the canvas exists for. Not a strong
preference — worth checking against a real session.

### MUST SOLVE — unresolved notes become harder to see

Whichever option wins, splitting one list three ways loses the single count of what is
outstanding. Today `"N open threads"` is one number for the whole song
(`WorkPage.tsx:1482`). After the split, an unresolved note on an old take is easy to miss
— and an unresolved note is exactly the kind of thing that should nag.

This is a design requirement of the change, not a detail to notice afterwards.
Candidates, none chosen: an unresolved count on the Takes tab label; a line in
`GuidingLine`, which already exists to surface the song's single most important next step
and already has cadence gates; a song-level badge in the work header. Note `GuidingLine`
is deliberately single-step and never stacks, so it can carry *that there is* something
unresolved, not a list of them.

## What is NOT in this document

Each of these is separately scoped and must not be smuggled in behind a layout change:

- **Song builder + Audition** — `2026-09-24-song-builder-arrangement-and-audition.md`.
  Note the Audition engine already ships (Phase 40); the builder does not.
- **Chat + slash commands** — `2026-09-24-actions-slash-commands-in-composers.md`.
- **Splits tab** — zero components exist in `components/catalogue/`. In the bench it is a
  label with nothing behind it: the tab handler's fallback renders
  *"Nothing sketched for 'Splits' yet."*
- **Todos tab** — `2026-09-24-writers-room-todos-tab.md`.
- **Work-page provenance row** — `2026-10-04-work-page-provenance-row.md`.

---

## If the owner ratifies

The work is a real refactor, not a restyle. It touches `WorkPage.tsx` (1,959 lines) and
`LyricsPad.tsx` (994 lines) — the two largest components on the surface users spend the
most time in, and the one place a regression hurts most.

Stage it. Agree the target, then slice it so each slice ships green on its own. A single
branch open for days across both files is the shape most likely to go wrong, and the
marketing-page port is not a precedent here: that was a static document with a freeze
hash to verify against. This has state, interaction and existing tests.

---

## Related

- `.claude/skills/sketch-findings-funun/references/catalogue-hygiene-ui.md` — decisions
  001–006, locked 2026-08-30
- `.planning/deliberations/the-catalogue-unreleased-works.md` — Phase 37 doctrine
- `components/catalogue/LyricsPad.tsx:68-74, :101-102` — the module contract
- `components/catalogue/WorkPage.tsx:1443-1485` — the three module definitions
