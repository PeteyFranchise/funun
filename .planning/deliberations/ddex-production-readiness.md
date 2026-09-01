# DDEX Production Readiness and Partner-Validated Delivery

**Status:** Owner-directed ASAP roadmap, 2026-09-01
**Sequence:** Immediate parallel track -> Phase 37.4 -> Phase 37.5 -> membership/standards expansion review
**Product dependency:** Phase 37.3 Song Passport supplies the confirmed metadata snapshot
**External dependency:** A named receiving partner supplies the accepted message profile and delivery contract

## The outcome

Funūn becomes a **licensed DDEX implementer with a registered DPID and a
partner-validated production feed**. That is the target. There is no broad company or
platform badge in the current DDEX implementation guidance that justifies saying
"DDEX certified."

The evidence ladder is:

1. **Implementation Licence** - legal permission to use DDEX standards commercially
2. **DPID** - unique sender/recipient identity in DDEX messages
3. **Schema validation** - structural conformance for one exact standard/version
4. **Semantic validation** - correct business meaning, identifiers, profiles and assets
5. **Partner acceptance** - one named recipient has passed the feed through its UAT
6. **Production operation** - acknowledgments, errors, updates, takedowns and monitoring work

Licence, DPID, membership and schema validation are not substitutes for partner acceptance.

## Current Funūn baseline

- ERN 3.5.1 generator is XSD-valid but uses placeholder sender/recipient DPIDs.
- RDR-N-oriented export uses the MLC 1.31 schema and a placeholder DPID.
- RIN is not emitted.
- Audio `TechnicalDetails`, partner-specific package rules and production choreography
  are incomplete.
- No recipient sandbox/UAT or production feed has accepted Funūn messages.
- Therefore the accurate current claim is "schema-valid, standards-aware exports," not
  certified or production-connected delivery.

## Immediate parallel track - start before Phase 37.3 completes

Owner actions are tracked in
`.planning/todos/pending/2026-09-01-ddex-license-dpid-and-partner-discovery.md`:

- Apply for the free DDEX Implementation Licence and DPID
- Store the DPID in deployment configuration, never source code
- Select one named receiving partner
- Obtain its accepted ERN version, profile, choreography, packaging and UAT requirements
- Freeze truthful claim language

This track may run alongside 37.2 and 37.3 because it is administrative/discovery work,
not implementation against an unfinished Song Passport model.

## Phase 37.4 - DDEX Production Readiness

**Purpose:** Turn standards-aware exports into a licensed, current, validated message
system ready to enter a real partner sandbox.

Run `/gsd-discuss-phase 37.4` after Phase 37.3 and once the immediate track has either
partner requirements or a clearly documented dependency block.

### Workstream A - Standards and identity registry

- Central registry of implemented standards, versions, profiles, namespaces and XSDs
- Real sender DPID configuration with startup/export fail-closed behavior in production
- Explicit recipient DPID input; no universal placeholder recipient
- Message IDs, thread IDs, `SentOnBehalfOf` and party-role rules
- Environment separation for fixtures, sandbox and production

### Workstream B - ERN delivery message

- Implement the exact partner-approved version/profile; default research target is the
  current ERN 4.3.x family, not an unscoped "4.3-aligned" claim
- Build PartyList/reference architecture where required
- Map the confirmed Song Passport snapshot into release, resource, party, contributor,
  rights, deal and territorial structures
- Add audio/artwork `TechnicalDetails`, file references, codecs, sizes and hashes
- Support initial delivery, update and takedown message semantics
- Retain the existing ERN 3.5.1 exporter only if a named partner still requires it

### Workstream C - Validation and evidence

- Validate every message against the normative XSD and allowed value sets
- Run release-candidate samples through DDEX's official online validator
- Add semantic rules that XSDs cannot prove: identifier ownership/shape, references,
  rights periods, territories, asset hashes, delivery-safe metadata and profile rules
- Golden fixtures plus adversarial fixtures for missing parties, invalid IDs, duplicate
  references, stale snapshots and mismatched assets
- Machine-readable validation report with exact standard/profile version
- Block production export on placeholders, unresolved required facts or validation errors

### Workstream D - Song Passport and adjacent standards

- Preserve one canonical mapping from Song Passport facts to every output
- Design the RIN 2.1 recording/session mapping for Writer's Room provenance
- Upgrade/evaluate the RDR-N path against the current partner-required RDR-N profile
- Record MWN 1.3.x as a future musical-work messaging path; CWR remains a separate CISAC lane
- Do not implement PIE/MEAD/DSR merely to collect standards; add them only for a named transaction

### Workstream E - Governance and claims

- Standards/version inventory and owner
- Upgrade/deprecation policy
- Change log for schema/profile migrations
- Runbook for failed validation and corrupt/mismatched packages
- Approved claims matrix tied to real evidence
- Correct all internal documentation that confuses schema-valid with production-ready

### Phase 37.4 definition of done

- Implementation Licence granted and DPID configured, or an explicit owner-action block
- No placeholder DPID can pass a production export
- The selected ERN message/profile validates against normative schemas and official validator
- Semantic validation rejects every agreed adversarial fixture
- Song Passport -> release package requires no manual metadata re-entry
- Package contains required audio/artwork references, codecs, sizes and hashes
- Update and takedown messages are generated deterministically
- Validation evidence identifies exact standard, version, profile, snapshot and build
- Partner sandbox handoff package is ready; no claim of partner acceptance is made yet

## Phase 37.5 - Partner-Validated Direct Delivery

**Purpose:** Make one named receiving relationship work end to end before generalizing.

This phase cannot be planned responsibly without the partner's technical onboarding
contract. If the selected partner does not accept direct feeds, choose an authorized
aggregator/technical service provider and preserve Funūn/label identity using the agreed
DPID and `SentOnBehalfOf` model.

### Workstream A - Partner adapter and transport

- Partner-specific message profile and required extensions
- Approved transport: cloud choreography, SFTP or web services
- Secret management, encryption, least privilege and endpoint allowlisting
- Idempotent package/message submission
- Audio/artwork upload and referential integrity

### Workstream B - Operational choreography

- Receive and correlate acknowledgments
- Classify validation, asset, commercial and transient failures
- Safe retries with backoff and duplicate protection
- Corrected redelivery tied to the original thread/message
- Updates, withdrawals and territorial takedowns
- Delivery ledger visible to authorized staff

### Workstream C - Sandbox and production pilot

- Partner-provided fixtures and edge cases
- Sandbox delivery, rejection correction and successful acknowledgment
- Security/operational review
- Controlled pilot catalogue with owner-approved artists/releases
- Monitor delivery latency, rejection causes and manual correction work
- Rollback/disable switch for the partner adapter

### Phase 37.5 definition of done

- Named partner provides written sandbox/UAT acceptance
- At least ten controlled pilot deliveries are accepted and acknowledged
- One metadata correction/update is accepted
- One withdrawal/takedown is accepted in the sandbox or production-safe test mechanism
- Retry/idempotency tests prove duplicate submissions do not create duplicate releases
- Delivery ledger reconciles every sent message to its acknowledgment or owned incident
- No clean master is exposed outside the approved delivery channel
- External claim names the partner, standard/version and actual production status precisely

## Membership decision - after the first production feed

DDEX membership is optional and is not certification. Review membership after partner
acceptance when Funūn can judge whether working-group access, standards influence and
industry credibility justify the annual cost. Membership makes strategic sense if Funūn
is actively shaping independent-artist needs in RIN, ERN, contributor identity, AI
disclosure or rights data; it does not make sense merely for a logo.

## Success metrics

- 100% of release-candidate messages pass schema and semantic validation
- Zero placeholder DPIDs in sandbox/production packages
- Zero manual re-entry from confirmed Song Passport facts into the ERN package
- Partner rejection rate and correction time trend down across the pilot
- Every sent message has a final acknowledgment or an owned incident
- Update/takedown completion is measurable and auditable
- Marketing claims remain exactly aligned with licence, validation and partner evidence

## Approved external language by maturity

**Today:** "Funūn generates schema-valid, standards-aware metadata exports."

**After licence + DPID:** "Funūn is a licensed DDEX implementer building
partner-validated delivery feeds."

**After partner UAT:** "Funūn's [standard/version] feed has been tested and accepted by
[Partner] for [sandbox/production] delivery."

Never use "DDEX certified" unless DDEX itself introduces and grants a specific current
certification whose scope is named in the claim.

## Official references

- Implementation licensing: https://kb.ddex.net/general-implementation-guidance/licensing-the-standards/
- DPID guidance: https://kb.ddex.net/general-implementation-guidance/licensing-the-standards/ddex-party-identifier-%28dpid%29/
- Message validation: https://kb.ddex.net/general-implementation-guidance/validating-ddex-messages/
- Current standards: https://kb.ddex.net/reference-material/standards-specifications/
- Membership: https://ddex.net/membership/

## Claude / GSD instruction

Treat the evidence ladder, truthful claims, immediate licence/DPID track, ERN-first
partner strategy and separation between 37.4 readiness and 37.5 partner delivery as
owner-approved. Do not invent a generic receiving profile, claim certification, apply
externally, contact partners or choose commercial terms without owner authority.
