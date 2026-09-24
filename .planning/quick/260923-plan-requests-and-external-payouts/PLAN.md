# Plan: Requests Center and Secure External Payout Sharing

**Date:** 2026-09-23
**Type:** planning-only documentation
**Implementation:** explicitly out of scope

## Scope

- Preserve the owner's product decisions about what belongs in Settings versus an action center.
- Design a safe off-platform payment-information workflow without weakening the existing prohibition on granting payout or tax access through generic workspace permissions.
- Divide implementation into phases that Claude can execute and verify independently.
- Update the roadmap and create phase context/plan artifacts.

## Assumptions and hard boundaries

- Production is at migration 227. Migration 228 is reserved for the storage-attribution repair and is unavailable.
- Every new migration is human-gated: plans may author SQL, but may not apply it or claim it is applied.
- `main` is protected. This task changes planning files only.
- Bank and tax values are restricted secrets. They may not enter notifications, URLs, ordinary upload packages, analytics, application logs, error trackers, or audit payloads.
- A contributor authorizes disclosure of their own information. A workspace owner cannot disclose it for them.
- Existing Stripe Connect details remain a Funūn payout rail and are not exported to third-party payers.

## Deliverables

1. Two owner-facing Markdown plans in `.planning/reviews/`.
2. Phase 42: Member Requests Center and Settings information architecture.
3. Phase 43: External payout profile and consent foundation.
4. Phase 43.1: Recipient delivery and upload-package integration.
5. Roadmap entries with dependencies, gates, and plan order.

## Verification

- Confirm every referenced plan file exists and every roadmap link/identifier matches it.
- Search all artifacts for accidental claims that a migration is applied.
- Confirm Phase 43/43.1 require threat-model and owner checkpoints before sensitive persistence or delivery.
- Confirm no plan adds payout/tax capabilities to `WorkspacePermission`.
- Confirm default packages contain only a readiness manifest and secure link, never raw bank or tax data.
