---
created: 2026-09-01T07:30:00-04:00
title: Implement contract-aware pre-delivery revocation
area: sound-vault
priority: near-term-planning
status: ready-for-gsd-discussion
depends_on:
  - Sound Vault custody D-01 through D-08
  - expiring access-grant foundation
  - accountable download state machine
  - immutable delivery receipts
  - counsel-approved contract and payment obligation rules
files:
  - .planning/ROADMAP.md
  - .planning/deliberations/sound-vault-master-custody.md
  - .planning/todos/pending/2026-09-01-expiring-access-link-lifecycle.md
  - .planning/todos/pending/2026-09-01-accountable-download-history.md
  - .planning/todos/pending/2026-09-01-immutable-delivery-receipts.md
---

## Owner-approved outcome

Allow properly authorized actors to stop an incorrect, unauthorized, compromised or
no-longer-valid delivery before its documented commit point while preserving completed
delivery facts and honoring executed legal obligations.

This TODO defines the implementation destination. It is not a claim that Funūn can
currently interrupt or recall every delivery method.

## Locked rules

- Every delivery method has an explicit commit point.
- Revocation stops future access; it does not delete assets, cancel agreements or recall files.
- Before, during and after-transmission outcomes remain distinct.
- Revocation requires action-specific authority and a recorded reason.
- Contract/payment obligations can limit or deny revocation.
- Authorization and child-credential issuance are atomic or equivalently race-safe.
- Clean-master child credentials remain minute-scale even within a longer parent window.
- Completed manifests, history, receipts and revocation evidence are never erased.

## GSD discussion agenda

### Commit-point matrix

- Inventory every preview, download, clean-master, document and partner-delivery method.
- Define prepared, released, opened, started, substantially transmitted and acknowledged
  boundaries for each method.
- Document which transports support mid-transfer interruption and which only stop new access.
- Map D-06 download states and D-07 receipts to each commit point.

### Authority and obligations

- Create a permission matrix for artist/controller, rights participant, representative,
  Funūn operator and automated safety control.
- Define reason codes, required explanations, approvals and notifications.
- Ask counsel to map executed licence, payment, approved credit, refund, dispute and
  court-order effects on revocation.
- Define denied/limited decisions and escalation/appeal handling.

### Race-safe enforcement

- Define transactional grant state/version checks before credential minting.
- Add idempotent revocation and concurrent-download tests.
- Decide whether clean masters require a controlled proxy/edge worker rather than a
  direct storage signed URL.
- Invalidate one-time credentials and refuse post-revocation range requests where supported.
- Keep neutral recipient states free of private dispute details.

### Product and operations

- Add clear "Revoke future access" language based on current delivery state.
- Preview the practical result before confirmation: prevented, interruptible or future-only.
- Create wrong-recipient/wrong-version correction flow with successor manifest/receipt.
- Build staff review for security/legal revocations and denied/limited outcomes.
- Add incident metrics for time-to-revoke, races, post-revocation requests and false actions.

## Recommended implementation stages

1. **Delivery-method audit** - commit points and interruption capabilities.
2. **Revocation state model** - authority, reasons, outcomes and immutable events.
3. **Obligation policy engine** - counsel-approved contract/payment gates.
4. **Atomic grant enforcement** - race-safe authorization and credential minting.
5. **Controlled clean delivery** - minute credentials and interruption-aware endpoint.
6. **Product controls** - outcome-aware confirmation, neutral recipient state and notifications.
7. **Correction integration** - successor manifest/grant/receipt without history deletion.
8. **Operations and security** - review, escalation, incident response and reporting.
9. **Concurrency/UAT pilot** - simultaneous revoke/download tests across supported methods.

## Acceptance pilot

- Revoke a prepared delivery and verify no access credential exists.
- Revoke an unopened grant and confirm the recipient sees a neutral unavailable state.
- Race revocation against credential minting and prove only one valid terminal outcome.
- Interrupt a controlled test transfer and record its exact D-06 state.
- Revoke after substantial transmission and show "future access revoked," never recall.
- Deny one revocation because the requester lacks authority.
- Limit one revocation based on a counsel-approved executed obligation.
- Correct a wrong-version delivery through a successor manifest and receipt.
- Preserve every grant, attempt, receipt, decision and notification in the audit chain.

## Claude / GSD instruction

Start with the delivery-method/commit-point audit and counsel decision matrix. Do not
promise mid-transfer interruption for direct signed URLs that cannot support it. Reuse
D-04 authority, D-05 parent grants, D-06 technical states and D-07 immutable receipts.
Treat the revoke/download race as a security-critical concurrency test, not only a UI flow.
