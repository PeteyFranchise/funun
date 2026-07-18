# Phase 12 Security Review Fixes

## Objective

Close the three confirmed Phase 12 adversarial review findings before PR #37 merges:

- Private-profile authors must not surface through Green Room feed, repost visibility, comments/reactions, or admin-curated post placements.
- Public Green Room posts must not link tracks whose parent vault project is private.
- Forged feed/discover cursors must fail validation before reaching PostgREST UUID comparisons.

## Scope

- Patch migration 057's `green_room_can_view_post()` visibility helper.
- Add app-layer feed and placement guards for author publicness.
- Harden linked-object publish validation for tracks.
- Validate cursor ids as UUIDs.
- Add regression tests for the security contracts above.

## Files Expected To Change

- `supabase/migrations/057_green_room_feed.sql`
- `supabase/migrations/059_green_room_feed_author_publicness.sql`
- `lib/green-room/feed-query.ts`
- `lib/green-room/placements-admin.ts`
- `lib/green-room/post-write.ts`
- `lib/green-room/discover.ts`
- `__tests__/green-room-*.test.ts`
- `__tests__/migration-057.test.ts`

## Validation Plan

- Run targeted Green Room Jest suites.
- Run migration string tests.
- Run typecheck/lint if targeted tests expose TypeScript risk.

## Risks / Coordination Notes

- Existing `.planning/STATE.md` and Phase 13 prep docs were already dirty before this task; do not overwrite or reconcile them here.
- This is a quick-fix artifact because Codex cannot run Claude slash commands directly.
