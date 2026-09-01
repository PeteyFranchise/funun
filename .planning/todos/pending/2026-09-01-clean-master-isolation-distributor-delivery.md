---
created: 2026-09-01T08:00:00-04:00
title: Implement clean-master isolation and authorized distributor delivery
area: sound-vault
priority: near-term-planning
status: ready-for-gsd-discussion
depends_on:
  - Sound Vault custody D-01 through D-09
  - Song Passport and The Release Report readiness model
  - expiring access, download history, receipts and revocation foundations
  - named distributor requirements for direct delivery
files:
  - .planning/ROADMAP.md
  - .planning/deliberations/sound-vault-master-custody.md
  - .planning/deliberations/ddex-production-readiness.md
  - .planning/todos/pending/2026-09-01-ddex-license-dpid-and-partner-discovery.md
  - lib/watermark/provider.ts
  - lib/storage/index.ts
---

## Owner-approved outcome

Make it structurally impossible for any listening, browsing, sharing, pitching or
evaluation surface to resolve a clean master. Release clean masters only through an
explicit owner-retrieval or approved delivery profile, including a distributor lane
authorized through The Release Report.

This TODO is an execution plan. It does not claim complete cross-platform isolation or
live direct distributor delivery today.

## Locked rules

- Original, protected/evaluation and approved-delivery assets are separate classes.
- No preview or evaluation route may resolve the original-master namespace.
- Missing derivatives fail closed; the master is never a fallback.
- Owner original retrieval is explicit and strongly authenticated.
- Sync clean delivery uses the signed-and-paid/approved-credit profile.
- Distributor delivery uses The Release Report's release-specific gate; payment applies
  only if required by that distributor arrangement.
- Manual package export is not distributor receipt or acceptance.
- Direct acceptance exists only with a real named-partner acknowledgment.

## GSD discussion agenda

### Cross-surface data-flow audit

- Trace every playback, share, download, export, email, admin, support, AI, partner,
  debugging, migration and storage-console path from record ID to storage object.
- Classify every asset and accessor; locate arbitrary-path and master-fallback behavior.
- Confirm service-role use, RLS, bucket policies and signed-URL functions by threat model.
- Add a remediation register with owner, severity and test for every path.

### Asset and storage architecture

- Define original, preview, evaluation and approved-delivery schemas/namespaces.
- Add database constraints preventing preview/evaluation records from pointing to originals.
- Separate service permissions for preview playback, owner retrieval and formal delivery.
- Define derivative jobs, readiness/failure states, hashes and provenance.
- Ensure logs/errors never expose private storage paths.

### Dedicated capability services

- Protected preview accessor accepts preview IDs only.
- Evaluation download accessor accepts approved evaluation-delivery IDs only.
- Owner retrieval requires ownership/authority plus recent strong authentication.
- Formal clean delivery accepts a frozen delivery/manifest ID and approved profile only.
- Add asset-class, cross-account, revocation and expiry checks at every boundary.

### The Release Report distributor lane

- Define release-master selection and technical validation.
- Reconcile confirmed Song Passport metadata, release identifiers, artwork, rights and territories.
- Capture explicit artist authority and distributor relationship/agreement.
- Freeze package manifest and create controlled clean delivery assets.
- Provide secure manual export first if no named direct partner is ready.
- Integrate direct partner/DDEX transport only after partner requirements and sandbox UAT.

### Delivery profiles

- Keep sync signed-and-paid/approved-credit requirements separate from distributor gates.
- Define owner retrieval, sync, distributor, broadcaster and other future profiles as
  explicit policy records rather than scattered conditional logic.
- Bind each profile to required gates, permitted asset class, recipient identity,
  acknowledgments, revocation and receipt behavior.

## Recommended implementation stages

1. **Platform-wide audit** - inventory and classify every master-capable path.
2. **Asset-class foundation** - schema, storage namespaces, constraints and service roles.
3. **Derivative pipeline** - protected playback/evaluation assets with fail-closed states.
4. **Capability split** - preview, evaluation, owner retrieval and clean-delivery services.
5. **Security regression suite** - path substitution, cross-account, missing derivative,
   revocation, expiry, logging and privilege tests.
6. **The Release Report gate** - release readiness, authority and frozen manifest.
7. **Secure manual distributor export** - clean package, owner retrieval and truthful receipt.
8. **Named partner adapter** - requirements, DDEX/package mapping and secure transport.
9. **Sandbox acknowledgment loop** - rejection, correction, update and takedown evidence.
10. **Controlled production pilot** - ten approved releases with monitoring and stop switch.

## Acceptance pilot

- Every public, bearer and ordinary playback route fails a master-path substitution test.
- Missing preview and evaluation assets fail closed without master fallback.
- Owner retrieval requires recent authentication and creates custody history.
- A sync delivery cannot pass without its signed-and-paid/approved-credit profile.
- A distributor package passes the release-specific gate without an irrelevant sync-payment rule.
- One manual package records prepared/exported status only.
- One named partner sandbox package records actual rejection, correction and acceptance messages.
- Hashes, metadata/rights snapshots, manifests and receipts reconcile across every test.
- No clean master appears outside a dedicated approved retrieval/delivery channel.

## Claude / GSD instruction

Begin with the complete data-flow audit; do not generalize from Phase 31 Selects tests.
Replace arbitrary-path access with asset-class-specific capabilities and fail closed.
Reuse D-03 provenance, D-04 authority, D-05 access grants, D-06 history, D-07 receipts
and D-08 revocation. Coordinate direct distributor work with Phases 37.4/37.5 and never
claim receipt/acceptance without a real partner acknowledgment.
