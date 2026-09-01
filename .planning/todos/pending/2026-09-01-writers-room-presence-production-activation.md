# Activate and UAT Writer's Room Presence in production

## Context

The Stage 1 presence UI and private-channel implementation are in the repository. Migration 143 must be applied before the private channel can authorize users in production.

## Action

- Apply `143_writer_room_presence_authorization.sql` with `npm run db:push`.
- Confirm the migration appears in `npx supabase migration list`.
- Run the two-account/multi-tab UAT in `.planning/quick/260901-writers-room-presence-build/SUMMARY.md`.
- Confirm a non-member is denied.
- Only after UAT, change external language from “built / pending activation” to “available today.”

## Owner

Engineering with product UAT.
