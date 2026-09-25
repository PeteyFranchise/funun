# Explore a DAW plugin for producer handoffs

**Captured:** 2026-09-25 · **Status:** future exploration, not a commitment
**Owner framing:** *"I'm not saying Funūn becomes a DAW competitor, but we should explore whether a
DAW plugin can help make these producer handoffs and sendoffs better and easier."*

## The distinction this rests on

Funūn's "not a DAW" boundary is stated twice and is not in question here:

- `ROADMAP.md:3074` (Song Builder): *"Scope boundary: this is not a DAW. No effects, no automation
  beyond the bed duck, no mixing."*
- `2026-09-24-discuss-pro-audio-upgrades-within-mission.md:82-84`: *"Every one of these competes
  with Pro Tools and Logic and loses… If an artist wants these, they want a DAW, and Funūn should
  hand them a clean 24-bit stem and get out of the way."*

**A handoff plugin is the opposite of competing.** It does not add mixing, effects or automation —
it removes friction from the boundary crossing that already exists. The test from the pro-audio
todo still applies: *does this strengthen rights, provenance or delivery, or is it a production
feature wearing audio clothes?* A handoff plugin plausibly passes, because every crossing is a
provenance event.

## What ships today (the baseline to improve on)

| Direction | Mechanism | Where |
|---|---|---|
| Out | Timed comments exported as **DAW marker files** — Audition, Audacity, CSV | Phase 40 · `lib/catalogue/take-export-audition.ts`, `take-export-formats.ts`, `TakeMarkerExport.tsx` rendered at `TimedTrackPlayer.tsx:1097` |
| Handoff state | `sent → received → working → returned → reviewed` | `lib/catalogue/producer-handoff.ts:23`, `ProducerHandoffTimeline.tsx` rendered at `WorkPage.tsx:1620` |
| Back in | Returned mix reviewed in the room | `ReturnedMixReviewCard.tsx` rendered at `WorkPage.tsx:1613` |

So the round trip is real and shipped. **What it costs the producer today:** download a file,
import markers manually, work, bounce, come back to a browser, upload. Five manual steps across two
applications.

## What the exploration should answer

1. **Which DAWs, and at what cost?** Plugin formats differ (AU/VST3/AAX), and Pro Tools' AAX
   requires Avid developer registration. Supporting three is three builds and three review queues.
2. **Does it move audio, or only metadata?** Markers-and-state is a much smaller surface than
   audio transfer, and might deliver most of the value. Decide this before scoping.
3. **What does it do to provenance?** Every crossing is currently a recorded event with a file
   attached. A plugin must not make that implicit — the audit trail is the product, and a
   frictionless path that skips the record would be a downgrade dressed as an upgrade.
4. **Who is the user?** The producer, who may have no Funūn account. That is an auth question
   before it is an audio question.
5. **Is a plugin even the right shape?** A watch-folder, a CLI, or a Finder/Explorer integration
   might get most of the benefit for a fraction of the maintenance.

## Why not now

No user has asked yet, the file path works, and the marketing page can describe the shipped round
trip honestly without it. Revisit when producer handoff volume justifies the maintenance — three
plugin formats is a permanent commitment, not a one-off build.
