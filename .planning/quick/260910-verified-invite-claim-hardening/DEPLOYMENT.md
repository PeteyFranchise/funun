# Verified Invite Claim Hardening — Production Runbook

## Release rule

Migration 214, production Supabase Auth configuration, and the application changes form one security release. Do not deploy the application first: its auth callback expects the migration-214 RPC. Do not enable email confirmations while the legacy email-only claim trigger remains installed.

Pause new invitations and onboarding for the short release window.

## Required order

1. Confirm the current production migration ledger and take the normal pre-change database snapshot/checkpoint.
2. Apply `supabase/migrations/214_verified_invite_claim_hardening.sql` as an explicit owner action.
3. Run the read-only `VERIFY-214.sql` and require every result to be `true`.
4. In production Supabase Auth settings:
   - enable email confirmations;
   - set minimum password length to at least 10;
   - enable secure password changes.
5. Deploy the matching application commit immediately.
6. Complete the smoke tests below before resuming invitations.

Applying migration 214 before the application creates a deliberate fail-closed interval for new self-serve signup: the legacy client does not send the required token metadata. Existing account sign-in remains available. Keep this interval short.

## Smoke tests

- A fresh valid artist invitation can create an account but cannot claim the invitation before email confirmation.
- Following the confirmation link completes the exact invite and lands the new member at the intended destination.
- A valid collaborator invitation behaves the same way and links only the matching verified identity.
- A wrong email with a valid token is rejected.
- A correct email with no token is rejected without revealing whether the email already has an account.
- An expired, malformed, or already-consumed token is rejected.
- An existing verified member can sign in through a new invitation link and redeem that invitation.
- A normal existing-member login and password-recovery callback still work.
- Admin-provisioned, staff, buyer, curator, and industry account paths remain unchanged.
- Retrying a completed claim is harmless and does not duplicate or transfer identity data.

## Rollback posture

Do not restore the legacy email-only claim path. If the release fails, pause invitation signup and roll the application back only in coordination with a database follow-up that preserves token-bound, verified claims. Treat any request to disable confirmation or re-enable email-only claiming as a security exception requiring explicit review.
