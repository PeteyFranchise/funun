---
quick_id: 260710-q9j
description: Add password-reset flow to Supabase email/password auth and document auth setup
date: 2026-07-10
status: complete
commits:
  - cf96f40 feat: forgot-password page + signin reset link
  - 5a85acd feat: update-password recovery page
  - 70f0439 feat: harden auth callback + middleware for recovery flow
  - 954a033 docs: document auth flow, env vars, and reset testing
---

# Quick Task 260710-q9j — Summary

## What was done

Closed the single real gap in an otherwise-complete Supabase email/password auth: there was
no password-reset flow. Added the two recovery pages, wired the recovery redirect through the
existing `/auth/callback`, hardened the callback against expired/invalid links, extended
middleware coverage, and documented the full auth setup + testing procedure.

Existing working auth (signup, signin, signout, email-confirmation callback, route protection)
was preserved untouched — only the callback and middleware were edited additively.

## Files created
- `app/(auth)/forgot-password/page.tsx` — reset-request page; `resetPasswordForEmail` with
  `redirectTo=…/auth/callback?next=/update-password`; non-enumerating success state.
- `app/(auth)/update-password/page.tsx` — new-password page; verifies a recovery session
  (getSession + PASSWORD_RECOVERY onAuthStateChange fallback), `updateUser({ password })`,
  success/auto-redirect and expired-link states.

## Files modified
- `app/(auth)/signin/page.tsx` — added "Forgot password?" link to `/forgot-password`.
- `app/auth/callback/route.ts` — checks `exchangeCodeForSession` for error / missing code;
  redirects to `/forgot-password?error=recovery` (recovery) or `/signin?error=auth` on failure
  instead of silently landing on `/vault`. Successful `?code=` → `next` path preserved.
- `middleware.ts` — `/forgot-password` added as a public auth route (bounces signed-in users
  to `/vault`); `/update-password` deliberately kept out of both auth-route and protected lists
  so the recovery landing stays reachable during the temporary recovery session.
- `README.md` — new `## Authentication` section: flow table, required env vars, Supabase
  dashboard config (SMTP + Site URL + 4-entry redirect allowlist), and step-by-step signup /
  reset / email-delivery testing.

## Verification
- `npx tsc --noEmit` — clean (exit 0) after every task.
- grep confirmed presence of `resetPasswordForEmail`, `updateUser`, `onAuthStateChange`, the
  `/forgot-password` link, callback error handling, and both new middleware paths.
- README grep confirmed `## Authentication` heading + all four env var names.
- Preview dev-server verification NOT run: the preview harness failed with `EPERM: uv_cwd`
  (sandbox cwd permission), unrelated to the code. Runtime + real-email verification is the
  user's manual test (real inbox through Resend) — inherently not reproducible in-sandbox.

## Manual verification the user must run (real deployment/inbox)
1. Supabase dashboard: Site URL = `https://funun.studio`; redirect allowlist includes
   `https://funun.studio/auth/callback` + `/update-password` (add `http://localhost:3000`
   equivalents for local testing). [Done during this session per screenshots — Site URL fixed;
   localhost entries optional pending whether the user tests locally.]
2. `/signup` with a real inbox → confirmation email from Funún <noreply@auth.funun.studio> →
   link lands in `/vault`.
3. `/signin` → "Forgot password?" → `/forgot-password` → reset email → `/update-password` →
   set new password → auto-redirect to `/vault`.
4. Confirm sends appear in Resend → Emails/Logs and Supabase → Auth Audit Logs.

## Out of scope (untouched)
- Phase-15 capability-model files (`app/api/capabilities/*`, `app/api/antenna/opportunities/route.ts`,
  phase-15 planning docs). None modified.
- Supabase dashboard config itself (user-owned; documented in README).
