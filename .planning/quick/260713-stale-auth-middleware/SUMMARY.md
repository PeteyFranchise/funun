---
status: complete
completed: 2026-07-13T09:00:00Z
branch: codex/fix-stale-auth-middleware
---

# Stale Auth Middleware Fix Summary

## Root Cause

Middleware used `supabase.auth.getSession()` to decide whether a request was authenticated, while server pages and API routes use `supabase.auth.getUser()`. A stale/deleted Supabase cookie can still look like a session to middleware but resolve to `user = null` in server pages.

That mismatch explained the smoke symptom:

- `/vault` passed middleware but queried with `user?.id ?? ''`, producing an invalid UUID error.
- `/u/[handle]` rendered signed-out Connect/Follow/Message CTAs because the page resolved no viewer.

## Fix

`middleware.ts` now validates with `supabase.auth.getUser()` and uses the returned `user` for protected-route gating, auth-route redirects, and collaborator-claim lookup.

## Verification

- `npm test -- --runInBand __tests__/middleware-auth.test.ts` passed.
- `git diff --check` passed.
- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm test -- --runInBand` passed, 95/95 tests.
- `npm run build` passed.
- Local stale-cookie sanity check: visiting `/vault` redirected to `/signin?next=%2Fvault` instead of rendering the vault with an empty user id.
