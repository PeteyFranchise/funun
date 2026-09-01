# Writer's Room Presence — Quick Build Plan

## Outcome

Ship the first bounded live-collaboration slice: authenticated members of the same Writer's Room can see who is in the room and whether each person is editing a lyric section, listening to a take, or recently active.

## Scope

- Authorize a private Supabase Realtime Presence channel with the existing work owner/member access rules.
- Publish only privacy-safe activity metadata; resolve names and avatars from the server-loaded room roster.
- Coalesce multiple tabs for one person and handle visibility, reconnect, and cleanup.
- Announce debounced lyric saves and audio playback as creative context.
- Add focused unit, component, and migration-contract tests.
- Record production migration/UAT follow-up and a Claude-ready implementation summary.
- Update the Nigil meeting Google Doc so live presence is described as built, with its limits stated plainly.

## Non-goals

- Simultaneous text merging, section locks, comments, suggestions, or snapshots.
- Presence for invited collaborators who have not claimed an account.
- Collaborative editing of splits, contracts, identities, approved metadata, or audio files.
- Keystroke logging, draft-text transmission, idle-time reporting, or productivity scoring.

## Assumptions

- Migration 136's `is_work_owner` and `work_member_tier` helpers remain the source of truth for room membership.
- Realtime authorization is applied through RLS policies on `realtime.messages` before production UAT.
- Presence is ephemeral creative context, not a legal or audit record.

## Verification

- Unit-test payload normalization, roster filtering, and multi-tab coalescing.
- Render-test the presence panel and privacy language.
- Contract-test migration 143 for private presence-only access and owner/member authorization.
- Run focused Jest suites, TypeScript, lint, and production build; distinguish pre-existing failures from regressions.
- After migration: test two accounts and multiple tabs for join/leave, lyric-save activity, playback activity, background/foreground, and reconnect behavior.
