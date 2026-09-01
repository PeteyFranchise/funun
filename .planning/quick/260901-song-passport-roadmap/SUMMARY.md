# Song Passport Roadmap Promotion - Summary

## What Changed

- Promoted the owner-approved embedded-metadata concept into near-term Phase 37.3, named Song Passport and sequenced after Phase 37.2 live collaboration.
- Added a pending TODO with the six locked decisions, four source-of-truth layers, five field states, delivery-safe privacy boundary, first-release stages and end-to-end ship test.
- Updated the Phase 37 source deliberation so future Claude/GSD sessions inherit the decisions without re-asking them.
- Moved the remaining broad Catalogue destinations, volume and related work to 37.4+ unless formal planning identifies a dependency conflict.
- Explicitly separated audio-container tags from DDEX/CWR/RDR exports and deferred certified direct industry delivery.

## Validation Run

- Confirmed Phase 37.3 appears in the top-level roadmap and the detailed Phase 37 section.
- Confirmed all six owner-approved decisions appear in the Song Passport TODO.
- Confirmed the TODO includes contributor, composition, recording-version and release layers plus inherited, draft, confirmed, locked and outdated states.
- Confirmed original-audio immutability, privacy filtering, snapshot stability and graduation mapping are included in the definition of done.
- Ran `git diff --check` against all changed planning files; no whitespace errors were reported.

## Remaining Risks / Follow-ups

- Phase 37.3 must still pass `/gsd-discuss-phase` and architecture research before implementation.
- Storage shape, provenance granularity, consent mechanics, snapshot schema and legacy migration/backfill remain planning decisions.
- Additional container formats and certified partner delivery are deliberately outside the first phase.
