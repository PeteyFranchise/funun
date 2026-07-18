# Phase 12 Adversarial Follow-ups

## Objective

Close the remaining confirmed Phase 12 adversarial-review findings:

- Blocked users must not see each other's comments, reactions, or reposts on shared third-party posts.
- Custom-audience role matching must use the same role semantics in database enforcement as the app layer.
- Admin-curated placements must not surface blocked public profiles/projects/tracks/opportunities/posts in the Green Room feed.

## Scope

- Patch migration `057_green_room_feed.sql` to tighten interaction visibility policies and custom-audience role matching.
- Add a new forward migration so already-applied databases receive the same policy/helper corrections.
- Extend app-layer placement visibility checks to enforce bidirectional block exclusion for viewer-facing feed rendering.
- Add regression coverage for the policy contracts and placement block filtering.

## Files Expected To Change

- `supabase/migrations/057_green_room_feed.sql`
- `supabase/migrations/060_green_room_block_visibility_and_audience_roles.sql`
- `lib/green-room/placements-admin.ts`
- `lib/green-room/feed-query.ts`
- `__tests__/green-room-feed-api.test.ts`
- `__tests__/green-room-placements-admin.test.ts`
- `__tests__/migration-057.test.ts`

## Validation Plan

- Run targeted Green Room Jest suites covering feed, placements, interactions, and migration contracts.
- Expand tests specifically around custom-audience role matching and blocked placement suppression.

## Risks / Coordination Notes

- Existing untracked planning artifacts for Phase 12/13 were present before this task and should remain untouched.
- This uses the manual GSD quick-path because Codex cannot run Claude slash commands directly in this checkout.
