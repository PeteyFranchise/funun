# Contract Locker Generation and Legal Services

**Status:** READY FOR LENGTHY GSD + LEGAL DISCUSSION - owner direction 2026-09-01
**Near-term:** governed, lawyer-reviewed standard agreement generation
**Later iteration:** narrow self-service editing of counsel-approved business terms
**Final destination:** independent law-firm services for bespoke matters at firm-set a la carte pricing
**Foundation TODO:** `.planning/todos/pending/2026-09-01-lawyer-reviewed-contract-product-foundation.md`

## Permanent boundary

Funūn provides lawyer-reviewed music-industry templates and guided document workflows,
but does not act as the user's attorney or provide legal advice. Users should retain
independent counsel before signing. A partner law firm's review of a template does not
create an attorney-client relationship with a Funūn user.

## Ten GSD discussion questions

1. Which contracts should Funūn generate first?
2. Which terms may users edit themselves?
3. Which legal language remains protected?
4. How do counsel review, jurisdiction/scope and template versioning work?
5. How do negotiation, revision and e-signature work?
6. How do executed agreements, certificates and audit history land in Contract Locker?
7. Does sync representation use blanket authority, per-deal approval or a hybrid?
8. What must happen before Funūn may pitch, negotiate, license, deliver, collect and pay?
9. How do users bring their own independent counsel into the workflow?
10. Where does Funūn's responsibility end and the user's or law firm's responsibility begin?

These questions are planning inputs, not rhetorical copy. The GSD discussion must create
a decision record for each before implementation is considered complete.

## Counsel drafting order

The legal team should review/create the common standard agreements in this order:

1. **Split sheet** - existing strongest workflow; migrate into the governed registry
2. **Producer agreement**
3. **Work-for-hire agreement**
4. **Featured-artist agreement**
5. **Sample-clearance agreement**
6. **Sync representation agreement**
7. **Individual sync licence**

For each agreement, counsel supplies or approves:

- Covered use case and excluded use cases
- Supported jurisdiction(s)
- Parties and signer roles
- Protected clauses
- Candidate editable business terms
- Required attachments/exhibits
- Required disclosures and acknowledgments
- Amendment, termination and version rules
- Readiness/deal gates affected by execution
- Review date, reviewer provenance and re-review cadence

## Narrow self-service editing - later iteration

Basic business terms may eventually be edited by users after counsel defines a strict
per-template allowlist. Candidate field types include parties, dates, services or
deliverables, fixed fee, payment schedule, split percentage, credit, term, territory and
approved option selections. This is not a final field list; counsel must approve each
field, range, dependency, default and explanatory label per agreement.

The safe product shape is structured fields, dropdowns, dates, currency/percentage
inputs and bounded options. V1 should not offer free-form editing of protected clauses.
Any protected-language change creates a custom/unreviewed document and removes the
lawyer-reviewed designation until counsel reviews that exact version.

## Final destination - Contract Locker legal services

For complex structures, negotiations or custom agreements, a user can submit a legal
services request from Contract Locker to an independent partner law firm. The law firm:

- Performs its own conflict and eligibility checks
- Decides whether to accept the engagement
- Establishes the attorney-client relationship directly with the user
- Defines scope, jurisdiction, engagement terms and a la carte price
- Provides legal advice and custom drafting under its own professional responsibility
- Returns final documents to Contract Locker only with the client's authorization

Funūn provides intake, routing, secure workflow and document organization. Funūn does
not choose the legal outcome, supervise legal advice or imply representation.

### Outside business-development work

- Select qualified music/IP law-firm partner(s)
- Define jurisdictions, matter types and capacity
- Agree intake, response-time and escalation expectations
- Determine who owns support and client communication at each stage
- Establish data-processing, confidentiality, security and document-return terms
- Resolve branding, co-marketing and service-quality expectations
- Have ethics counsel approve referral, marketplace, payment and any fee arrangement
- Define what happens when the firm declines, conflicts out or lacks jurisdiction/capacity

### Internal product/code work

- Matter-type intake and structured facts questionnaire
- User authorization to share specific data/documents with a selected firm
- Referral/routing and firm acceptance/decline status
- Firm-owned conflict-check and engagement-letter gate
- Quote/scope presentation and explicit user acceptance
- Secure document exchange and permissioned messaging/status
- Appointment or consultation scheduling where offered
- Clear separation between Funūn support and legal communication
- Optional payment handoff/integration only after counsel approves the structure
- Contract Locker return path with source, firm, matter, status and version provenance
- Data-retention, deletion, export and access-revocation controls
- Audit trail that does not expose privileged legal substance unnecessarily

### Legal/compliance decisions before building the marketplace layer

- Jurisdiction-specific unauthorized-practice-of-law boundaries
- Attorney advertising, solicitation and referral rules
- Fee-sharing and payment-processing restrictions
- Conflicts, engagement formation and client identity
- Attorney-client privilege and Funūn's access to communications/documents
- Professional liability, malpractice and complaints handling
- Cross-border users and law-firm licensing
- Privacy, security, retention, subpoenas and breach responsibilities

## Recommended horizon sequence

### Horizon 1 - governed templates

Version registry, counsel provenance, protected language, disclosures, generation,
e-signature and Contract Locker lifecycle. Prove reuse with producer agreement after the
existing split sheet.

### Horizon 2 - narrow self-service terms

Counsel-approved per-template business fields, guided explanations, validation,
comparison/review and review-status invalidation.

### Horizon 3 - sync representation and individual licensing

Resolve blanket/per-deal/hybrid authority with counsel; connect artist approvals, deal
economics, signing, delivery and payment evidence.

### Horizon 4 - independent legal services destination

Partner-firm intake, engagement, custom matter workflow and a la carte services after
business-development and legal-ethics approval.

## Final-destination success test

A user starts with a standard agreement, recognizes that the matter exceeds the
self-service boundary, requests independent legal help, knowingly authorizes selected
information sharing, passes a firm-controlled conflict check, receives and accepts a
firm-set engagement and quote, works directly with counsel, and returns an authorized
final document to Contract Locker. At every step the user can tell whether they are
interacting with Funūn or their law firm, who represents them, what they are paying and
who can access the matter.

## Claude / GSD instruction

Run a dedicated, lengthy discussion before assigning the implementation phase. Treat
the ten questions, drafting order, structured self-service boundary and independent
law-firm final destination as owner-approved direction. Do not design a legal-services
marketplace from code assumptions; obtain counsel decisions and a real partner operating
model first. Do not collapse template review, user representation and Funūn workflow
services into one role.
