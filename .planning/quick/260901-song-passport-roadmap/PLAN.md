# Song Passport Roadmap Promotion

## Objective

Convert the owner's six approved embedded-metadata decisions into a near-term Phase 37.3 roadmap candidate and durable Claude/GSD planning input.

## Scope

- Name the capability Song Passport.
- Preserve source audio and embed metadata only in generated delivery copies.
- Define contributor, composition, version and release metadata layers.
- Define inherited, draft, confirmed, locked and outdated field states.
- Keep private/legal information out of embedded audio by default.
- Scope the first phase to inheritance, provenance, confirmation, MP3 delivery copies, sidecars and graduation; defer certified direct delivery.

## Files Expected to Change

- `.planning/ROADMAP.md`
- `.planning/deliberations/the-catalogue-unreleased-works.md`
- `.planning/todos/pending/2026-09-01-song-passport-metadata-continuity.md`
- `.planning/quick/260901-song-passport-roadmap/PLAN.md`
- `.planning/quick/260901-song-passport-roadmap/SUMMARY.md`

## Validation Plan

- Confirm all six owner-approved decisions appear in the roadmap and TODO.
- Confirm the work is described as near-term and not currently shipped.
- Confirm DDEX exports are distinguished from audio-container tags and direct delivery is deferred.
- Run `git diff --check` on all changed planning files.

## Risks / Coordination Notes

- Phase 37.3 follows the owner-approved Phase 37.2 live-collaboration candidate.
- Existing source audio must remain immutable evidence.
- Profile changes must never silently rewrite confirmed, locked or previously delivered metadata.
- Contact, payment, contract and private split-negotiation information must never be embedded by default.
- Existing unrelated worktree changes belong to the user and will not be modified.
