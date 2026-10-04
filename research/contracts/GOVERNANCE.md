# Contract Template and Counsel Governance

**Status:** Owner-approved product direction; implementation and final legal language pending counsel review  
**Recorded:** 2026-10-04

This document governs how research contract sources may eventually become Funūn templates and how users may work with their own lawyers on the platform. It is product policy, not legal advice or final Terms of Service language.

## Three roles that must remain distinct

### 1. Funūn

Funūn provides structured templates, questionnaires, document generation, collaboration, e-signature workflow, and Contract Locker storage. Funūn does not act as a user's attorney, select legal outcomes for the user, or represent that a standard template is suitable for every person, transaction, or jurisdiction.

### 2. Template-review counsel

A designated attorney reviews each exact template version before Funūn may publish it for generation or signature. Review provenance must identify the reviewer, review date, supported use case and jurisdictions, known exclusions, and re-review date or trigger.

Template review supports the quality and governance of Funūn's standard form. It does not, by itself, create an attorney-client relationship between the reviewing attorney and a Funūn user.

### 3. A user's independently retained counsel

An artist, staff member, counterparty, or other authorized user may invite their own lawyer to create a Funūn account and collaborate on the relevant matter. Any attorney-client relationship is formed directly between that lawyer and client, outside Funūn's role as a workflow platform.

## Publication gate for every template

A research source may enter the repository before attorney review, but it must remain visibly quarantined. It cannot become generator-, e-signature-, or Contract Locker-template eligible until:

1. The exact legal text has been reviewed and approved by designated counsel.
2. The review scope, jurisdictions, exclusions, reviewer provenance, and review date are recorded.
3. Protected clauses and user-editable business terms are explicitly identified.
4. Product owners approve the questionnaire, validation, signer roles, disclosures, and lifecycle.
5. Engineering assigns an immutable template version and verifies generation, authorization, audit, e-signature, and storage behavior.
6. The user-facing experience clearly recommends that parties obtain their own legal advice before sending or signing.

Any change to protected legal language invalidates the reviewed designation for that version until the changed exact text is reviewed again.

## Terms of Service and user-facing disclosures

The Terms of Service and contract workflow should clearly state, in language approved by counsel, that:

- Funūn is a technology and workflow platform and is not acting as the user's lawyer.
- Providing a template, questionnaire, explanation, automation, or e-signature workflow is not legal representation or individualized legal advice.
- Review of a standard template by Funūn's designated counsel does not mean that counsel represents each platform user.
- Users and counterparties should retain their own qualified counsel before sending, relying on, negotiating, or signing an agreement.
- A user's lawyer may collaborate through an authorized Funūn account, subject to platform permissions and the lawyer's own professional obligations.

The disclaimer is one part of the operating model, not a substitute for appropriate product boundaries, jurisdiction analysis, access controls, or professional-responsibility review.

## Lawyer account and collaboration requirements

The eventual lawyer-collaboration experience should support:

- A lawyer account or verified professional role without implying that Funūn employs or endorses that lawyer.
- Client-controlled invitation to a specific workspace, project, document, or matter.
- Least-privilege access, with an explicit scope and expiration or revocation path.
- Clear labels showing whether the lawyer is template-review counsel, the user's counsel, counterparty counsel, or another reviewer.
- Separate permissions to view, comment, propose changes, approve a version, prepare a signing copy, or access executed documents.
- Version history, comments, approvals, downloads, signatures, and access changes in the audit trail.
- A visible record of who the lawyer represents, when appropriate and approved by counsel.
- Client authorization before documents or data are shared with a lawyer or firm.
- Secure handling of confidential material and a retention/export path appropriate to the matter.

## Decisions still requiring counsel and product design

- Final Terms of Service and in-product disclosure language.
- Whether and how attorney identity, licensure, jurisdiction, and good standing are verified.
- Conflicts checks and engagement-letter handling.
- Privilege and confidentiality boundaries, including what Funūn personnel can access.
- Whether comments or communications receive special retention or visibility treatment.
- Cross-border matters and unsupported jurisdictions.
- Attorney advertising, referrals, payments, fee sharing, and independent-law-firm marketplace rules.
- Procedures when counsel withdraws, access is revoked, a client changes lawyers, or parties are adverse.

