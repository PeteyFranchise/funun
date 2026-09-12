# TODO — Live verification for beta security migrations 214–217

## Status

Deferred by owner on 2026-09-12. This is intentionally human testing for a
later production window; it is not authorization for an agent to apply a
migration, change Supabase Auth settings, call a payment/e-sign provider, or
exercise production user records.

## Prerequisites

- Migrations 214–217 applied by the owner using the checksum-pinned sequence in
  `.planning/quick/260912-beta-security-migration-harness/APPLY-SEQUENCE.md`.
- Post-apply SQL verifier reports `ok=true` for every row.
- A named test account, test invitation, Stripe test-mode path, DocuSeal test
  path, and Playbook test records are approved for use.
- Production monitoring and rollback decision-makers are present.

## Human verification checklist

### 214 — verified invitation claims

- Coordinate and verify the intended Supabase email-confirmation setting.
- Confirm a valid invite cannot claim collaborators before email verification.
- Confirm the exact invited email and token are required after verification.
- Confirm an expired, malformed, wrong-email, replayed, or absent token fails.
- Confirm the raw signup token is removed from auth metadata after success.
- Confirm an existing member can still sign in and reaches the correct member
  workspace without crossing into a team-member context.

### 215 — checkout creation

- Use Stripe test mode only.
- Confirm simultaneous attempts for one license request create at most one
  checkout and preserve one economics fingerprint.
- Confirm a stale lease can recover and a live lease cannot be stolen.
- Confirm changed price/currency/economics cannot finalize an older claim.
- Confirm provider failure releases a safe claim without marking payment paid.

### 216 — e-sign minting

- Use the approved DocuSeal test path only.
- Confirm concurrent signing requests mint at most one active envelope per
  split sheet and one blanket agreement per member.
- Confirm a provider-created instrument that fails local persistence enters
  reconciliation instead of being minted again.
- Confirm completed or canceled instruments follow the intended remint rules.

### 217 — Playbook operations

- Confirm feature-control mutation rejects a stale `updated_at` value.
- Confirm concurrent incident opens do not create duplicate active incidents.
- Confirm incident status changes write the expected event exactly once.
- Confirm non-team members cannot call the service-role-only RPCs directly.

## Evidence to retain

- Timestamp and operator for each test.
- Sanitized request/result identifiers; no bearer tokens, secrets, or PII.
- SQL verifier output and migration-list output.
- Monitoring screenshots or incident IDs for unexpected behavior.
- Final go/no-go decision and any follow-up issue links.
