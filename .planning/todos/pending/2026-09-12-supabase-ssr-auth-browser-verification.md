# TODO — Supabase SSR authentication browser verification

## Status

Deferred by the owner on 2026-09-12 so the current session can focus on code
and automated builds. This TODO does not authorize production Auth setting
changes, migration application, or test-account mutation by an agent.

## After deployment

- Sign into a normal Member account and confirm the expected Member workspace.
- Sign into a Funūn Team Member account and confirm the Team console.
- Switch between authorized Member and Team contexts and confirm the selected
  context persists across navigation and refresh.
- Confirm opening `/signin` while already authenticated allows intentional
  account replacement.
- Confirm an expired access token refreshes without a random sign-out.
- Confirm sign-out clears the browser session and protected routes redirect.
- Complete a password-recovery callback and update the password.
- Complete an email-confirmation callback and verify its role-aware landing.
- Inspect auth-bearing responses for `Cache-Control: private, no-cache,
  no-store, must-revalidate, max-age=0` when cookies refresh.
- Confirm authentication pages retain valid CSP nonces and no hydration errors.

## Evidence

Record the deployment ID, browser, account class, sanitized timestamps,
pass/fail result, and any issue link. Never record passwords, access tokens,
refresh tokens, invite capabilities, or cookie values.
