---
created: 2026-09-01T05:15:00-04:00
title: Plan and implement provenance, recipient attribution and licensed-use enforcement
area: sound-vault
priority: near-term-planning
status: ready-for-gsd-discussion
depends_on:
  - Sound Vault custody D-01 through D-03
  - music/IP counsel authority and enforcement review
  - forensic watermarking partner selection
  - Content ID or rights-management partner selection
files:
  - .planning/ROADMAP.md
  - .planning/deliberations/sound-vault-master-custody.md
  - .planning/todos/pending/2026-08-16-research-watermarking-alternatives-and-competitor-content-pr.md
  - lib/watermark/provider.ts
  - lib/watermark/stream-preview.ts
  - lib/storage/index.ts
---

## Owner-approved outcome

Build an evidence-backed custody chain from immutable original through every derivative
and delivery. Know which recipient received which authorized copy. Use specialist
partners for recipient-specific forensic watermarking and online acoustic matching,
then compare matches against a real licence ledger before any human-reviewed
enforcement action.

This TODO records a shippable destination, not a current product claim.

## Product doctrines that must not be re-litigated

- SHA-256 is the first authoritative file-integrity algorithm; the schema remains
  algorithm-extensible.
- Every original and derivative has its own hash and provenance record.
- Hashes prove byte identity, not ownership, authorship or licence authority.
- Delivery logs identify receipt; leak attribution requires a recipient-specific
  forensic copy.
- The watermark payload uses an opaque delivery ID rather than exposed recipient data.
- Acoustic detection and recipient attribution are separate systems.
- Every detected use is checked against licences and allowlists.
- Valid licensees must be protected from improper claims.
- Enforcement requires artist/rights-holder authority and human review.
- Funūn initially partners for forensic watermarking, platform matching, Content ID
  administration and external claim/revenue rails.

## GSD discussion agenda

### Integrity and provenance

- Audit every current audio upload and derived-file path.
- Define asset, hash, derivation and immutable-event tables.
- Define upload-completion hashing, delivery-time verification and mismatch response.
- Reconcile recording versions with Song Passport snapshots.
- Establish retention, backup, deletion and correction policy with privacy/counsel input.

### Recipient attribution

- Compare production-grade forensic audio-watermark vendors.
- Test WAV, MP3, AAC, common platform transcodes, volume changes, trimming and excerpts.
- Define opaque payload size, key custody, recovery API, false-positive threshold and
  investigation protocol.
- Specify when a protected preview, forensic copy or clean master is appropriate.
- Define the language shown to artists and recipients without making absolute promises.

### Licence ledger and authorized-use protection

- Model buyer, campaign, media, territory, term, usage, version, rights, agreement and
  payment/authorization state.
- Define allowlist sources and licence amendments, expiration and revocation.
- Ensure sync, distribution, promotional and user-generated-content permissions can be
  distinguished.
- Decide which record wins when delivery, contract and platform metadata conflict.

### Detection and enforcement

- Select a partner with eligible-catalogue screening, reference delivery, match feeds,
  allowlisting, dispute handling, reporting and revenue reconciliation.
- Define artist authorization and Funūn's role: software provider, administrator,
  authorized agent or another counsel-approved relationship.
- Define mandatory human review, escalation, release and counter-notice workflows.
- Establish false-claim remediation, emergency stop and partner offboarding procedures.
- Revalidate current platform rules before implementation and launch.

## Recommended implementation sequence

1. Integrity foundation
2. Delivery identity
3. Forensic watermark partner pilot
4. Licence and allowlist ledger
5. Acoustic-matching/Content ID partner pilot
6. Human-reviewed enforcement operations
7. Controlled launch and reconciliation

Do not combine these into one opaque integration. Each stage needs its own acceptance
tests and rollback/stop conditions.

## Pilot definition of done

- Five rights-clean recordings with explicit artist authorization
- At least two controlled recipients per recording
- A unique forensic delivery copy and delivery record for every recipient
- Hash and derivation verification from master through delivered copy
- Successful watermark recovery after the partner-agreed transformation test set
- At least one authorized test match correctly allowlisted
- At least one simulated unauthorized match routed to human review
- No automated claim or takedown without documented authority and approval
- Evidence, decision, action, dispute and outcome visible to the authorized artist
- Counsel, security/privacy and operations sign-off before any live enforcement

## Claims boundary

Until the complete pilot passes, do not say Funūn automatically protects songs online,
traces every leak, provides Content ID, stops infringement, issues takedowns, or collects
platform revenue. Approved forward-looking language may describe controlled delivery,
forensic-watermark and rights-administration capabilities as planned or in development.

## Claude / GSD instruction

Begin by auditing the current storage, watermark, Selects download, deal and metadata
snapshot paths. Preserve Phase 31's structural never-clean-master preview guarantee.
Use partner discovery and counsel review as explicit gates; do not invent platform
access, legal authority or production integrations.
