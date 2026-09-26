# Midjourney briefs — the differentiators carousel

**Captured:** 2026-09-26 · **Status:** section built with placeholders; art is an owner task
**Surface:** marketing page section 04, `#tools` (`private/bench/marketing.html`)
**Owner:** *"another carousel that can showcase Antenna, PitchPlug, and some of the other AI tools…
I would like to ask Midjourney to make cool illustrations, graphics or short videos… I like to call
them differentiators."*

## Three, not twelve — and why

The tool bench has a dozen entries. Most are caption and pitch generators — **DropReady**,
**SoundBait**, **SpotPitch**, **EPK.fyi**, **DistroAdvisor** — the kind every artist tool ships.
Standing those next to the ones nobody else does makes the set weaker, not fuller. (**SplitSheet**
is out for a different reason: `lib/tools/splitsheet.ts` says *"Form-driven (not AI)"*.)

The three chosen tell one story in order, which is what makes it a section rather than a list:

1. **Antenna** — the brief finds you *(inbound)*
2. **PitchPlug** — you go after it *(outbound)*
3. **SampleClear** — the clearance does not kill it *(where sync deals actually die)*

SampleClear earns the third slot on three counts: it is the only one on the list a competitor does
not have, it carries the fact most artists get wrong (`lib/tools/sampleclear.ts`: *"master vs
publishing rights holders (usually different)"*), and it is the only one with a literal image in
it — Antenna is a matching engine and PitchPlug is an email.

**Still available if a fourth is ever wanted:** CopyrightKit (eCO walkthrough, pre-filled),
HireRight (work-for-hire per collaborator type), ContentID (YouTube claiming + DMCA), RoyaltyAudit.

## Design decision: manual, not auto-rotating

The hero already auto-rotates. Two things moving on one page compete for attention **and** hide
content behind a timer — bad for features whose whole job is to be discovered. So this one is a
**tablist**: every name readable at once, art changes only when asked, arrow keys work.

## The briefs

House palette: near-black ground (`#0a0a0c`), indigo `#818cf8` → fuchsia `#d946ef`, lavender
`#d4d4d8` for anything type-like. Panel is **16:10**, rendered at roughly 600×375 on desktop, so
detail below that reads as noise. No literal UI screenshots — the page already has a real Selects
mock, and a second fake interface would cheapen it.

### 1 · Antenna — *"the brief arriving"*

The feeling is **something out there found you**, not you searching. Avoid radar dishes and
satellite clichés if you can; the honest metaphor is a signal resolving out of noise into one clear
line. Think: a dense field of faint marks, and one of them brightening and coming into focus, the
rest falling away. Indigo dominant, a single fuchsia accent on the one that matched.

### 2 · PitchPlug — *"the letter that writes itself"*

The feeling is **the thing you have been avoiding, already done**. A page or a message forming
itself — not a robot typing, and not a paper aeroplane. Warmth matters here: this is relief, not
automation. Fuchsia dominant, with the formed text suggested rather than legible (never render
fake words; they always read wrong).

### 3 · SampleClear — *"one sample, two owners"*

The strongest image of the three and the one that teaches something. **One waveform, two distinct
owners branching from it, two letters going out.** The split is the whole point — the recording and
the composition are separate properties held by different people, and almost nobody knows that. Two
paths of equal weight, deliberately not symmetrical in colour: one indigo, one fuchsia.

## If any of these become short video

- Autoplay, **muted**, looping, `playsinline`, with a **poster frame** — it must look finished
  before a byte of video loads.
- Budget hard. Three panels of video on a marketing page is the kind of thing that quietly makes
  the page slow on a phone. A 3–4 second loop, heavily compressed, or a still.
- Respect `prefers-reduced-motion`: the poster frame is the fallback and must stand alone.

## Not blocked on

The copy is written and every claim is traced to the tool's own module. The section ships with
placeholder panels and a visible amber flag, so the art can arrive one slide at a time.
