# Phase 43: External Payout Profile & Consent Foundation — Context

**Captured:** 2026-09-23
**Status:** Security/processor decisions required before sensitive implementation
**Migration:** Unassigned; human-gated; migration 228 is unavailable

## Phase boundary

Build the Member-owned private data foundation for off-platform payment instructions and tax documents.
This phase stops at profile storage, masked management, verification/change state, and audit/history. It
does not disclose data to label/distributor recipients; that is Phase 43.1.

## Locked decisions

- **P-01:** Stripe Connect remains the Funūn payout rail and is visually/data-model separate.
- **P-02:** External instructions and tax documents are separate categories with separate consent.
- **P-03:** Saved secrets are never returned in full after write; clients receive masks/status only.
- **P-04:** Raw values never enter logs, analytics, notifications, URLs, audit JSON, or error reports.
- **P-05:** Preserve the structural exclusion of `manage_payouts` and `view_tax_information`
  (`lib/workspaces/permissions.ts:159-181`).
- **P-06:** Only the data subject owns and may authorize disclosure of their information.
- **P-07:** Verification claims are explicit: self-provided, account validated, ownership verified,
  previously paid, recently changed. Do not collapse them into one “verified” flag.
- **P-08:** Bank-detail changes require recent authentication, notification, risk state, and review of
  pending disclosures.
- **P-09:** Select KMS/envelope encryption, retention, backup, key rotation, support access, rail/country
  scope, and legal/privacy posture at a human checkpoint before persisting real secrets.
- **P-10:** Production remains at migration 227. Migration 228 is reserved for storage attribution and
  cannot be claimed. Select a number only immediately before authoring after the full migration preflight.

## Canonical evidence

- `app/(artist)/settings/payouts/page.tsx` and `components/settings/PayoutsOnboarding.tsx` — current Stripe UI.
- `app/api/settings/payouts/route.ts` and `lib/stripe/connect.ts` — current server boundary.
- `lib/workspaces/permissions.ts:159-181` — non-grantable payout/tax doctrine.
- `.planning/reviews/CODEX-PLAN-260923-secure-external-payout-sharing.md` — approved product/security plan.

## Stop conditions

Stop for owner input if there is no approved key service, no step-up-auth mechanism, no retention policy,
or a request to place raw financial data in an ordinary package. Do not substitute application-level
base64, a long-lived environment-key-only design, or Stripe Connect tokens as an expedient.
