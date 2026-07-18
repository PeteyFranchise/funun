# Plan 12-02 Summary: Feed Schema, RLS & Indexes

## What Changed

- Added migration `057_green_room_feed.sql` — the database foundation for The Green Room.
- Tables: `green_room_posts` (author, type, body, visibility, status, linked object, allow_resharing, moderation/report fields, publish/delete timestamps), `green_room_post_audiences` (bounded, queryable custom-audience rows), `green_room_comments`, `green_room_reactions`, `green_room_reposts`, and `green_room_placements` (admin-curated cards).
- Visibility helpers: `green_room_post_matches_custom_audience()` and `green_room_can_view_post()` (SECURITY DEFINER) enforcing draft privacy, published visibility (public/followers/connections/custom), moderation state, deletes, and bidirectional `no_block()`.
- RLS on every table: owners manage their own posts/comments; reads inherit `green_room_can_view_post()`; reactions/reposts scoped to visible originals; placements readable only inside their active window; placement INSERT/UPDATE/DELETE revoked from `authenticated` (admin/service-owned).
- Indexes for cursor pagination (`published_at, id`), tab filters (visibility/type/author graph), the active-placement window, and GIN indexes on audience arrays; reactions unique per `(post_id, user_id, reaction_type)`.

## Validation Run

- `npm run db:push` (operator-run) — migration 057 applied.
- Confirmed live via `npx supabase migration list`: 057 present in both LOCAL and REMOTE.

## Notes

- Backfilled 2026-07-18 for GSD consistency; the schema shipped in commit `765dc7f` "feat: add green room feed schema".
- Requirements: FEED-01…FEED-05.
- Security posture: visibility is server-enforced through `green_room_can_view_post()`, blocks through the existing `no_block()` helper, and reposts are validated against the original at read time rather than copying visibility state into the repost row. This is the authoritative RLS layer that Phase 12's session-client reads (12-03…12-10) depend on.
