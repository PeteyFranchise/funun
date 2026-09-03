# Returned Mix Review — Quick Build Plan

## Objective

Add an optional review card for producer-returned mixes inside the Writer's Room. A room member can compare the return with the current working take, make it the working take, explicitly keep the current choice, or defer the decision without blocking any creative action.

## Scope

- Surface unreviewed producer returns near the Writer's Room creation controls without hiding recording, lyrics, versions, or the diary.
- Open A/B comparison with the returned mix and current working take preselected when both are available.
- Let any current room contributor record “make this working” or “keep things as they are” as the room-level review outcome.
- Keep “Later” session-local and non-destructive; it hides the card temporarily but writes no review, approval, or rejection fact.
- Persist review outcomes atomically; choosing the returned mix updates only the creative `working_version_id` pointer.
- Capture an immutable private diary event while preserving returned takes regardless of outcome.

## Files Expected to Change

- New returned-mix review component and helper with tests.
- Writer's Room page loader and `WorkPage` flow integration.
- Version-comparison defaults so a requested returned version is selected explicitly.
- A review API route and migration 167 for atomic review persistence and diary capture.
- Catalogue diary types/descriptions and migration/authorization contract tests.

## Validation Plan

- Unit-test comparison defaults, outcome language, and card affordances including the non-persisting Later path.
- Add static migration/API contracts for current-member authorization, same-work active returns, atomic working-pointer update, immutable member-private reviews, and no master/rights/split/release writes.
- Run focused tests, full Jest, TypeScript, zero-warning lint, production build, and `git diff --check`.

## Risks and Coordination

- Migration 167 depends on migrations 165–166 and must be applied before deploying the review UI/API.
- “Make working” is a shared creative preference, not approval. “Keep current” does not reject, archive, or delete the returned take.
- The review card must disappear only after an explicit persisted outcome; closing comparison or choosing Later cannot silently mark anything reviewed.
- Native `/gsd-quick` is unavailable in Codex, so this plan is the required manual GSD fallback artifact.
