# Quick Summary: Next 15 Supabase Cookie Fix

## Completed

- Updated `lib/supabase/server.ts` so Supabase server/API clients await Next 15 `cookies()` once and pass a resolved cookie store to the auth helpers.
- Updated all `createServerClient()` / `createApiClient()` call sites to await the async factories.
- Added repair migrations:
  - `051_recreate_claim_collaborators_rpc.sql`
  - `052_restore_collaborators_claimed_by.sql`
  - `053_restore_user_profiles_table.sql`
- Added a regression test for the collaborator-claim RPC/table contract.

## Verification

- `npx tsc --noEmit`
- `npm run lint`
- `npm test -- --runInBand` — 92 tests passed
- `npm run build`
- `npm run db:push` — remote database up to date
- Focused authenticated UAT against local dev server:
  - `/api/claim-collaborators` returned 200
  - connection request POST returned 200
  - recipient profile HTML contained Accept, Decline, and the request note
  - connection accept PATCH returned 200
  - exactly two follow rows were seeded
  - exactly `connection_request` and `connection_accepted` notifications were created
  - no `new_follower` notifications were created
  - notification unread count moved from 1 to 0 after mark-all-read
  - dev-server logs no longer emitted the Next 15 `cookies().get(...)` error

