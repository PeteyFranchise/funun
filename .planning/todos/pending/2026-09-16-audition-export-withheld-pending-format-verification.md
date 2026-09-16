---
created: 2026-09-16T00:00:00Z
title: Audition export withheld — verify the format, or decide it isn't wanted
area: catalogue
files:
  - components/catalogue/TakeMarkerExport.tsx
  - __tests__/writer-room-take-marker-export-ui.test.ts
  - lib/catalogue/take-export-audition.ts
  - docs/catalogue/AUDITION-MARKER-FORMAT.md
---

## What happened

Phase 40 built the Adobe Audition marker serializer in full, then **withheld it from the UI**
before shipping, per decision E-12's own fallback. Audacity and CSV shipped.

Nothing was deleted. `lib/catalogue/take-export-audition.ts`, its 17 exact-string tests,
`scripts/print-audition-sample.ts` and `docs/catalogue/AUDITION-MARKER-FORMAT.md` all remain in
the codebase and still pass CI.

## Why

The format is corroborated by three independent third-party sources but has **never been checked
against Adobe Audition itself**. Nobody on this project has the software — so the verification
had no date by which it could realistically happen, and "verify it soon" would have meant
shipping indefinitely-unverified.

The failure mode is what settled it. A wrong format here would not error. Audition's second time
column is a **duration** where Audacity's is an **end timestamp**; get that wrong and the file
imports cleanly with every range marker in the wrong place. A writer would sooner doubt their own
memory of where they left a note than suspect the export.

## OWNER DIRECTION 2026-09-16 — support all the major DAWs eventually

This reframes everything below. The question was never **whether** to support a DAW, only **in
what order**. Audition is not on trial; it is simply the one that happens to be built and
unverifiable right now.

So the "does Audition belong at all" framing is settled: **yes, eventually, along with Logic,
Ableton, FL Studio and Pro Tools.** What still matters is sequencing — which format earns the next
round of work — and that is an empirical question about which DAWs beta users actually open, not
a question about Audition.

What that changes in practice:

- **The work already done keeps its value.** `lib/catalogue/take-export-audition.ts`, its 17
  tests, the sample script and the verification doc are a down payment on a format that will ship,
  not a sunk cost on a format that might be dropped.
- **The format pattern is now a template.** Each DAW is a pure renderer in `lib/catalogue/`, one
  entry in `FORMAT_OPTIONS`, one option-count number. Adding Logic should look exactly like
  `take-export-audition.ts` looks — that consistency is worth protecting as the list grows.
- **Verification is the bottleneck, not implementation.** Audition is blocked because nobody here
  can run it. The same will be true of Logic, Pro Tools and FL Studio unless someone with each
  DAW can check a real import. Worth planning for: a format nobody can verify is a format that
  silently corrupts, and that risk repeats per DAW rather than being paid once.
- **E-13 scales badly if unexamined.** Three separately-named options is a clean UI; seven or
  eight is a menu. Worth revisiting the presentation before the list gets long.

Research for a future phase should therefore cover **the remaining major DAWs as a set** — their
marker formats, whether each distinguishes point from range, and crucially who could verify each
one — rather than treating Audition as a one-off question.

## The prior question, now answered by the direction above

**Does Audition belong in this feature at all?**

It arrived via the roadmap and hardened into E-12/E-13 as a locked decision, but:

- Audition is an audio *repair* and post-production tool — podcasts, dialogue cleanup, spectral
  editing. For music production it is uncommon.
- Funūn's Writer's Room users are songwriters and producers. They are overwhelmingly on **Logic,
  Ableton, FL Studio or Pro Tools** — none of which this phase supports.
- No evidence surfaced in the discussion log that a user asked for Audition.

E-12 hedged on whether Audition could be **verified**. Whether it should be there at all may never
have been asked.

**So before re-enabling, ask two or three beta users what they actually open.** If the answer is
Logic, that is the format worth the next round of research, and Audition drops off the list
instead of being verified into permanence.

## To re-enable, if that is the answer

1. Run the eight-step byte-level procedure in `docs/catalogue/AUDITION-MARKER-FORMAT.md` against a
   real Audition install. **Generate the sample with `npm run export:audition-sample --silent`** —
   without `--silent`, npm's run-banner is written into stdout and corrupts the very comparison
   the procedure exists for.
2. Add one entry back to `FORMAT_OPTIONS` in `components/catalogue/TakeMarkerExport.tsx`.
3. Change the option count in `__tests__/writer-room-take-marker-export-ui.test.ts` from 2 to 3.
4. Turn the `INFERRED` markers in the doc and serializer into `CONFIRMED` with a date.

**A trap worth knowing:** that UI test counts option ids by source pattern, so writing the literal
entry syntax into a comment reads as a real option and fails the count. This was hit once already
while withholding it.
