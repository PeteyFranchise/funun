---
created: 2026-09-01T18:00:00-04:00
title: Evaluate and select the first embedded distributor API partner
area: song-passport-release-report
priority: asap-partner-discovery
status: ready-for-owner-and-team-review
depends_on:
  - owner authority for external outreach and account creation
  - Song Passport approved snapshot model
  - Release Report readiness and authorization gate
  - Sound Vault clean-master delivery controls
  - DDEX licence, DPID and production-readiness track where applicable
files:
  - .planning/ROADMAP.md
  - .planning/deliberations/ddex-production-readiness.md
  - .planning/todos/pending/2026-09-01-clean-master-isolation-distributor-delivery.md
---

## Intended outcome

Select one authorized distribution partner for an embedded Funūn pilot that can accept
an approved Song Passport/Release Report package, ingest masters and artwork, validate a
release, deliver it to selected DSPs and return reliable status and error information.

The first goal is one safe, observable partner integration - not a universal distributor
abstraction and not a public promise of one-click distribution.

This plan records options for later review. It does not authorize outreach, create a
developer account, accept commercial terms, select a provider or claim an integration.

## Strategic alternative: Funūn becomes a distributor

The partner evaluation is also the first practical stage of a possible Funūn-owned
distribution business. A partner-powered service can validate demand, catalogue quality,
support load, fraud exposure and royalty operations before Funūn seeks direct DSP deals.

The full option and graduation gates are documented in
`.planning/todos/pending/2026-09-01-funun-owned-distributor-option.md`. Selecting an API
partner does not permanently prevent Funūn from becoming direct; portability, identifier
continuity, takedown/migration support and ownership of canonical Song Passport data are
therefore mandatory selection criteria.

## Candidate order

### 1. Too Lost - fastest pilot hypothesis

**Why it is first:** Too Lost publicly documents a developer platform for catalog and
release management, distribution to 450+ stores, royalties, splits, payouts, users,
permissions and webhooks. Its public language says developers can create an account and
obtain API keys.

**What must be verified:**

- Funūn qualifies for commercial embedded use rather than personal/internal use only.
- Sandbox access can exercise audio/artwork upload, release validation, submission,
  correction, status, update and takedown paths.
- The API supports a multi-tenant platform without collapsing artist/label identity.
- Commercial terms, payout flow, reserves, fraud rules, support ownership and exit/data
  portability are acceptable.
- Store count means currently deliverable destinations under Funūn's prospective account,
  not merely names in a global capability list.

**Official starting point:** https://toolost.com/developers

### 2. Revelator - strongest API-first strategic comparison

**Why it is paired with Too Lost:** Revelator publicly documents end-to-end API support
for releases, tracks, metadata, rights, validation, DSP distribution, scheduling,
delivery status, webhooks, royalties, accounting and payments. It says partners may use
their own DSP agreements or Revelator's agreements.

**What must be verified:**

- Sandbox availability, integration-support process and expected implementation timeline.
- Minimum catalogue, revenue or business requirements.
- Whether Funūn can embed the workflow while retaining its own Song Passport and Release
  Report experience.
- Which review/approval steps remain in Revelator's interface rather than its API.
- Commercial terms, payout/royalty responsibilities, fraud controls and data portability.

**Official starting points:**

- https://revelator.com/product/revelator-api
- https://api-docs.revelator.com/en/distribution/

### 3. FUGA - enterprise destination

**Why it remains on the ladder:** FUGA supports automated ingestion and distribution from
client-facing platforms, provides API-fed information and describes preferred-partner
status with major DSPs. It could be a strong long-term supply-chain partner for established
Funūn labels and catalogues.

**Why it is not the default first pilot:** public materials indicate an enterprise,
relationship-led offering. Funūn should approach with credible catalogue volume,
operational controls, compliance evidence and a defined commercial case.

**Official starting point:** https://fuga.com/products-services/music-distribution/

### 4. SonoSuite - scale-dependent white-label alternative

**Why it remains on the ladder:** SonoSuite offers a branded distribution platform,
catalogue management, royalties and delivery to more than 220 DSPs.

**Why it is not the default first pilot:** its current public page describes starting
requirements of 5,000 tracks and 500 user accounts and calls the integration option an
"API workaround." Confirm whether there is a supported API that fits Funūn before any
architecture or commercial commitment.

**Official starting points:**

- https://www.sonosuite.com/
- https://sonosuite.com/faqs

## Named business-development paths, not assumed APIs

### DistroKid, TuneCore and CD Baby

These are recognizable artist-facing distributors, but Funūn should not promise or build
against an undocumented third-party release-upload API. Ask each company whether it has a
platform/label partner program, accepted bulk or structured intake, sandbox, webhook or
status interface, multi-tenant authorization model and written embedded-use terms.

### Spotify and Apple Music

Their ordinary developer APIs do not create a distribution supply chain for master
delivery. Treat direct DSP delivery as a later partner-onboarding program requiring
commercial qualification, technical specifications, security review, identifiers,
acknowledgments and production acceptance.

### Secretly

Treat Secretly as a relationship-led recipient important to Nigil's workflow, not as a
generic API assumption. Ask its operations team to identify the actual accepted intake:
portal, CSV/spreadsheet, cloud folder, SFTP, DDEX, another distributor platform or a
combination. Funūn can first eliminate re-entry with a Secretly-specific export package;
direct delivery follows only if Secretly authorizes and validates it.

## Weighted selection scorecard

Score each verified candidate from 0 to 5 for every category, multiply by the weight and
retain source evidence and the date verified.

| Category | Weight | Evidence required |
|---|---:|---|
| Release/master API completeness | 20% | Working docs or sandbox for create, upload, validate, submit and status |
| Time to sandbox pilot | 15% | Named onboarding owner, credentials and test environment |
| Funūn/artist/label eligibility | 15% | Written qualification and permitted multi-tenant use |
| Commercial economics | 15% | Fees, revenue share, payout, reserves, minimums and termination |
| Compliance and fraud obligations | 10% | Content policy, KYC/KYB, fraud process, audit and support ownership |
| Standards and metadata fit | 10% | Required fields, identifiers, DDEX/profile support and corrections |
| Acknowledgment lifecycle | 10% | Webhooks/statuses for rejection, acceptance, update and takedown |
| Portability and exit safety | 5% | Catalogue/data export, takedowns, migrations and post-termination access |

No candidate advances because of marketing claims alone. A working sandbox, written
commercial permission and acceptable operating obligations are mandatory gates.

## Discovery questions for every candidate

### Product and technical

1. Can Funūn create and manage releases for multiple independent artists and labels?
2. Can the API upload WAV masters and artwork directly, and what limits/codecs apply?
3. Which release, track, contributor, ownership, territory and rights fields are required?
4. Can Funūn supply ISRC/UPC values, request them, or support both paths?
5. Is there a dry-run validation endpoint with destination-specific errors and warnings?
6. Can a release be submitted, reviewed, corrected, updated and taken down through API?
7. Which human approval step remains, and whose interface performs it?
8. Are delivery acknowledgments and DSP rejection details available through webhooks/API?
9. Is sandbox behavior representative of production, including audio/artwork transfer?
10. What are the idempotency, retry, rate-limit, versioning and deprecation rules?

### Identity, rights and operations

11. How are Funūn, label, artist, payee and rights-controller identities represented?
12. Who is the legal distributor of record and who contracts with the artist?
13. Who performs KYC/KYB, content review, fraud monitoring and infringement response?
14. How are artist-profile mappings, duplicate artists and DSP profile IDs resolved?
15. How are splits, statements, royalties, reserves, taxes, payouts and disputes handled?
16. What Content ID/UGC services exist, and what separate eligibility and authority apply?
17. What support obligations remain with Funūn versus the provider?
18. Can Funūn export its full catalogue, delivery history, statements and provider IDs?

### Commercial and claims

19. What setup fees, minimums, per-release fees, revenue share and volume commitments apply?
20. May Funūn embed and brand the workflow, and what provider attribution is required?
21. What claims may Funūn make about the relationship before and after production launch?
22. What happens to live releases, identifiers, revenue and takedowns after termination?

## Provider-neutral implementation plan after selection

### Stage 0 - written qualification

- Owner authorizes contact and account creation.
- Obtain terms, API credentials, sandbox scope, data-processing/security materials and a
  named technical contact.
- Complete the scorecard and record the selection decision plus rejected alternatives.

### Stage 1 - common boundary

- Define a narrow server-only provider interface for capability discovery, validation,
  asset upload, release creation, submit, status, update and takedown.
- Keep provider credentials encrypted and never expose them to the browser.
- Keep Song Passport snapshots, custody records, authorization and receipts canonical in
  Funūn; store provider IDs only as mappings.
- Add explicit capability flags so unsupported operations fail closed rather than being
  simulated.

### Stage 2 - deterministic mapping

- Map one immutable approved Song Passport and Release Report snapshot into the selected
  provider's release schema.
- Preserve original masters; transmit only the authorized designated delivery asset.
- Record provider-specific required fields separately from reusable song/release facts.
- Validate before upload where possible and reconcile every transferred asset by hash.

### Stage 3 - sandbox vertical slice

- Use a synthetic or owner-authorized unreleased single.
- Create the release, upload master/artwork, validate, submit, receive a rejection, correct
  it, resubmit and observe acceptance.
- Exercise one metadata update and one takedown in the sandbox.
- Prove retries do not create duplicate releases or assets.

### Stage 4 - controlled production pilot

- Obtain written sandbox/UAT approval.
- Pilot with two or three owner-approved artists and a small release set.
- Require final artist review of distributor-specific choices and an explicit Submit action.
- Monitor every release until accepted, rejected with an owned correction or deliberately
  withdrawn.
- Keep a stop switch and the validated manual-package fallback.

### Stage 5 - measured expansion

- Review rejection rate, correction time, support load, delivery latency, payout accuracy
  and artist completion rate.
- Add a second provider only if user demand or resilience justifies the maintenance cost.
- Extract shared adapter behavior only after two real integrations prove it is truly common.

## User-facing maturity and claim ladder

**Before selection:** "Funūn prepares a validated, copy-ready distributor package."

**During sandbox:** "Funūn is testing an embedded delivery workflow with [Partner]."

**After written production acceptance:** "Funūn can submit approved releases to [Partner]
from the Release Report; artists review the remaining partner-specific choices before
submission."

Do not say "one-click distribution," "delivered to every DSP," "DDEX certified" or
"nothing else to enter" unless the exact production workflow and remaining user actions
support that exact statement.

## Review checkpoint

When the team returns to this plan:

1. Refresh every vendor fact and URL.
2. Approve or revise the weights.
3. Authorize outreach to Too Lost and Revelator first.
4. Complete the scorecard from written answers and sandbox evidence.
5. Select one pilot partner or explicitly retain manual export if neither qualifies.

## Claude / GSD instruction

Treat the candidate order as a research-backed recommendation, not an owner-approved
vendor selection. Do not contact companies, open accounts, accept terms, create API keys
or implement a connector without explicit owner authorization. Start future work by
refreshing current vendor capabilities and completing the weighted scorecard. Preserve
the provider-neutral Song Passport/Release Report/Sound Vault boundaries and truthful
claim ladder regardless of the selected partner.
