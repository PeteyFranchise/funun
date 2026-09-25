---
created: 2026-09-24T00:00:00Z
title: Discuss — pro-audio quality upgrades that stay true to the mission
area: catalogue
severity: low
status: pending
kind: discussion
---

## Why this note exists

Owner-raised 2026-09-24, alongside
`2026-09-24-studio-quality-vocal-capture.md`. That note answers one question
(can a keeper vocal be cut in-app). This one is the broader conversation: **what other
professional-audio capabilities belong in Funūn, and which ones would quietly turn it
into something it is not?**

This is a discussion to have, not a task to execute. Nothing here is decided.

## The test to apply

Funūn's mission is **rights, provenance, readiness and collaboration** — "an artist
completes a release knowing their rights are documented, their collaborators are on
record, and their registrations are tracked." It is explicitly not a DAW; that boundary
came up repeatedly while designing the Song Builder.

So the test for any pro-audio feature:

> **Does this make the rights, provenance or delivery story stronger — or is it a
> production feature wearing audio clothes?**

And the standing principle that falls out of it:

> **Measure and deliver. Never alter the stored bytes.**
>
> Analysis yes. Processing no. What an artist recorded is evidence, and evidence that
> the platform quietly "improved" is no longer evidence.

## Strong fit — serves delivery, evidence or readiness

**Loudness and true-peak analysis.** LUFS and dBTP measurement on every master. This is
a **readiness gate**, not production — distributors reject over-peaking files, and a
release that fails at the distributor after the artist thought it was done is exactly
the failure the Sound Vault exists to prevent.

**Correction (Codex, 2026-09-24):** this note originally claimed partial groundwork in
`lib/catalogue/take-export-audition.ts`. That module only formats Adobe Audition marker
CSV and performs **no audio analysis**. LUFS, true-peak, clipping, DC-offset and silence
detection are **net-new work**.

The one real precedent is `lib/watermark/stream-preview.ts:104-152` — a private RIFF/WAVE
parser that already extracts sample rate, bit depth and channel count. It exists only for
watermark rendering and is not wired to upload validation, but it is the closest thing to
a header inspector already in the tree.

**Spec validation on upload.** Sample rate, bit depth, clipping, DC offset, channel
count, silence at head and tail. A plain "this will be rejected by your distributor, and
here is why" check. Squarely mission.

**Lossless archival with a content hash.** Keep the exact delivered bytes and hash them.
That is provenance, and it strengthens the human-take registry behind the Crate vocal
rule — "this performance existed, unaltered, on this date."

**Sample-rate and bit-depth preservation end to end.** Never silently transcode. A
platform that re-encodes a master without saying so has damaged the artist's work.

**Stem delivery and handoff.** A producer returning stems, tracked as versions carrying
credits. `ProducerHandoffTimeline`, `ProducerInbox` and `ReturnedMixReviewCard` already
exist; the audio side of that flow is thinner than the workflow side.

**Level matching for auditions only.** `lib/catalogue/level-match.ts` already does this.
Making an audition not blow someone's ears out is playback UX. It must never touch the
stored file.

## Weak fit — production features in disguise

Name them so they can be ruled out rather than re-litigated:

EQ · compression · reverb · pitch correction · time-stretch · noise removal ·
multitrack mixing · automation · plugins · mastering.

Every one of these competes with Pro Tools and Logic and loses, and every one of them
alters evidence. If an artist wants these, they want a DAW, and Funūn should hand them a
clean 24-bit stem and get out of the way.

## Grey area — the actual conversation

**Silence trim / noise gate on a hum.** Convenience for a rough capture, alteration of a
record. Probably fine on a `hum`, probably not on anything the human-take registry will
ever look at. Where is the line?

**Normalisation for preview playback.** Acceptable if it is a playback gain and never
written to the file. The risk is that "preview only" erodes over time.

**AI stem separation.** Production if used to extract a vocal for reuse. But the same
technology used as **verification** — "does this master actually contain a human vocal?"
— serves the Crate vocal rule directly, which is mission. Same tool, opposite verdicts
depending on the purpose. Worth thinking through properly.

**Automatic tempo and key detection.** Already discussed under the musical counter: the
honest posture is **suggest, never auto-set**, because `bpm` is `delivery_safe` in the
song passport and buyers filter on `bpmMin`/`bpmMax` in `lib/deals/catalog.ts`. A wrong
auto-detected value is not cosmetic — it hides a song from the right search.

## What to settle in the discussion

1. Ratify (or reject) the **measure-and-deliver, never-alter** principle as doctrine. If
   it holds, most of the grey area resolves itself.
2. Decide whether **readiness gates** (loudness, true peak, spec validation) belong in
   the existing Sound Vault readiness score or sit beside it.
3. Decide the **verification vs production** line for stem separation.
4. Decide whether any of this is tier-gated — and note that, as in the vocal-capture
   note, every paid-tier artefact in the repo today is buyer-side. An artist-facing
   audio tier is a new business-model conversation, and Phase 24 self-serve is already
   on hold pending one.

## Related

- `.planning/todos/pending/2026-09-24-studio-quality-vocal-capture.md`
- `.planning/todos/pending/2026-09-24-song-builder-arrangement-and-audition.md`
- `docs/buyer-paid-tiers-and-content-protection.md` (buyer-side tiers)
- `.planning/deliberations/the-catalogue-unreleased-works.md` (the Crate vocal rule)
