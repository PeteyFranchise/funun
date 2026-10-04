---
created: 2026-09-01T01:45:00-04:00
title: Ship the lawyer-reviewed contract product foundation
area: contracts
priority: near-term
status: pending-counsel-and-planning
files:
  - .planning/ROADMAP.md
  - .planning/deliberations/sync-license-signing-model.md
  - lib/esign/provider.ts
  - lib/split-sheets/agreement.ts
  - lib/sync-library/agreement.ts
  - app/(artist)/contracts/
---

## Permanent product doctrine

> Funūn provides lawyer-reviewed music-industry templates and guided workflows, but
> does not act as the user's attorney or provide legal advice. Users should retain
> independent counsel before signing.

This doctrine applies to every Funūn-generated agreement, including split sheets,
work-for-hire agreements, producer agreements, sample-clearance agreements, sync
representation agreements and future sync licenses. It is a product boundary, not
temporary launch copy.

## GSD discussion questions

The dedicated contract-system discussion must answer:

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

Full discussion and final-destination model:
`.planning/deliberations/contract-locker-generation-and-legal-services.md`.

## Recommended legal-team drafting order

1. Split sheet
2. Producer agreement
3. Work-for-hire agreement
4. Featured-artist agreement
5. Sample-clearance agreement
6. Sync representation agreement
7. Individual sync licence

Each agreement needs counsel-approved jurisdiction/scope, protected clauses, candidate
editable terms, signer roles, disclosures, amendment/version rules and product gates.

## Why this is near-term

Split-sheet generation, DocuSeal e-signature, executed-document storage and Contract
Locker already provide much of the technical foundation. A music lawyer is available
to work with Funūn on the contracts and language. The next shippable step is therefore
a governed template system that connects lawyer-reviewed language to generation,
signing, acknowledgments and immutable storage without representing Funūn as counsel.

## Required product behavior

1. **Immutable template versions.** Every generated agreement records the exact
   template version used. Executed documents never drift when a template changes.
2. **Review provenance.** Internally record the reviewing lawyer, firm if applicable,
   review date, covered jurisdictions/use case and review status. Public attribution
   is shown only with counsel's approval.
3. **Protected language vs business terms.** The UI clearly separates lawyer-reviewed
   clauses from editable deal variables such as parties, scope, fee, split, term and
   territory.
4. **Review invalidation.** Editing protected legal language creates a custom/unreviewed
   version and removes any lawyer-reviewed designation until counsel reviews it again.
5. **Plain-language boundaries.** Before generation and signing, state that Funūn is a
   technology/document-workflow provider, not the user's law firm; no attorney-client
   relationship is formed; the template is not legal advice; independent counsel is
   encouraged.
6. **Recorded acknowledgment.** Store the user, template version, disclosure version,
   timestamp and action proving each party saw and acknowledged the boundary.
7. **Independent-counsel path.** Let a party download a review copy, consult outside
   counsel and upload or route a revised agreement without implying the revision is
   Funūn-reviewed.
8. **One trusted lifecycle.** Generation, negotiation state, e-signature, certificate,
   audit history and the final executed file land in Contract Locker and share the
   same version identity.
9. **Sync-specific counsel gate.** Do not launch sync representation or sync-license
   execution until counsel resolves authority, approvals, economics, exclusions,
   revocation, term, accounting, governing law and the blanket-vs-per-deal model.

## Near-term ship definition

- Counsel approves the permanent doctrine and user-facing boundary language.
- A versioned template registry exists with review provenance and jurisdiction/scope.
- Split sheets are migrated as the first governed template without breaking existing
  executed documents.
- One second contract type is generated end to end, proving the system is genuinely
  reusable rather than split-sheet-specific.
- Protected-clause edits reset review status.
- Pre-generation and pre-signing acknowledgments are stored and auditable.
- Contract Locker displays template type, version, review status and whether the
  document is Funūn-template, counsel-customized or user-uploaded.
- The sync representation agreement remains behind its counsel gate until every open
  commercial and legal term is resolved.

## Counsel working session

Bring counsel a product-flow review, not only a document draft. Resolve:

- Which contract types and jurisdictions the initial library can responsibly cover
- Which clauses must be protected and which terms users may configure
- Required disclosures and acknowledgment timing
- How modifications affect the lawyer-reviewed designation
- Whether and how the reviewing lawyer may be identified to users
- The sync representation/signing model documented in
  `.planning/deliberations/sync-license-signing-model.md`

## Later iteration - narrow editable terms

Users may edit basic business terms only after counsel approves a strict per-template
allowlist. The product should use bounded structured fields rather than free-form legal
clause editing. Changing protected language creates a custom/unreviewed version and
resets the lawyer-reviewed designation.

## Final destination - independent legal services

After a lengthy GSD/legal discussion and outside business development, Contract Locker
may route complex requests to an independent partner law firm. The firm performs its own
conflict check, establishes the attorney-client relationship directly, defines the
scope and sets a la carte pricing. Funūn provides intake, routing, secure workflow and
authorized document return, not legal advice. Before implementation, counsel must
approve jurisdiction, referrals, attorney advertising, fee/payment structure, privilege,
data access, professional responsibility and disengagement boundaries.

## Claude / GSD instruction

Treat this doctrine as a hard requirement in every future contract, Contract Locker,
e-signature and sync-representation plan. Do not mark the foundation shipped merely
because PDFs can be generated or signed; the versioning, review provenance, protected
language, acknowledgments and independent-counsel boundary are part of the feature.
