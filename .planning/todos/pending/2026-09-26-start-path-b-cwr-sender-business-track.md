# Start Path B — direct rights-registration sender and operating track

**Captured:** 2026-09-26 · **Owner direction expanded:** 2026-09-26
**Status:** owner-approved company direction; business/legal/recipient onboarding not started
**Doctrine:**
`.planning/deliberations/direct-rights-registration-publishing-distribution-doctrine.md`
**Technical design:** `docs/cwr-plan.md`

## Owner-approved outcome

Build toward Funūn being able to:

1. register and administer works it represents as a publisher or publishing administrator;
2. register works it does **not** publish under a narrow, express registration-service mandate; and
3. share canonical rights infrastructure with the separate track that develops Funūn into a music
   distributor.

The owner wants the shortest responsible path to the actual PRO, CMO, mechanical collective, DSP
or store, with as few avoidable middlemen as possible. This is a direct-first policy, not a promise
to avoid every technical vendor or transitional partner.

## Correction to the earlier framing

“Become an affiliated publisher with CISAC” is not a sufficiently precise action. CISAC is the
confederation and standards body; the practical path is to establish the appropriate Funūn legal
entity and publishing/administration capacity, affiliate or onboard with the applicable societies,
obtain the identifiers they require and complete each recipient's sender/test process.

The earlier recommendation to make **registration-only/admin-agency-only** the first user-facing
service remains sensible. Recipient onboarding may still require the first technical test to use a
work/share in Funūn's own approved publisher/admin capacity. Neither is the destination: full
publishing administration is an approved later capability, gated by counsel, claims operations,
royalty data, accounting, statements, tax, payouts and support.

## Why the entity/capacity decision has two payoffs

Claude's strategic point is right even though the shorthand “CISAC-affiliated publisher” is too
simple: one coordinated publisher/society onboarding workstream can advance **two separate goals**.

1. **Registration:** MusicMark's published model lets onboarded publishers submit one CWR/EBR file
   for ASCAP, BMI and SOCAN, with first and society acknowledgements.
2. **Identity integrity:** CISAC says publishers may request the IPI Pocket Edition, and its ISWC
   IPI Context Search is an API for publishers to find creator IPI numbers from names and known
   works. That could support the consistency check in the companion PRO-identity todo.

This makes the first counsel decision—what entity Funūn forms and whether its first capacity is a
narrow registration agent, publisher, administrator or a staged combination—more valuable than a
registration-only reading suggests. The decision itself can be a focused counsel session; forming
the entity, obtaining identifiers and gaining recipient/service access will still take longer.

Do not turn “two payoffs” into “one automatic entitlement.” Registration sender approval,
MusicMark production onboarding, IPI Pocket Edition access and ISWC IPI Context Search access may
have different eligibility, agreements, credentials and technical paths. Business and recipient
onboarding queue behind the entity/capacity decision, while canonical data modeling and draft
validation can continue in parallel.

## What already exists

- **Path A:** `lib/metadata/cwr.ts` generates draft CWR 2.1 output, exposed at
  `app/(artist)/vault/[projectId]/metadata/cwr/page.tsx`.
- The output is structurally useful but remains a draft until tested against the current recipient
  specification and onboarding validator.
- Writer IPI and sender/submitter identity cannot be invented by Funūn. Recipients assign or accept
  the relevant identities during affiliation/onboarding.
- The Song Passport is the future canonical source for identity, composition, share, recording,
  release, authority and snapshot data.

## Candidate direct rail in North America

MusicMark is a collaboration among ASCAP, BMI and SOCAN. Its current public materials say a
publisher can submit one CWR or EBR file to all three societies, complete a test phase and receive
a first acknowledgement plus society acknowledgements. Its terms allow qualifying users acting on
behalf of a member/affiliate or qualifying rights administrator, subject to the societies'
additional terms.

That makes MusicMark the first direct North American rail to evaluate. It does **not** make Funūn
eligible, onboarded or integrated today. Confirm with MusicMark and the relevant societies:

- the legal/entity and membership/affiliate requirements for Funūn's intended capacities;
- whether registration-only submission for non-administered works is accepted and how authority
  must be evidenced;
- current CWR version/profile or EBR requirements;
- sender/submitter codes, test cycle, file naming, transport and production promotion;
- whether any approved API is available to Funūn or whether SFTP/file exchange is the supported
  path;
- first, second and subsequent acknowledgement formats and correction/recall choreography;
- territory, repertoire, fully-AI-work and other eligibility restrictions;
- fees, support, security, retention, audit and termination terms.

Treat SESAC, GMR, The MLC and non-North-American societies as recipient-specific workstreams until
their current accepted path is confirmed. Do not infer coverage from the existence of CWR.
SoundExchange is recording-side and ISRC-fed, not this composition-registration rail.

## Operating modes to design separately

### Mode A — Funūn-controlled publishing or administration

Funūn has an express publishing or administration agreement covering the work/share, territory,
rights and term. It may submit and maintain claims within that grant. Collection and payout are
separate capabilities and may not be promised until the accounting operation is live.

### Mode B — registration-only service

The rights holder appoints Funūn to prepare, submit, monitor and correct named registrations.
Funūn does not acquire publishing, administration or collection rights merely by filing them. This
mode needs its own counsel-approved mandate, product copy, authority record and termination path.

### Mode C — self-submit/export

Where Funūn lacks a recipient rail or mandate, the member receives validated data/file output and
tracked guidance. Preserve this path even after direct submission ships; not every rights holder or
destination will appoint Funūn.

## Business and legal workstream

1. **Counsel operating memo:** define the entity and contracts for Modes A and B, agency/fiduciary
   boundaries, territories, corrections, disputes, termination, privacy, retention and when
   collection/payment rules attach.
2. **Publishing identity:** establish the approved entity, society affiliation(s), publisher IPI
   and other recipient identifiers. Do not describe Funūn as a publisher before this is real.
3. **Recipient discovery:** contact MusicMark/ASCAP/BMI/SOCAN first, then document the separate
   SESAC, GMR, MLC and international paths. External contact requires owner authority.
4. **Registration-service mandate:** create a narrow agreement for non-administered works that
   permits the exact submission, update, correction and revocation acts the recipient accepts.
5. **Publishing-administration agreement:** later and separate; do not stretch the
   registration-only mandate into administration or collection.
6. **Operations:** designate owners for intake review, conflicts, duplicates, rejections,
   corrections, registry support and member communications.

## Product and engineering workstream

1. Replace scalar/ambiguous rights fields with a validated canonical model where necessary:
   person versus entity, writer versus publisher identity, writer/publisher shares, affiliations,
   territory/right/date scope and provenance.
2. Store Funūn's capacity and authority per work/share. A workspace role or split signature is not
   submission authority.
3. Generate the recipient's current accepted CWR/EBR or later DDEX MWN message from one immutable
   Song Passport snapshot.
4. Build an idempotent submission queue with sequence/correlation IDs, exact payload/file hash,
   sender identity and transmission history.
5. Ingest every acknowledgement and map destination-specific results without discarding the raw
   evidence. Preserve accepted-with-change, duplicate, conflict, rejected and no-participation
   states—not only success/failure.
6. Support corrections, replacements, recalls/revocations and linked successor snapshots.
7. Expose plain-language status and required action to the rights holder and an operator queue to
   Funūn; do not leak other parties' private records.
8. Add capability flags per recipient. Unsupported operations fail closed rather than pretending
   to be direct.

## Pilot sequence

1. Re-validate the generator against the current official recipient specification.
2. Complete recipient test onboarding with synthetic or owner-authorized catalogue data.
3. Use the first mode the recipient approves for sender testing. If publisher/admin repertoire is
   required, pilot one unambiguous work/share under Funūn's own approved capacity.
4. Prove first and later acknowledgements, one deliberate rejection, correction and final accepted
   state.
5. Before launching the intended first user-facing service, pilot one non-administered work under
   the separate registration-only mandate.
6. Reconcile every recipient ID and accepted change back to the Song Passport without silently
   overwriting the submitted snapshot.
7. Only then enable a controlled user-facing submission action.

## Meaning of “one click”

One click may prepare and initiate multiple authorized registrations. It does not mean one universal
registry or instant acceptance. The UI must distinguish **prepared → submitted → received →
accepted/accepted with changes → registered**, with duplicate, conflict and rejected branches.

The MLC Public Search API is read-only and supports consistency checking; it is not the registration
rail. A send without acknowledgement ingestion and correction handling is not the product.

## Relationship to distribution

Composition registration and master distribution are separate businesses and standards, but should
reuse identity, authority, provenance, snapshots, recipient mappings and acknowledgement
infrastructure. Distribution continues through the staged option documented in:

- `.planning/todos/pending/2026-09-01-distributor-api-partner-evaluation.md`
- `.planning/todos/pending/2026-09-01-funun-owned-distributor-option.md`

Partner selection must preserve the ability to graduate to Funūn's own direct relationships. It
must never make a provider's schema the canonical Song Passport.

## First concrete actions

1. Owner authorizes counsel/business-development work; no agent initiates it autonomously.
2. Counsel answers the Mode A/Mode B entity and mandate questions.
3. With owner approval, request current MusicMark onboarding/eligibility materials and a named
   contact for CWR/EBR sender testing.
4. Update `docs/cwr-plan.md` with the actual recipient profile and test evidence before engineering
   a transmission route.

## Done when

Path B is not done when a file uploads successfully. The first rail is done only when Funūn has:

- a valid entity/capacity and recipient-approved sender identity;
- counsel-approved authority for the pilot mode;
- a recipient-validated payload/profile and secure transport;
- correlated acknowledgements through accepted or terminal failure;
- working correction/revocation handling;
- immutable snapshots and auditable authority;
- a controlled production pilot; and
- truthful UI and marketing language limited to the named destinations actually proven.

## Official references — refresh before action

- https://www.musicmark.com/
- https://www.musicmark.com/terms.html
- https://musicmark.com/documents/musicmark_ebr_getting_started_v2.0.pdf
- https://www.cisac.org/services/information-services/ipi
- https://www.cisac.org/Newsroom/news-releases/cisac-launches-new-iswc-ipi-context-search-help-music-publishers-solve
- https://members.cisac.org/CisacPortal/documentPacks.do?item=item5
- https://kb.ddex.net/implementing-each-standard/musical-work-data-and-rights-communication-%28mwdr%29/musical-work-right-share-notification-standard-%28mwn%29/
