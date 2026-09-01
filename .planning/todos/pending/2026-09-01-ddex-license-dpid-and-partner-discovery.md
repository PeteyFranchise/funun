---
created: 2026-09-01T03:00:00-04:00
title: Obtain DDEX licence and DPID, then select the first receiving partner
area: metadata
priority: immediate-parallel
status: owner-action-and-discovery
depends_on: []
files:
  - .planning/deliberations/ddex-production-readiness.md
  - docs/ddex-standards-map.md
  - lib/metadata/export.ts
  - lib/metadata/rdr-export.ts
---

## Why this starts now

The administrative and partner-discovery work does not depend on finishing Song
Passport. Starting now prevents Phase 37.4 from completing technically while still
waiting for a sender identity or discovering that the intended recipient requires a
different ERN version, profile or transport.

## Owner actions

### 1. Apply for the free DDEX Implementation Licence and DPID

Use Funūn's final legal entity information and an owner-controlled company email.
Official guidance and application path:

- https://kb.ddex.net/general-implementation-guidance/licensing-the-standards/
- https://kb.ddex.net/general-implementation-guidance/licensing-the-standards/ddex-party-identifier-%28dpid%29/

Record securely outside git:

- Licensed legal entity name
- Acceptance date
- Assigned DPID
- DPID-registry account owner
- Recovery contact
- Any licence correspondence

Do not put registry credentials or non-public company data in the repository. Add only
the production `DDEX_DPID` environment variable through the deployment secret manager.

### 2. Name the first receiving partner

Recommended first discovery target: the distributor/operations partner most relevant
to Funūn's initial label pilot, potentially Secretly. A generic direct-delivery adapter
must not be built before one real recipient defines the contract.

Ask the partner:

- Do you accept direct feeds from technology platforms like Funūn?
- Which ERN version and release profile do you require?
- Which choreography and transport do you support: cloud storage, SFTP or web services?
- What are your sender/recipient DPID and onboarding requirements?
- Which fields do you require beyond the base schema?
- What audio formats, codecs, filenames, hashes and artwork packages are required?
- How do acknowledgments, validation errors, retries, updates and takedowns work?
- Is there a sandbox, test catalogue or formal partner-conformance process?
- Can Funūn deliver on behalf of labels/artists, and how is `SentOnBehalfOf` represented?
- What commercial, security, support and volume requirements apply?

### 3. Freeze external claim language

Until partner UAT passes, approved language is:

> Funūn generates schema-valid, standards-aware metadata exports and is building toward
> licensed, partner-validated DDEX delivery.

Do not say DDEX certified, universally compliant, DSP connected or production-delivery
ready. After the licence/DPID but before partner UAT, say "licensed DDEX implementer"
only if the implementation licence has actually been granted.

## Completion evidence

- Licence acceptance and DPID received
- Deployment owner confirms `DDEX_DPID` is stored as a secret
- One receiving partner and a named technical/business contact selected
- Partner requirements or a documented response/non-response recorded
- Exact ERN version, profile and choreography selected or explicitly marked blocked on partner
- `/gsd-discuss-phase 37.4` can begin with these inputs

## Claude / GSD instruction

This TODO is parallel owner/discovery work. Do not fabricate a DPID, apply externally,
contact a partner or select a partner profile without owner authorization. Do not allow
a placeholder DPID in any production delivery path.
