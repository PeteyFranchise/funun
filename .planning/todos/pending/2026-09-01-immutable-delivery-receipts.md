---
created: 2026-09-01T07:00:00-04:00
title: Implement immutable delivery manifests and receipts
area: sound-vault
priority: near-term-planning
status: ready-for-gsd-discussion
depends_on:
  - Sound Vault custody D-01 through D-07
  - accountable download history state machine
  - counsel review of receipt language and evidence boundaries
files:
  - .planning/ROADMAP.md
  - .planning/deliberations/sound-vault-master-custody.md
  - .planning/todos/pending/2026-09-01-accountable-download-history.md
  - .planning/deliberations/ddex-production-readiness.md
  - docs/ddex-standards-map.md
---

## Owner-approved outcome

Every formal delivery produces an immutable pre-dispatch manifest and final outcome
receipt binding exact assets, hashes, metadata/rights snapshots, authority, agreement,
purpose, technical transmission and genuine recipient/partner acknowledgments.

This TODO defines the implementation destination. It does not claim that production
receipts, partner acknowledgments or DDEX acceptance are currently available.

## Locked rules

- Manifest and final receipt are distinct immutable records.
- Transmission and acknowledgment are separate states.
- Corrections create linked successor receipts; issued records are never rewritten.
- One canonical receipt is referenced across Contract Locker, deals, provenance and
  Song Passport rather than copied into divergent editable records.
- Human-readable and machine-readable representations resolve the same canonical data.
- A Funūn receipt is not notarization, registration, DDEX certification or proof of
  partner acceptance.
- External acceptance is recorded only from a real recipient/provider acknowledgment.

## GSD discussion agenda

### Receipt model and state machine

- Define delivery, manifest, receipt, package-item, acknowledgment and supersession tables.
- Bind every package item to D-03 asset hashes and immutable metadata/rights snapshots.
- Reconcile D-06 technical session states with receipt-level transaction states.
- Define idempotent issuance, retries, partial packages and concurrent acknowledgment handling.
- Define receipt schema/version migration without rewriting issued receipts.

### Authorization and release gate

- List the exact rights, approval, contract and payment/credit conditions that permit a
  manifest to become released for delivery.
- Capture the actor and authority record that approved release.
- Refuse receipt issuance when package integrity or required snapshots are incomplete.
- Keep the gate extensible for sync, distributor, direct buyer and internal transfer use cases.

### Presentation and verification

- Design the canonical receipt detail page and PDF/JSON renderers.
- Add receipt hashing plus server-signature/key-rotation verification design.
- Define public/recipient verification without exposing private deal or rights data.
- Link one canonical record from Contract Locker, deal, provenance and Song Passport.

### Acknowledgment and correction

- Add optional explicit recipient acknowledgment with authenticated identity and time.
- Normalize partner transport, accepted, rejected and correction messages.
- Define supersession, notification, disregard/delete request and acknowledgment trail.
- Preserve rejected/failed attempts without presenting them as completed delivery.

### External and DDEX path

- Map the chosen partner's real acknowledgment protocol.
- Store raw acknowledgment messages plus normalized status and correlation IDs.
- Preserve ERN update/takedown/rejection chains where applicable.
- Do not implement a generic "partner accepted" flag without source evidence.

## Recommended implementation stages

1. **Domain and schema design** - immutable manifest/receipt model and state machine.
2. **Package assembly** - exact asset, metadata, rights, agreement and purpose binding.
3. **Release gate integration** - rights, approval, contract and payment/credit checks.
4. **Technical outcome integration** - consume D-06 session facts without overstating them.
5. **Receipt issuance** - canonical JSON, hash/signature and human-readable page/PDF.
6. **Product placement** - Contract Locker, deal, provenance, Song Passport and recipient view.
7. **Acknowledgment flow** - recipient confirmation and authenticated audit event.
8. **Correction/supersession** - successor package, notification and preserved history.
9. **Partner adapter** - real transport/DDEX acknowledgments, errors and corrections.
10. **Controlled pilot** - one internal, one direct sync and one sandbox partner delivery.

## Acceptance pilot

- Prepare a delivery containing a final master, instrumental and Song Passport snapshot.
- Freeze an immutable manifest before access is granted.
- Satisfy a controlled signed-and-paid or approved-credit gate.
- Record technical transmission separately from recipient acknowledgment.
- Render matching human-readable and JSON receipts whose hash/signature verifies.
- Display the same canonical receipt through Contract Locker, deal and provenance views.
- Correct one deliberately wrong sidecar through a successor receipt without altering
  the original.
- Record one failed/rejected delivery without presenting it as completed.
- In a partner sandbox, store the real acknowledgment payload and normalized state.

## Claude / GSD instruction

Begin with the immutable schema and state machine. Do not generate a PDF first and call
it the source of truth. Consume D-06 facts exactly as observed, preserve D-03 hashes and
snapshots, and keep external acceptance impossible without a real acknowledgment event.
Treat receipt wording, signatures/key custody and evidence claims as counsel/security
review checkpoints.
