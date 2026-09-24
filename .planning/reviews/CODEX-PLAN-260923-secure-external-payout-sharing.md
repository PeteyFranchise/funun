# Secure External Payout Sharing — Approved Product Plan

**Owner direction captured:** 2026-09-23
**Execution phases:** Phase 43 and Phase 43.1
**Status:** Product direction approved; security/processor decisions remain human gates.

## Bottom line

Funūn should help a label, distributor, or manager obtain the information needed to pay a contributor
when Funūn is not the payer—but it should not turn a workspace role into standing access to bank or tax
data. Build a private, reusable **Payout Profile** in Settings, then a purpose-bound request and consent
workflow that discloses a selected snapshot to a named finance recipient for a limited time. Default
upload packages contain a payout-readiness manifest and secure link, never bank numbers or tax forms.
Each contributor authorizes their own disclosure. Stripe Connect stays separate as Funūn's payout rail.

## Product model

### Settings > Payouts

Organize the page into:

- **Funūn payouts** — current Stripe Connect onboarding/status.
- **External payment instructions** — Member-supplied payment methods such as domestic ACH, wire, or
  IBAN/SWIFT, stored behind a dedicated encryption boundary and shown masked after save.
- **Tax documents** — separately stored and separately consented; never automatically bundled with bank
  instructions.
- **Sharing history** — who received which categories, for what purpose, when, and whether access was
  viewed, expired, or revoked. History stores metadata, never secret values.

### Payer request

A workspace finance user selects **Request payment details** and must provide:

- payer legal entity and named finance recipient;
- contributor and relevant work/release/deal/invoice context;
- payment rail and currency;
- exact fields/documents required;
- purpose and deadline;
- delivery method supported by Funūn.

The contributor sees an urgent Requests/Dashboard item and an exact disclosure preview: recipient,
purpose, categories, expiry, and the fact that a downloaded copy cannot be revoked. They may approve,
decline, or approve fewer categories when the payer's requirement allows it.

## Authorization doctrine

The existing model intentionally makes `manage_payouts` and `view_tax_information` ungrantable through
workspace permissions (`lib/workspaces/permissions.ts:159-181`). Preserve that invariant. A disclosure
is a distinct, immutable, purpose-bound consent artifact—not a new `WorkspacePermission`, role bundle,
or reusable “finance can see everything” switch.

- Only the data subject can authorize their information.
- A manager or label admin can request and track readiness, but cannot approve for a contributor.
- Access is recipient-specific, scoped to selected categories, expiring, auditable, and revocable until
  viewed/downloaded.
- Revocation stops future access; it cannot retrieve a copy already downloaded. The UI must say this.
- A later bank-profile edit does not silently change an already approved disclosure snapshot.

## Delivery design

### Default

The ordinary upload/delivery package contains only a manifest such as:

- contributor payment details: ready / requested / waiting / declined / expired;
- tax documentation: ready / not requested / waiting / declined / expired;
- secure recipient link and expiry when access was approved.

No account/routing number, tax identifier, tax form, unrestricted signed URL, or embedded secret is
placed in the ZIP, email, filename, audit event, analytics, notification, or error report.

### Exceptional static export

If a payer's external portal truly requires a file, Phase 43.1 may add a separately generated encrypted
export after an explicit owner/security checkpoint. It must be separate from the ordinary asset ZIP,
watermarked to the recipient/purpose, short-lived at the source, and protected by a secret delivered
out-of-band. The contributor must receive a clear warning that the downloaded file cannot be revoked.
Do not make this fallback the default merely because ZIP export already exists.

## Security and fraud controls

- Select and approve a managed KMS/envelope-encryption design before persisting any bank or tax value.
- Never return full saved values to the browser after write; APIs return masks and verification state.
- Require recent authentication/step-up verification for save, approve, view, download, and recipient
  reassignment. Require stronger controls for tax forms and account changes.
- Treat bank-detail changes as high-risk: notify the contributor, mark the profile recently changed,
  pause or warn on pending disclosures, and give finance users an out-of-band verification path.
- Store access tokens hashed, short-lived, single-recipient, and preferably single-use or session-bound.
- Audit request/approve/view/download/revoke/expire/change events with identifiers and categories only.
- Keep secrets out of server logs, client telemetry, Sentry payloads, emails, and URL query strings.
- Define retention/deletion, backup, key rotation, breach response, and support access before launch.

Account validation and account ownership are separate claims. Model verification states honestly—for
example self-provided, account validated, ownership verified, previously paid, and recently changed—
rather than displaying a single misleading “verified” badge.

## Phase boundary and execution order

### Phase 43 — foundation

1. Threat model, legal/privacy review, country/rail scope, processor/KMS decision, and retention policy.
2. Human-gated schema/RLS and server-only encryption boundary, using a migration number selected only
   after preflight; migration 228 is reserved and may not be used.
3. Payout Profile APIs and Settings UI with masked reads, reauthentication, change warnings, and history.
4. Security verification before enabling real values.

### Phase 43.1 — sharing and delivery

1. Purpose-bound disclosure-request lifecycle and contributor decisions in Requests.
2. Immutable approved snapshots and recipient-scoped grants.
3. Secure recipient portal with expiry, view/download audit, and revocation semantics.
4. Payout-readiness manifest in delivery packages; optional encrypted export only after its checkpoint.
5. End-to-end abuse, authorization, concurrency, notification, and human finance UAT.

Detailed executable slices are in
`.planning/phases/43-external-payout-profile-consent-foundation/` and
`.planning/phases/43.1-external-payout-delivery-package-integration/`.

## Launch criteria

- No generic workspace grant can reveal payout or tax secrets.
- Cross-account tests prove a requester, workspace owner, unrelated Member, and expired recipient cannot
  read the protected payload.
- A contributor can inspect and revoke unconsumed access; every view/download is visible in history.
- Bank changes do not mutate approved snapshots or pass silently into pending payment workflows.
- Default package inspection finds no restricted value in file bodies, filenames, metadata, manifests,
  URLs, logs, or notifications.
- Restore/key-rotation/runbook exercises pass before general availability.
- Every migration remains unapplied until the owner performs and records the human production gate.

## External standards and references

- [NIST SP 800-122](https://csrc.nist.gov/pubs/sp/800/122/final) — protect PII through access control,
  encryption, and auditing proportionate to impact.
- [Stripe Financial Connections data access](https://support.stripe.com/questions/what-data-can-my-business-access-from-a-user's-linked-financial-account?locale=en-GB) — illustrates permissioned data categories and tokenized account access.
- [Stripe external bank accounts](https://docs.stripe.com/api/external_account_bank_accounts/create?api-version=2025-06-30.preview) — Stripe account tokens are processor-scoped, not portable payout instructions for arbitrary labels.
- [IRS Form W-9](https://www.irs.gov/forms-pubs/about-form-w-9) — tax identification is a separate payer-requested document class.
- [Nacha account validation rule](https://www.nacha.org/rules/supplementing-fraud-detection-standards-web-debits) — account validation does not by itself establish ownership.
- [FBI business-email-compromise guidance](https://www.fbi.gov/how-we-can-help-you/common-frauds-and-scams/business-email-compromise) — payment-instruction changes require independent verification controls.
