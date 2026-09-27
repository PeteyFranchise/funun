# Direct Rights Registration, Publishing & Distribution Doctrine

**Status:** Owner-approved company direction recorded 2026-09-26
**Authority:** Long-term product, data and operating-model doctrine; not a statement of current
capability and not authority to contact, contract with or submit to an outside party
**Applies to:** Song Passport, Sound Vault, Writer's Room, Split Sheets, Contract Locker, Release
Report, rights registrations, catalogue operations, payouts and every future partner adapter
**Related:** `docs/cwr-plan.md`, `.planning/deliberations/song-passport-doctrine.md`,
`.planning/todos/pending/2026-09-26-start-path-b-cwr-sender-business-track.md`,
`.planning/todos/pending/2026-09-01-distributor-api-partner-evaluation.md`,
`.planning/todos/pending/2026-09-01-funun-owned-distributor-option.md`

## Owner-approved north star

Funūn will develop toward three separate capabilities:

1. **Publisher / publishing administrator:** represent and administer compositions for which
   Funūn has an express publishing or administration mandate, register those works, maintain
   claims, reconcile conflicts and—only when the governing agreements and operations permit—
   collect and account for publishing income.
2. **Authorized registration service:** submit, revise, monitor and, where permitted, revoke
   registrations for works that Funūn does **not** publish or administer, under a narrower express
   mandate from the relevant rights holders. Funūn's role here is a filing/submission agent, not
   owner, publisher or royalty claimant.
3. **Music distributor:** deliver authorized masters and release metadata, receive destination
   statuses, manage corrections and takedowns and, only when the contracts and accounting stack
   support it, receive and account for distribution income.

The preference is to build the shortest responsible path between the creator or rights controller
and the actual registry, society, mechanical collective, DSP or store. Funūn should remove
avoidable re-entry, avoid permanent dependence on an intermediary's private data model and pursue
its own accepted sender and recipient relationships as volume, trust, legal authority and
operations make that possible.

This is **direct-first**, not “no vendors at any cost.” A technical transport provider, validator,
payment processor, identity provider or transitional upstream distributor may be the responsible
choice. The question is whether the dependency adds necessary capability and remains replaceable,
not whether Funūn wrote every transport protocol itself.

## Permanent separations

The three capabilities may share canonical data and infrastructure. They must not share implied
authority.

- Publishing ownership, publishing administration, registration-only authority, master ownership,
  distribution authority, collection authority and payout authority are different grants.
- A Funūn account, collaborator link, roster row, room membership, credit, uploaded document,
  approved split or signature does not by itself grant any of those roles.
- Authority must identify the principal, grantee, capacity, covered works or recordings,
  permitted actions, territories, term, effective dates, revocation/correction rules and source
  instrument.
- Funūn must never register its own publishing interest where it has only a registration-service
  mandate, or distribute a master because it can register the composition.
- A registration-only customer keeps their publishing. A distribution customer keeps every right
  not expressly granted. Product copy and records must make that visible.
- Money collection is a separate operating threshold. Submission authority does not silently
  authorize collection, deductions, reserves or payout instructions.

These distinctions must be represented in server and database controls, not only in contract copy
or hidden UI.

## What “one click” eventually means

One action may initiate a prepared set of authorized submissions. It does not collapse different
registries into one legal or technical event.

A trustworthy registration action binds:

- the exact Song Passport and rights snapshot;
- the people and entities whose mandates authorize the action;
- the role in which Funūn is acting for each share;
- destinations and destination-specific profiles;
- generated message/file versions and identifiers;
- transmission attempts, checksums and sequence/correlation IDs;
- first and subsequent acknowledgements;
- accepted, accepted-with-change, duplicate, conflict, rejected and no-participation outcomes;
- corrections, replacements, recalls/revocations and the immutable history between them.

“Prepared,” “submitted,” “received,” “accepted” and “registered” remain different states. Funūn
does not market one-click registration merely because it can produce or upload a CWR file.

## Directness and partner policy

Future vendor and integration decisions follow these rules:

1. Prefer an accepted direct rail to a registry, society, collective, DSP or store when Funūn can
   meet its legal, commercial, technical, fraud, support and volume requirements.
2. Use a partner when it shortens the responsible path to market, supplies a relationship Funūn
   cannot yet obtain, or materially improves safety or reliability.
3. Keep Song Passport, authority, asset, submission, acknowledgement, accounting and audit records
   canonical in Funūn. A partner ID is a mapping, not the primary identity.
4. Require data export, identifier continuity, corrections, takedowns, termination behavior and a
   migration path before relying on a partner.
5. Do not collect members' PRO, distributor or bank passwords and do not automate their websites
   by scraping or impersonating a user. Use approved files, SFTP, APIs and recipient onboarding.
6. Describe the actual relationship. “Powered by,” “submitted through” and “direct” are not
   interchangeable claims.
7. A successful relationship with one destination never implies universal coverage.

## Data architecture mandate

All future product and data-model work must preserve the ability to generate, send, reconcile and
correct rights and release messages without forcing users to re-enter authoritative facts.

### Identity and party data

- Keep a person distinct from legal entities, publishers, administrators, labels and distributors.
- Support professional names, legal names and registry identifiers as provenance-bearing values,
  not one mutable display-name field.
- Model writer and publisher identities separately, including multiple IPI name numbers or
  capacities where rights-operations validation requires them.
- Treat PRO/CMO affiliations, publisher relationships and administrator relationships as scoped
  and time-aware rather than timeless profile labels.

### Rights and share data

- Keep writer shares, publisher shares, administration interests and master interests separate.
- Support territory, right type, term, effective date and source instrument where a claim can vary
  by those dimensions.
- Distinguish a declaration, subject confirmation, executed agreement, registry-returned value and
  Funūn operational verification.
- Preserve conflicts; never overwrite one claimant's statement with another's or mistake a
  registry match for ownership authority.

### Work, recording and release data

- Keep the composition, each recording version and each release manifestation separate, as required
  by Song Passport doctrine SP-03.
- Preserve alternate titles, contributor roles, society work IDs, ISWC, ISRC, UPC and recipient
  mappings with their issuers and provenance.
- Bind every registration and delivery to an immutable snapshot and exact asset/version where
  applicable.

### Authority and lifecycle data

- Store the exact capacity in which Funūn acts: publisher, administrator, registration agent,
  distributor or another expressly defined role.
- Make grants purpose-bound and revocable; record who granted them and which instrument supports
  them.
- Build submission, acknowledgement, conflict, correction, recall/revocation and takedown as one
  lifecycle rather than a fire-and-forget export.
- Keep financial authority and payment instructions outside ordinary workspace permissions and
  outside general rights metadata.

### Collection discipline

The north star is not permission to ask every member for every field on signup. Collect information
progressively when a real workflow needs it, explain why it is needed, let the described person
confirm their identity data and restrict visibility by purpose. Reuse approved facts; do not copy
sensitive values into every project, card or export.

## Required questions in every future design or plan

Any feature that captures contributor, rights, work, recording, release, authority, payment or
recipient data must answer:

1. Which canonical entity owns this fact, and is it composition-, recording- or release-level?
2. Who supplied it, who may confirm it and what evidence or agreement governs it?
3. Does it describe ownership, administration, filing authority, distribution authority,
   collection authority or only a credit?
4. Can the value vary by territory, right, date, version or professional identity?
5. Which private fields may each user, workspace role and recipient see?
6. What immutable snapshot uses it, and how are later corrections represented?
7. Can it map into current CWR/EBR, future MWN, ERN or a recipient-specific schema without
   becoming schema-specific canonical data?
8. What acknowledgement proves the destination's outcome?
9. How can Funūn replace a provider without losing identifiers, authority records, status or
   history?
10. Does the UI avoid implying that Funūn currently publishes, distributes, registers or collects
    when the applicable relationship is only planned?

A plan that cannot answer these questions may still be exploratory, but it is not ready to become
the canonical rights or delivery path.

## Staged operating path

### Stage 0 — Registration- and delivery-ready truth

Finish the canonical identity, share, authority, snapshot, provenance and privacy model. Validate
CWR and DDEX outputs against current recipient specifications. Preserve self-service export and
deep-link paths while direct submission is unavailable.

### Stage 1 — Funūn as an approved registration sender

Establish the legal entity/capacity, publisher affiliation and identifiers required by the chosen
recipients. Begin with a tightly controlled catalogue whose authority is unambiguous. For North
American performance registrations, evaluate MusicMark's current publisher onboarding because it
accepts one CWR or EBR submission for ASCAP, BMI and SOCAN and returns acknowledgement files.
Recipient onboarding—not the public existence of a file format—decides whether and how Funūn may
submit on behalf of others.

This publisher/society workstream has a second potential payoff: publisher-facing IPI services can
improve identity consistency before registration. CISAC says publishers may request the IPI Pocket
Edition and describes ISWC IPI Context Search as an API for publishers. Treat this as one
coordinated strategy with two benefits, but keep registration-sender approval and identity-service
access as separately evidenced capabilities. The entity/capacity choice gates business onboarding;
it does not block canonical data and validation work that can proceed in parallel.

### Stage 2 — Registration-only service for non-administered works

After counsel-approved mandates, recipient approval and proven acknowledgements/corrections, allow
rights holders to appoint Funūn only to register named works. Keep this product and its records
separate from a publishing-administration agreement and from royalty collection.

### Stage 3 — Publishing administration

Offer publishing or administration only after the catalogue policy, claims/conflict operation,
royalty data, accounting, statements, tax, payout, audit and support functions are ready for the
scope promised. Start with narrow territories or rights if that is what Funūn can operate well.

### Stage 4 — Distribution

Use the existing progression: disclosed partner-powered pilot, managed hybrid, then selective
direct DSP relationships. Graduation depends on rights cleanliness, catalogue scale, fraud and
content-policy performance, DDEX/partner acceptance, acknowledgement reliability, royalty
reconciliation, payouts and staffed support—not ambition alone.

The stages may overlap, but no later-stage claim is unlocked merely because an earlier technical
export works.

## Current capability truth

As of 2026-09-26, this document records an approved destination, not shipped functionality.

- Funūn can guide and track registration readiness and has a draft CWR 2.1 generator; its output
  still requires recipient validation and an onboarded sender rail.
- Funūn is not currently a PRO/CMO registration sender, publisher, publishing administrator,
  distributor of record, direct DSP supplier or royalty collection service.
- MusicMark publicly supports publisher CWR/EBR submission to ASCAP, BMI and SOCAN, including test
  onboarding and acknowledgements. That makes it a candidate direct rail, not an approved Funūn
  account or integration.
- DDEX MWN supports musical-work claim communication, including registration, conflicts and
  revocations, and remains a future standards path; recipient adoption and implementation
  licensing must be verified before it is selected.
- The MLC public search API is a read rail, not a registration submission API.

## Decision and claim governance

- Owner approval establishes this direction but does not authorize external applications,
  contracts, submissions, user-facing claims or production launch.
- Counsel decides the legal entity, mandate language, fiduciary/agency boundaries, collection and
  payment obligations and territory-specific requirements.
- Rights operations owns recipient onboarding, test catalogues, conflict handling and corrections.
- Engineering owns canonical models, adapters, validation, security, acknowledgements,
  observability and portability.
- Product and marketing may describe only the capability and destinations proven in production,
  following Song Passport doctrine SP-25.

## Official references to re-verify at decision time

- MusicMark overview and CWR/EBR scope: https://www.musicmark.com/
- MusicMark terms and eligibility: https://www.musicmark.com/terms.html
- MusicMark test/onboarding materials: https://musicmark.com/documents/musicmark_ebr_getting_started_v2.0.pdf
- CISAC IPI system and publisher Pocket Edition: https://www.cisac.org/services/information-services/ipi
- CISAC ISWC IPI Context Search for publishers:
  https://www.cisac.org/Newsroom/news-releases/cisac-launches-new-iswc-ipi-context-search-help-music-publishers-solve
- CISAC standards/document packs: https://members.cisac.org/CisacPortal/documentPacks.do?item=item5
- DDEX MWN purpose and message choreography:
  https://kb.ddex.net/implementing-each-standard/musical-work-data-and-rights-communication-%28mwdr%29/musical-work-right-share-notification-standard-%28mwn%29/mwn-explained/purpose-of-mwn/

External terms, specifications and eligibility can change. Planning must re-check the current
official recipient materials before selecting a rail or representing what Funūn can do.
