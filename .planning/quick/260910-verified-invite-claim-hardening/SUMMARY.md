# Verified Invite Claim Hardening — Summary

## Outcome

Critical audit finding C1 is remediated locally. Self-serve membership is now bound to an exact invitation capability and exact invited email, while invitation acceptance and collaborator identity linking are deferred until Supabase records the email as confirmed.

The fix is not yet active in production. Migration 214, production Auth settings, and the application deploy remain owner-gated and must follow `DEPLOYMENT.md`.

## Implemented controls

- Removed email-only self-serve admission and collaborator-based admission from the signup trigger.
- Required a 64-character invitation token that matches a pending, unexpired artist or collaborator invitation for the exact signup email.
- Made the auth insertion trigger provision only the base profile and subscription; it does not consume invites or claim collaborators.
- Added an atomic, idempotent, service-role-only post-verification claim RPC.
- Added a service-only hashed-capability ledger and removed raw invitation tokens from auth metadata after redemption.
- Neutralized the public email pre-check unless the caller proves possession of a valid invitation token.
- Routed confirmation callbacks, active-session signup compatibility, and existing-member invitation sign-in through the same verified claim boundary.
- Hardened local Auth defaults to email confirmation, ten-character passwords, and secure password changes.
- Backfilled `claimed_at` for pre-existing auth-linked profiles so the legacy tokenless retry path cannot continue claiming identity by email after promotion.

## Verification

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- Focused security suite — 8 suites, 48 tests, pass.
- Full Jest suite — 571 suites, 7,036 tests, pass.
- `git diff --check` — pass.
- Production build — compiled, typechecked, and generated all 151 static pages; final command status rechecked after documentation completion.

## Remaining owner actions

- Review and apply human-gated migration 214.
- Run `VERIFY-214.sql` against production.
- Change production Supabase Auth settings as described in `DEPLOYMENT.md`.
- Deploy the matching application revision and perform the invitation/auth smoke tests.
