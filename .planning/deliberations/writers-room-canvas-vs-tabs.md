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

## OPEN QUESTION — where do Studio Notes go?

**This is the one the owner needs to settle.**

Studio Notes are pinned to a timestamp in a take — the bench shows *"2:14 in Take 4"*.
So they **are** anchored, but to **audio time**, not lyric position. They fail the
canvas test and pass a different one.

That makes them canvas-native to the **Takes** surface, not to the lyric stream — which
suggests Notes should not be a peer tab at all, but should live **inside Takes**, beside
the waveform they refer to.

If that is right, the answer is **six tabs, not seven**. The bench has Notes and Takes as
separate peers.

**Arguments for Notes inside Takes**
- The anchor is audio time; the waveform is the only surface where that position is
  visible and clickable.
- A comment reading *"2:14 in Take 4"* in a tab with no waveform asks the reader to hold
  a timestamp in their head and go elsewhere.
- It keeps the tab count down, which matters most on mobile.

**Arguments for Notes as its own tab**
- Notes span takes. *"N open threads"* is a whole-song count, and a writer may want every
  unresolved thread in one list regardless of which take it sits on.
- Burying them inside Takes makes open threads easy to miss — and an unresolved note is
  the kind of thing that should nag.
- The shipped module already treats them as whole-song, so this is the smaller change.

**Not resolvable from the code.** It depends on whether a writer thinks *"what's
outstanding on this song?"* (list) or *"what did they say about this take?"* (in place).
That is an owner call, ideally checked against a real session.

---

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
