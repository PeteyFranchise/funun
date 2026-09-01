# Vault Door Copy

## Objective

Give both `/vault/new` cards room-specific names and clear, industry-aware supporting copy.

## Scope

- Update the visible heading and supporting copy on the song card at `/vault/new`.
- Rename the release card to `The Release Report` and begin its supporting copy with `Start a release.`
- Keep the card's behavior and destination unchanged.
- Align both accessible labels with the new room names.

## Files Expected to Change

- `app/(artist)/vault/new/page.tsx`

## Validation Plan

- Confirm both cards show the new room names and action-first supporting copy.
- Run ESLint against the edited page.
- Run whitespace validation on the task diff.

## Risks / Coordination Notes

- Copy-only change; no data, routing, or behavior changes.
- Existing unrelated worktree changes will be preserved.
