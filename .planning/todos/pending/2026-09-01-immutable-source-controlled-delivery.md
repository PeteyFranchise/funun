---
created: 2026-09-01T08:30:00-04:00
title: Implement immutable-source and controlled-delivery lifecycle
area: sound-vault
priority: near-term-planning
status: ready-for-gsd-discussion
depends_on:
  - Sound Vault custody D-01 through D-10
  - platform-wide custody and storage audit
  - counsel/privacy/security retention policy
files:
  - .planning/ROADMAP.md
  - .planning/deliberations/sound-vault-master-custody.md
  - .planning/todos/pending/2026-09-01-clean-master-isolation-distributor-delivery.md
  - .planning/todos/pending/2026-09-01-provenance-delivery-attribution-rights-enforcement.md
  - lib/storage/index.ts
---

## Owner-approved outcome

Preserve uploaded source bytes unchanged while retained; distinguish original,
designated master, use-approved master and delivery asset; create controlled copies for
human recipients; permit auditable direct machine transmission without exposing source
storage; and support transparent deletion, retention and corruption recovery.

This TODO is an implementation plan, not a claim that every lifecycle control is live.

## Locked rules

- Original bytes are never edited or overwritten.
- Replacement audio, processing and metadata changes create new records.
- Master designation and use approval are distinct from the uploaded asset.
- Human external delivery normally uses a separate delivery asset.
- Direct machine transmission may read verified source bytes only through an authorized
  frozen delivery and never exposes the storage path.
- Owner retrieval is explicit, strongly authenticated and audited.
- Immutable means unchanged while retained, not permanent refusal of deletion.
- Backup restore must match the original hash; otherwise it is a new asset/version.

## Consolidated GSD sequencing recommendation

The ten custody doctrines share infrastructure and should be planned as one program:

1. **Audit and threat model** - every storage, player, export, admin, AI, partner,
   retention and deletion path.
2. **Asset and provenance foundation** - original/version/derivative/delivery identities,
   hashes, parentage, immutable events and snapshots.
3. **Least-authority access** - action permissions, RLS, service roles, recent auth and
   break-glass operations.
4. **Derivative and isolation layer** - protected previews/evaluation copies, separate
   namespaces/capabilities and fail-closed behavior.
5. **Grant and delivery foundation** - expiring grants, named recipients, delivery
   profiles, manifests and controlled owner retrieval.
6. **History, receipts and revocation** - honest transmission sessions, canonical
   receipts, commit points, correction/supersession and race-safe revocation.
7. **Retention and recovery** - deletion authority, legal holds, tombstones, backup
   aging, integrity scans and corruption response.
8. **Release/distributor lane** - The Release Report package, secure manual export, then
   named-partner transport and acknowledgments.
9. **Forensic/detection partners** - recipient watermarking, licence ledger, Content ID
   or matching and human-reviewed enforcement.
10. **Controlled production pilot** - small catalogue, security/counsel/operations
    sign-off, metrics, rollback and truthful claims review.

GSD should split this into appropriately sized phases after the audit rather than force
all ten stages into one implementation phase.

## Item 10 discussion agenda

### Lifecycle and schema

- Map existing master/audio tables and storage objects to original, designated,
  use-approved and delivery identities.
- Define immutable field boundaries and allowed successor transitions.
- Model byte-identical copies versus transformed derivatives without duplicating provenance.
- Define master designation history and use-specific approval profiles.

### Delivery implementation

- Implement delivery-namespace copy creation for human recipients.
- Implement strongly authenticated owner retrieval without exposing storage paths.
- Define direct machine streaming with pre-send hash verification and output accounting.
- Reconcile transport acknowledgment and receipt generation.
- Evaluate storage/cost tradeoffs without weakening identity or audit boundaries.

### Retention, deletion and privacy

- Obtain counsel/privacy decisions on owner deletion, active obligations, legal holds,
  transaction evidence and statutory/contractual retention.
- Define immediate access shutdown, primary deletion, derived-asset handling and backup aging.
- Specify the minimal tombstone fields and who may access them.
- Add user-facing disclosure and deletion-status reporting.

### Integrity and recovery

- Schedule integrity verification for originals and high-value delivery assets.
- Define quarantine, alert, identical restore and unrecoverable-source workflows.
- Test that restoration cannot silently substitute different bytes.
- Create incident runbooks and artist communication templates.

## Recommended Item 10 implementation stages

1. **Current-state audit and migration design**
2. **Immutable asset/version schema and constraints**
3. **Original upload finalization and server hash verification**
4. **Designation and use-approval state machine**
5. **Controlled delivery-copy generation and provenance**
6. **Strongly authenticated owner retrieval**
7. **Direct machine transmission adapter contract**
8. **Retention, deletion, tombstone and backup-aging workflow**
9. **Integrity monitoring, quarantine and identical recovery**
10. **Migration/UAT and production rollout**

## Acceptance pilot

- Upload an original, verify its hash and create two new recording versions without mutation.
- Change Song Passport metadata and generate a new sidecar/tagged copy while the original hash remains unchanged.
- Designate and approve different masters for a release and a controlled sync test.
- Generate a human delivery asset and reconcile its provenance, manifest and receipt.
- Transmit exact bytes through a machine-delivery test without revealing the storage path.
- Retrieve the original through a recent-authenticated owner action with custody history.
- Restore a deliberately quarantined test asset only from an identical hash-matching backup.
- Reject a non-matching restore and create a successor asset/version instead.
- Complete an allowed deletion through access shutdown, object deletion, tombstone and
  documented backup-aging state.
- Demonstrate that transaction receipts persist only under the approved retention policy.

## Claude / GSD instruction

Treat D-01 through D-10 as locked product doctrine. Begin with the consolidated audit
and produce a phase split, dependency graph, data migration plan, threat model, retention
decision log and verification matrix before implementation. Do not equate storage
immutability with permanent retention, and do not expose original paths to avoid copying.
