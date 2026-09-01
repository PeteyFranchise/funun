---
created: 2026-09-01T03:30:00-04:00
title: Discuss, decide and implement the Sync Library operating model
area: sync-library
priority: near-term-team-discussion
status: ready-for-team-discussion
depends_on:
  - Phase 30 staff-session UAT
  - counsel review for representation and licensing authority
files:
  - .planning/ROADMAP.md
  - .planning/deliberations/sync-library-operating-model.md
  - .planning/deliberations/sync-license-signing-model.md
  - .planning/phases/26-sync-library-inclusion/26-CONTEXT.md
  - .planning/phases/30-the-crate-sync-library-catalogue-engine-sync-readiness/30-CONTEXT.md
---

## Objective

Agree how Funūn operates a highly curated sync catalogue that protects artistic
identity while moving qualified opportunities and deals efficiently. Convert the team
decisions into a dedicated GSD phase, then implement against the existing Phase 26 and
Phase 30 foundation.

## What already exists

- Artist submission and Funūn invitation
- Per-song listing state and withdrawal
- Rights, metadata and sync-readiness checks
- Incomplete-song worklist rather than automatic rejection
- Staff quality review and curated admission/removal
- Layered artist, AI and staff tagging
- Role-aware Crate and backstage curation surfaces
- Buyer requests, staff/AE deal stages and commission calculations elsewhere in the platform

Do not rebuild these systems. Begin with Phase 30 staff-session UAT and a real workflow
walkthrough to identify operational gaps.

## Complete lifecycle to discuss

1. Artist submission or Funūn invitation
2. Rights and metadata readiness
3. Internal quality and cultural review
4. Admission, revision request or rejection
5. Buyer visibility and controlled listening
6. Opportunity matching and pitching
7. Artist approval and cultural guardrails
8. Deal negotiation and economics
9. Contracting, licensing and delivery
10. Payment, commission, statements and reporting

## Required team participants

- Founder/product owner
- A&R or curation lead
- Account executive/sync sales representative
- Artist-relations or operations owner
- Engineering/product representative
- Music/IP counsel for representation, licensing and contract decisions
- Finance/operations owner for payment, commission and statements
- At least one artist/user perspective
- Buyer/music-supervisor perspective where available

## Decisions the workshop must produce

### Catalogue and curation

- What makes a song culturally and commercially appropriate for the library?
- Which criteria are objective readiness gates and which require human judgment?
- When is the result revise, reject, admit, remove or appeal?
- Who has authority at each decision and what must be logged?
- How are artistic context, sensitive-use exclusions and artist identity preserved?

### Buyer access and listening

- Which buyers see which songs and metadata?
- What may be streamed, downloaded or shared before a deal?
- Which watermark/content-protection tier is required?
- How are buyer identity, access expiry and recipient activity recorded without exposing artists unnecessarily?

### Matching and pitching

- Who may match, shortlist and pitch a song?
- When may AI suggest a match, and who approves it?
- How are brand, political, religious, alcohol, gambling, firearms, adult-content and other sensitive categories handled?
- What feedback returns to artists, curators and metadata quality?

### Artist approval

- Is approval required to shop, to quote, to negotiate or to license?
- Which uses can be pre-authorized and which always require per-use approval?
- How do price floors, category exclusions, territory, term, media and revocation work?
- What happens when multiple owners or administrators must approve?

### Deals, contracts and delivery

- Who owns the buyer relationship and negotiation?
- Who may set or change price and commission?
- Which signing model applies: blanket authority, per-deal or hybrid?
- Which document is executed by artist, Funūn and buyer?
- What evidence unlocks clean-master delivery?
- How do DDEX/partner delivery and the Song Passport snapshot attach to the deal?

### Money and reporting

- Who invoices and collects?
- When is commission earned and artist net payable?
- What happens with refunds, cancellations, taxes, chargebacks or currency conversion?
- What statement and contract documents land in the artist's Contract Locker?
- Which operational and revenue metrics define success?

## Legal and commercial boundaries

- The current blanket representation agreement is not launch-ready.
- Do not implement licensing authority until counsel settles scope, approvals, economics,
  exclusions, revocation, term, accounting and governing law.
- Lawyer-reviewed Funūn templates do not make Funūn the user's counsel; independent counsel remains encouraged.
- A song is not clean-master deliverable merely because it is admitted to the catalogue.
- No automated payment or collection claim may ship before the actual payment, ledger and reconciliation workflow exists.

## Recommended implementation slices after discussion

### Slice A - Operate the curated supply pilot

- Complete Phase 30 staff-session UAT
- Revision-request workflow with reasons, owner and due date
- Curation rubric, decision log and artist-facing status
- Sensitive-use preferences and artist-controlled exclusions
- Operational dashboards and queue ownership

### Slice B - Move opportunities with artist control

- Brief/opportunity to catalogue matching
- AE shortlist and pitch workflow
- Buyer access policy and protected listening
- Per-opportunity artist approval where required
- Feedback loop into readiness and Song Passport metadata

### Slice C - Close, deliver and account

- Counsel-approved representation and licensing documents
- Deal approval and e-signature sequence
- Signed-and-paid clean-master delivery gate
- Partner/DDEX delivery attachment
- Invoice, payment, commission, artist net, statements and reconciliation

Slice C may not execute until its counsel, payment and partner dependencies are resolved.

## Pilot definition of done

Use a deliberately small pilot:

- Five owner-approved songs from at least two artists
- One curation lead and one AE/sync seller
- One real or controlled buyer brief
- Every song completes readiness and cultural review
- At least one song receives a revision request and returns successfully
- One artist-approved shortlist is shared through a protected buyer experience
- Every action has an owner, status, timestamp and next step
- No song is pitched or licensed outside its recorded artist guardrails
- If a real deal occurs, contracting, delivery and money follow only the counsel-approved path

## Collaboration output

The team session must produce:

- Locked decision log
- Swimlane/ownership map
- Status and state-transition model
- Permission matrix
- Pilot catalogue and participants
- Counsel questions and blocking decisions
- Success metrics
- Assigned phase number and `/gsd-discuss-phase` or equivalent planning entry

## Claude / GSD instruction

Do not re-litigate that the library is curated, artist-controlled and human-reviewed;
those are owner-approved principles. Use team discussion to settle the operational,
permission, approval, contract, delivery and money model. Read Phase 26/30 artifacts and
the sync-license deliberation before proposing schema or routes. Do not implement from
this TODO alone: record team decisions, assign the phase, research the gaps and create a
reviewed GSD plan first.
