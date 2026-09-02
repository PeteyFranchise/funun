---
created: 2026-09-01T19:00:00-04:00
title: Evaluate Funūn becoming a branded, managed and eventually direct music distributor
area: distribution-business
priority: long-term-strategic-option
status: ready-for-gsd-and-business-discussion
depends_on:
  - owner and board-level business-model approval
  - music-distribution counsel and accounting/compliance review
  - Song Passport approved snapshot model
  - Release Report readiness and authorization gate
  - Sound Vault custody and controlled-delivery foundations
  - DDEX licence, DPID and partner-validated delivery capability
  - proven artist/label demand and catalogue operating history
files:
  - .planning/ROADMAP.md
  - .planning/deliberations/ddex-production-readiness.md
  - .planning/todos/pending/2026-09-01-distributor-api-partner-evaluation.md
---

## Strategic question

Should Funūn eventually become the distribution company that contracts with artists and
labels, delivers their approved releases, receives DSP reporting/revenue and pays the
right parties - instead of only preparing packages or connecting users to another
distributor?

This is achievable, but it is a company-level operating model rather than a single
software feature. It adds licensing relationships, financial custody, content-policy
enforcement, fraud exposure, royalty accounting and ongoing partner operations to Funūn's
responsibilities.

This document records the option for discussion. Funūn does not currently claim to be a
direct distributor, direct DSP provider, royalty administrator or Content ID partner.
Nothing here authorizes an application, contract, external outreach or production launch.

## First define what "our own distributor" means

### Model A - Funūn-branded, partner-powered distribution

Artists complete the Release Report inside Funūn. Funūn sends the approved package to an
upstream distribution provider through its API or white-label rail. The upstream provider
may supply DSP agreements, delivery, reporting, settlement or all four.

**What users experience:** distribution begins and is tracked inside Funūn.

**What Funūn must say:** "Distribution powered by [Partner]" or other contract-approved
language. The contracts determine which company is the distributor of record, merchant,
licensor and payor.

**Why begin here:** this tests artist demand and Funūn's workflow while borrowing proven
supply-chain and partner infrastructure.

### Model B - managed hybrid distributor

Funūn owns the artist/label relationship, catalogue intake, rights evidence, quality
control, customer support and Release Report experience. A professional delivery platform
or wholesale distributor still handles some DSP contracting, transport, reporting or
settlement functions.

Funūn may be commercially described as a distributor if the executed agreements support
that role, but it must disclose material upstream dependencies accurately. Directness is
decided partner by partner and function by function.

### Model C - selective direct DSP distributor

Funūn has its own executed agreement and accepted production relationship with a named
DSP. Funūn controls the licensor relationship, delivery authorization, catalogue policy,
reporting reconciliation and financial obligations for that relationship. It may still
use a technical delivery vendor; direct distribution does not require rebuilding every
transport tool in-house.

"Direct distributor" may be claimed only for named DSPs that have accepted Funūn. Having
one direct relationship does not imply direct delivery to every DSP.

## Recommendation

Follow **Model A -> Model B -> Model C**, with an evidence gate between each model.

Do not attempt to win direct agreements before Funūn has proved that it can operate the
hard parts through a partner-powered catalogue: clean rights, accurate metadata, low
rejection and fraud rates, timely corrections, reconciled statements, accurate payouts
and responsive artist support.

Distribution should be the trusted release endpoint of the Writer's Room, Sound Vault,
Song Passport, Split Sheets and Contract Locker. It should not displace the current
pre-release acquisition story before the operating model is proven.

## What Funūn would need to own

### Corporate, contracts and legal foundation

- A legal entity, tax identity, banking and accounting structure accepted by partners.
- A lawyer-reviewed artist/label distribution agreement defining the granted master
  rights, territories, term, delivery authority, fees/revenue share, accounting periods,
  reserves, fraud charges, takedowns, termination, warranties and indemnities.
- Clear rules for samples, covers, remixes, public-domain claims, artificial/AI-generated
  content and third-party rights.
- Privacy, data-processing, records-retention, sanctions/KYC/KYB, complaint, DMCA and
  dispute procedures appropriate to the actual money and rights flows.
- Counsel determination of payment, tax-reporting, unclaimed-property, consumer and money-
  transmission obligations for the selected business and payout architecture.
- Appropriate cyber, errors-and-omissions and media liability review.

Funūn provides workflows and records; it does not become the artist's lawyer. Every
contract template and self-service term follows the existing Contract Locker legal doctrine.

### DSP and licensing relationships

- A business-development owner for Apple Music, Spotify, Amazon Music, YouTube Music,
  TikTok, Meta, Deezer, TIDAL and other selected destinations.
- Evidence of an extensive, legitimate catalogue and a professional operating history.
- Negotiated commercial terms, territories, reporting, payment, audit, marketing, fraud,
  update, takedown and termination obligations.
- Technical onboarding and partner-specific UAT for each named relationship.
- A relationship matrix showing whether Funūn, an upstream provider or a rights collective
  supplies the agreement, delivery, reporting and settlement for each destination.

Apple currently states that direct labels, distributors and encoding houses need an
extensive catalogue and must satisfy financial, technical and content requirements. Its
published minimums include a matching U.S. Tax ID, Apple account, UPC/EAN/JAN identifiers
for products and ISRCs for tracks. Spotify's provider directory says listed distributors
handle licensing, delivery and royalty payment and meet Spotify's delivery standards.
These are qualification signals, not guarantees that either company will accept Funūn.

### Rights intake and catalogue policy

- Identity verification for artists, labels, rights controllers and payees.
- Explicit authority to distribute each master and each territory.
- Contributor, split, publisher, sample, cover and ownership evidence appropriate to the
  release; unresolved creative rights cannot be hidden by a distribution checkbox.
- Duplicate-release, conflicting-ownership, stolen-audio and catalogue-migration checks.
- Human quality-control and escalation queues for suspicious or incomplete releases.
- Notice, counter-notice, dispute, freeze, takedown and repeat-abuser processes.
- Separate eligibility and authority for UGC/Content ID; ordinary distribution permission
  does not automatically grant exclusive claiming rights.

YouTube, for example, requires evidence of exclusive rights for Content ID reference
material and can restrict or terminate partners for bad claims or inadequate controls.
Content ID must therefore remain a separate opt-in rights-administration product, even if
the selected distribution rail can technically deliver to YouTube Music.

### Identifiers and standards

- DDEX commercial Implementation Licence and a production-configured DPID.
- Partner-approved ERN versions/profiles, packaging and delivery choreography.
- ISRC intake that preserves existing valid codes and prevents reassignment/collision.
- Appointment as an ISRC Manager before assigning codes for client-owned recordings, or
  continued use of an authorized upstream ISRC Manager.
- Written client authorization and durable assignment records for every manager-issued ISRC.
- A controlled source for UPC/EAN/GTIN identifiers, whether through GS1, an authorized
  provider or a partner-approved allocation workflow.
- Identifier migration and continuity rules so changing distributors does not create new
  ISRCs for unchanged recordings.

The International ISRC authority says only owners/exclusive licensees or appointed ISRC
Managers may assign codes; managers require formal authority and recordkeeping. DDEX
licensing and a DPID identify Funūn in standards messages but do not create DSP contracts.

### Product and delivery technology

- Song Passport as the reusable source for composition, contributor, recording and release
  facts, with approved immutable delivery snapshots.
- Release Report gates for rights, master, artwork, identifiers, territories, dates and
  distributor-specific choices.
- Sound Vault asset isolation, hashes, provenance, explicit authority and delivery receipts.
- Destination-aware validation for audio, artwork, metadata, credits, lyrics and identifiers.
- Provider/DSP adapters with server-only credentials and explicit capability flags.
- Idempotent master/artwork upload, release creation, submit, retry, correction, update and
  takedown workflows.
- DDEX ERN generation plus partner-specific packaging and secure transport where required.
- Acknowledgment correlation, error classification, retry controls and an operator console.
- Artist/DSP profile mapping and duplicate-artist resolution.
- Full observability, incident response, audit history, disaster recovery and a delivery
  stop switch.

### Royalty accounting and money operations

- Ingestion and immutable storage of every DSP/provider statement and adjustment.
- Normalization across service, territory, currency, product, recording and usage type.
- Reconciliation from DSP totals to releases, tracks, rights holders and Funūn's bank ledger.
- Versioned contracts and split rules with effective dates, recoupment and reserves.
- Artist/label statements that explain gross receipts, deductions, fees, taxes, reserves,
  reversals and net payable amounts.
- Payout identity, tax documentation, sanctions screening and failed-payment handling.
- Double-entry ledgering, approval controls, segregation of duties and reproducible close.
- Dispute, correction, overpayment, chargeback and catalogue-transfer processes.
- Independent accounting review before handling production artist funds.

Royalty math must never be calculated from mutable profile fields or the current split
alone. Every statement binds to the effective contract, source report and calculation
version that produced it.

### Fraud, trust and safety

- Content and account risk scoring before delivery.
- Duplicate audio, impersonation, stolen catalogue and suspicious bulk-upload detection.
- Artificial-streaming education, monitoring, warnings, penalties and repeat-abuser policy.
- Reserves and release/payment holds governed by written, appealable rules.
- DSP notice intake and evidence-preserving investigations.
- Human review for account termination, royalty forfeiture and rights conflicts.

Spotify currently reports confirmed artificial streaming to labels/distributors and may
charge them per track in flagrant cases. A Funūn distribution business therefore inherits
real downstream financial and catalogue risk from user behavior.

### Operations, support and staffing

The capability requires named owners for:

- Distribution business development and partner management
- Music operations and release quality control
- Rights, content policy, fraud and disputes
- Royalty accounting, treasury, tax and payouts
- Artist/label onboarding and customer support
- Backend/supply-chain engineering and data engineering
- Product/design for Release Report and statements
- Security, privacy, reliability and incident response
- Music, commercial and payments counsel

At small scale some roles may be fractional or combined, but none of the functions can be
silently omitted. Direct distribution becomes an ongoing department with service levels,
monthly closes and incident duty.

## Recommended development and business stages

### Stage 0 - doctrine and feasibility

- Decide target customers: independent artists, invited labels or both.
- Choose the initial economic model: subscription, per-release fee, revenue share, label
  contract or a deliberate combination.
- Have counsel map the intended rights, money and contractual flows.
- Complete the existing Too Lost/Revelator/FUGA/SonoSuite evaluation.
- Build a five-year unit model including vendor fees, DSP deductions, fraud losses, payment
  costs, support, legal/accounting, storage and minimum staffing.
- Define the evidence that would justify moving from partner-powered to direct.

**Gate:** owner approves a written business model, risk appetite and maximum pilot budget.

### Stage 1 - partner-powered Funūn Distribution pilot

- Contract with one embedded/wholesale provider.
- Build one provider adapter from an approved Song Passport/Release Report snapshot.
- Publish clear powered-by and distributor-of-record language from the executed agreement.
- Pilot a small owner-approved catalogue with manual human QC on every release.
- Reconcile every delivery status, statement and payout against the provider.
- Preserve a complete export/migration package and manual takedown path.

**Gate:** successful sandbox UAT plus controlled production releases, reconciled statements,
accurate payouts, acceptable support load and no unresolved high-severity rights incident.

### Stage 2 - managed hybrid operations

- Bring catalogue QC, artist support, rights evidence, fraud review and delivery monitoring
  under Funūn operating procedures.
- Add provider-independent royalty ledgering and statements while reconciling upstream data.
- Obtain appropriate ISRC Manager authority or retain an authorized manager explicitly.
- Establish monthly close, reserves, disputes, catalogue migration and incident runbooks.
- Measure catalogue growth, rejection rates, correction time, fraudulent-stream exposure,
  support burden, payout accuracy and gross margin.

**Gate:** sustained clean operations and sufficient catalogue/economic evidence to justify
the expense and liability of a direct DSP application.

### Stage 3 - first selective direct relationship

- Choose one DSP whose requirements and business case fit the proven catalogue.
- Apply under owner authority with legal, financial, catalogue and operating evidence.
- Negotiate the agreement; receive the exact technical delivery and reporting contract.
- Complete DDEX/package integration, security review, sandbox UAT and controlled pilot.
- Reconcile delivery, reports, revenue, updates and takedowns end to end.
- Keep upstream distribution for all other destinations.

**Gate:** named DSP production acceptance, stable delivery, accurate financial close and an
auditable support/escalation path. Only then may Funūn claim direct distribution to that DSP.

### Stage 4 - expand direct coverage selectively

- Add direct DSPs only when economics, catalogue demand or control justify another bespoke
  relationship.
- Keep one canonical Song Passport and ledger while adapters remain partner-specific.
- Evaluate Merlin only after Funūn controls eligible digital rights and can demonstrate
  professional delivery and direct-partner operating maturity.
- Retain wholesale rails for markets or services where direct operation is uneconomic.

Merlin may improve independent licensing leverage, but it explicitly says it is not a
distributor: members must professionally deliver content themselves or through a technical
provider and must meet Merlin's eligibility requirements.

## Internal planning ranges - not promises

- **Partner-powered branded pilot:** approximately 3-6 months after acceptable commercial
  terms, sandbox credentials and a stable Song Passport/Release Report foundation.
- **Managed hybrid maturity:** approximately 6-18 additional months of real catalogue,
  reporting, support, fraud and payout operation.
- **First selective direct DSP relationship:** often an 18-36+ month strategic horizon from
  decision, because acceptance, catalogue scale and negotiations are outside Funūn's control.

These are rough planning ranges, not launch dates or partner commitments. A successful
partner-powered service may remain the economically correct permanent model.

## Cost model to build before approval

Do not select the model from API pricing alone. Obtain quotes or budgets for:

- Distribution/white-label/API setup, minimums and revenue share
- Legal formation, agreements, DSP negotiations and ongoing counsel
- Royalty accounting, audits, tax, banking, treasury and payment providers
- DDEX/identifier administration and catalogue-migration work
- Engineering, data infrastructure, storage, transfer and observability
- QC, support, fraud, rights disputes and partner operations
- Insurance, security assessments, incident response and financial reserves
- Chargebacks, artificial-streaming penalties, uncollectible balances and FX

The decision model must compare partner-powered, hybrid and direct paths using total
operating cost, control, gross margin, liability and exit portability.

## Non-negotiable launch gates

- Counsel-approved artist/label agreement and content policy
- Truthful distributor-of-record and powered-by disclosures
- Verified authority for every master and territory
- Separate explicit Content ID/UGC eligibility and consent
- DDEX licence/DPID and named-partner accepted delivery profile where required
- Valid ISRC/UPC handling with no code collision or silent reassignment
- Human QC and rights/fraud escalation before delivery
- Corrections, updates, takedowns, retries and acknowledgments proven end to end
- Statements reconcile to source reports and cash
- Payout, tax, sanctions, reserves and disputes reviewed by qualified professionals
- Support, incident response, business continuity and migration/export runbooks
- Marketing claims tied to named contractual and production evidence

## Success measures

- Release completion time and fields re-entered by artists trend down
- First-pass provider/DSP acceptance rate trends up
- Rejection and correction time remain measurable and owned
- Zero silent master, rights, identifier or metadata substitution
- Every release and takedown reaches a terminal acknowledged state or owned incident
- Every statement and payout reconciles to source reports, contracts and cash
- Rights/fraud disputes have evidence, human review and timely resolution
- Artist support response and resolution targets are met
- Catalogue portability is tested, not contractual wishful thinking
- Distribution gross margin is positive after support, fraud and operating costs at the
  target scale

## Claim ladder

**Today:** "Funūn prepares validated release packages and is evaluating distribution partners."

**Partner-powered launch:** "Artists can prepare and submit releases through Funūn;
distribution is powered by [Partner] under the disclosed relationship."

**Managed hybrid:** use "Funūn Distribution" only with counsel-approved language matching
the artist and upstream agreements.

**Named direct relationship:** "Funūn delivers directly to [DSP]" only after that DSP has
accepted Funūn into production and the exact delivery relationship is operational.

Never imply direct delivery to every DSP, ownership of artists' masters, automatic rights
clearance, guaranteed acceptance, guaranteed royalties or Content ID authority.

## Official evidence to refresh before each decision

- Apple minimum partner requirements:
  https://itunespartner.apple.com/music/support/5205-minimum-partner-requirements
- Apple preferred-distributor qualifications:
  https://itunespartner.apple.com/music/5307-apple-music-preferred-distributors
- Spotify provider directory:
  https://artists.spotify.com/en/providers
- Spotify artificial-streaming responsibilities:
  https://artists.spotify.com/en/artificial-streaming
- DDEX implementation and DPID:
  https://ddex.ddex.net/implementation/
  https://kb.ddex.net/general-implementation-guidance/licensing-the-standards/ddex-party-identifier-%28dpid%29/
- International ISRC Manager rules:
  https://isrc.ifpi.org/get-isrc/isrc-managers
- GS1 GTIN/UPC source:
  https://www2.gs1.org/standards/get-barcodes
- Merlin membership path:
  https://merlinnetwork.org/path-to-merlin-membership/
- YouTube Content ID qualification and partner responsibilities:
  https://support.google.com/youtube/answer/1311402
  https://support.google.com/youtube/answer/9142671

## Discussion decisions required later

1. Is Funūn Distribution strategically central, optional or explicitly out of scope?
2. Are initial customers individual artists, invited labels or both?
3. Which model may be publicly branded as Funūn Distribution, and with what disclosure?
4. Does Funūn collect DSP revenue and pay users, or does the upstream provider remain payor?
5. What pricing model and risk reserve make the unit economics viable?
6. Which rights/content categories are prohibited or require enhanced review?
7. Will Funūn seek ISRC Manager status, use upstream codes or support both?
8. What catalogue/quality/economic thresholds unlock a direct DSP application?
9. Which first DSP would create the strongest strategic advantage?
10. What facts would cause Funūn to remain partner-powered permanently?

## Claude / GSD instruction

Treat this as an owner-requested strategic option, not an approved launch or selected
business model. Preserve the distinction between branded, managed-hybrid and named direct
distribution. Do not contact partners, submit applications, create accounts, accept terms,
issue identifiers or implement money movement without explicit owner authorization and
the required counsel/accounting review. The next step is a GSD/business discussion of the
ten questions, followed by a partner-powered unit model and evidence gates - not a direct
DSP connector build.
