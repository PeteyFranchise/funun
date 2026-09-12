# Verified Invite Claim Hardening — Plan

## Objective

Close Critical finding C1 before Beta: a self-serve Member Account must present the specific invitation capability at signup, prove control of the invited email, and only then claim invitations or collaborator identity data.

## Scope

- Require token-bound admission for self-serve member signup; remove admission by email/collaborator match alone.
- Defer invitation acceptance and collaborator claiming until the Supabase user email is confirmed.
- Make post-confirmation redemption atomic, idempotent, and service-role-only.
- Route both auth-callback completion and active-session compatibility through the same redemption boundary.
- Neutralize the public email pre-check so it does not reveal existing-account or invitation status without a valid token.
- Enable confirmation-oriented local Supabase Auth defaults and strengthen password-change/password-length defaults.
- Add focused route, signup-state, migration-contract, and authorization tests.
- Do not apply the migration or change production Auth settings in this task.

## Expected files

- `supabase/config.toml`
- `supabase/migrations/214_verified_invite_claim_hardening.sql`
- `app/(auth)/signup/page.tsx`
- `lib/invites/completeSignupClaim.ts`
- `app/auth/callback/route.ts`
- `app/api/signup/check-invite/route.ts`
- `app/api/signup/invite/[token]/route.ts`
- `app/api/claim-collaborators/route.ts`
- Focused tests for the files above
- This task's `SUMMARY.md`
- This task's `DEPLOYMENT.md`

## Validation

- Focused Jest tests for migration contract, invite pre-check, callback/claim routes, and signup completion.
- `npm run typecheck`
- `npm run lint`
- Broader test run if focused checks pass.
- `git diff --check`

## Security invariants

- Email alone never authorizes self-serve account creation.
- A token must match the exact submitted email and an active invitation row.
- Signup insertion creates only the base profile/subscription; it does not accept an invitation or claim collaborator rows.
- Redemption requires `auth.users.email_confirmed_at` and binds the supplied user id to the verified auth record.
- Redemption consumes at most one exact invite capability and is safe to retry.
- Cross-user writes remain unavailable to browser roles.
- Existing admin-provisioned account creation keeps its provision-intent exemption.

## Coordination and deployment risks

- Migration 214 is a human-gated candidate and must not be applied automatically.
- The application and migration must be deployed in a sequence that does not strand invitation links; production email confirmation must be enabled as an explicit owner action during the release window.
- Existing uncommitted audit documentation belongs to the current task chain and must be preserved.
