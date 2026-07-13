# Quick Plan: Next 15 Supabase Cookie Fix

## Goal

Remove the Next 15 `cookies()` sync-access warnings/errors from Supabase auth helper usage so Phase 10 UAT can run cleanly through authenticated pages and API routes.

## Steps

1. Update the shared Supabase server/API client factories to await `cookies()` and pass a resolved cookie store to auth helpers.
2. Update call sites to await `createServerClient()` / `createApiClient()`.
3. Run typecheck, lint, tests, build, and focused UAT around connection accept + notifications.

