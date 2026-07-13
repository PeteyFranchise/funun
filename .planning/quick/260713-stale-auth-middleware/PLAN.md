---
status: complete
created: 2026-07-13
scope: bug-fix
branch: codex/fix-stale-auth-middleware
---

# Stale Auth Middleware Fix

## Goal

Fix the local smoke auth/session quirk where a stale Supabase cookie can pass middleware but server pages resolve `auth.getUser()` as null, causing protected pages to render with an empty user id.

## Tasks

1. Update middleware to validate the current user with `auth.getUser()` instead of trusting `auth.getSession()`.
2. Add a lightweight regression test for the middleware auth contract.
3. Run targeted/full validation.
4. Open a small PR if validation passes.

## Result

Complete. Middleware now uses the same server-auth contract as pages/routes, and a stale cookie redirects to `/signin?next=/vault` instead of entering protected pages with a null user.
