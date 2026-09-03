# Producer Return Loop — Quick Build Plan

## Objective

Close the Writer's Room producer handoff loop: a tagged producer can find incoming packs in one private inbox, acknowledge receipt, and upload a named mix back into the same song as a take linked to the originating handoff.

## Scope

- Add a Sound Vault producer inbox for handoffs addressed to the signed-in account.
- Let the recipient play/download the rough mix and zero-aligned dry vocal, read the sender's note, acknowledge receipt once, and open the Writer's Room.
- Reuse the existing signed-upload version pipeline for returned audio; then bind the resulting active upload take to the handoff with an optional return note.
- Record acknowledgement and returned-mix events in the immutable private song diary and notify the original sender.
- Support more than one returned mix per handoff while preventing a version from being attached to two handoffs.
- Keep acknowledgements and returns separate from the immutable handoff itself and from master, rights, split, registration, approval, and release state.

## Files Expected to Change

- New producer-inbox page and client component under `app/(artist)/vault` and `components/catalogue`.
- New acknowledgement and return route handlers under `app/api/producer-handoffs`.
- The Sound Vault header, work-page diary loader, diary renderer/types, and producer-handoff helpers.
- Supabase migration 166 plus focused component, helper, diary, and static migration tests.

## Validation Plan

- Unit-test safe producer-return labels and inbox presentation state.
- Test inbox acknowledgement/upload interactions and diary descriptions.
- Add a static migration contract test for recipient-only writes, same-work uploader-owned active versions, immutable rows, member-only reads, and no formal rights/master writes.
- Run focused tests, full Jest, TypeScript, zero-warning lint, production build, and `git diff --check`.

## Risks and Coordination

- Migration 166 depends on migration 165 and must be applied before this UI/API is deployed.
- Handoff audio uses short-lived signed URLs created only after the recipient-scoped query succeeds.
- A failed link step can leave a valid ordinary take in the song; the UI must report that the audio remains safely saved rather than deleting it.
- The version upload emits its normal diary entry before the return-link trigger emits the producer-return event; both are accurate and immutable.
- Native `/gsd-quick` is unavailable in Codex, so this plan is the required manual GSD fallback artifact.
