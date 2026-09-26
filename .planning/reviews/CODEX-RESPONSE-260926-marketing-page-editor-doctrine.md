---
type: review-response
reviewer: codex
created: 2026-09-26
status: complete
subject: doctrine for an internal marketing-page editor
prompt: .planning/reviews/CODEX-PROMPT-260926-marketing-page-editor-doctrine.md
---

# Marketing Page Editorial Doctrine

**Status:** Governing doctrine for the internal marketing-page editor  
**Scope:** Funūn Team Members with the `marketing` role draft; Funūn Team Members with the `leadership` role publish.  
**Applies to:** Public marketing content only. It does not govern Member content, limited guest / signature recipient workflows, or Client Partner relationships.

## 1. Classify statements, not sections

Apply this test to every field, quote, image caption, CTA and piece of metadata:

> **If changing this could change what a reasonable visitor believes Funūn does, costs, permits, protects, owns, guarantees or will do for them, treat it as a claim.**

Classify the smallest meaningful statement. Do not classify an entire hero or testimonial section as harmless “content.”

A hero can contain:

- Editable campaign artwork.
- An editable editorial kicker.
- A claim-bearing lede.
- A pricing CTA.
- A statement about ownership.

A testimonial can contain:

- A person’s name and photograph.
- Their genuine opinion.
- A claim about what Funūn did.
- An implied claim that other customers can expect the same result.

Therefore, the proposed two-tier distinction is directionally right but incomplete. Use three governance classes:

1. **Editorial content** — presentation, ordering and non-claim campaign language.
2. **Verified claims** — statements about product behaviour, rights, pricing, privacy, eligibility, service or outcomes.
3. **Controlled policy text** — legal terms, rights policies, privacy notices and other language that the marketing editor must never alter.

Testimonials are not automatically editorial content. FTC guidance says an endorsement cannot make a claim that the advertiser could not make directly, must reflect the endorser’s honest experience and may require disclosure of a material connection. See [FTC Endorsement Guides](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking).

## 2. Govern claims by evidence, not by file location

Do not make “claims live in code” the permanent bright line.

Code is a useful v1 containment boundary, but putting prose in a repository does not make it true. A pull request can prove that wording was reviewed; it does not prove that:

- The behaviour is deployed.
- A feature flag is enabled.
- Production permissions match the intended design.
- An external integration still works.
- A service team has capacity.
- A contract clause applies to every customer.
- A comparative claim remains current.

Use this permanent rule instead:

> **A claim may reach the public page only through a versioned claim record with sufficient, current evidence and an accountable verifier.**

For v1, keep claim-bearing fields read-only in the marketing editor. Let a Funūn Team Member with the `marketing` role submit a structured change proposal, but route the actual change through the existing code-review process.

Later, allow claim-bearing copy to change without a deploy only after a claim registry exists. Leadership must remain the publisher, but publication approval and claim verification must be separate recorded facts:

- `verified_by` answers: “Who established that this claim is supported?”
- `approved_by` answers: “Who chose to publish this exact page revision?”

The same person may perform both actions when that person holds the required roles. Preserve two explicit actions and record that it was self-approved. Do not present self-approval as independent review.

## 3. Maintain a claim registry before allowing editable claims

Give every claim a stable identity independent of its wording or page placement.

At minimum, record:

- Stable claim ID.
- Canonical meaning: what a reasonable visitor should take away.
- Claim class:
  - Product behaviour.
  - Pricing or entitlement.
  - Legal or rights.
  - Privacy or security.
  - Operational or service promise.
  - Comparative or market-position claim.
  - Customer outcome.
- Approved wording and any approved variants.
- Required qualifiers.
- Applicable audience, plan, jurisdiction and environment.
- Availability state: released, limited beta, planned or retired.
- Evidence references.
- Evidence type and strength.
- Repository commit SHA, deployed build SHA and `file:line` where applicable.
- Relevant automated test and production-verification references.
- Contract, policy or runbook version where applicable.
- Accountable evidence owner.
- Verifier and verification timestamp.
- Review deadline.
- Status: `draft`, `verified`, `stale`, `conflicted`, `rejected` or `retired`.
- Dependencies whose change should mark the claim stale.

Treat `file:line` as a human pointer, not proof. Lines move, comments lie and undeployed branches exist. Anchor repository evidence to a commit and compare it with the deployed build.

Use evidence appropriate to the claim:

| Claim type | Minimum useful evidence |
|---|---|
| Product behaviour | Deployed code, an exercising test and production verification |
| Pricing or allowance | Live entitlement configuration and billing behaviour |
| Legal or ownership | Approved agreement or policy version plus legal review |
| Privacy or security | Verified data flow, access-control test and security review |
| Service promise | Owned runbook, staffing responsibility and measurable service commitment |
| Comparative or “first” claim | Dated market research with a defined comparison set |
| Customer outcome | Substantiation beyond an anecdote, plus any required qualification |

A reservation-of-ownership clause can establish what an agreement says. It cannot, by itself, establish that every visitor “always owns” every song and recording in every factual situation.

## 4. Make the editorial boundary visible in the interface

Do not make Funūn Team Members memorize which fields are editable.

Label every field with text and an icon:

- **Editable content** — “Marketing can change this. Leadership publishes it.”
- **Verified claim** — “This describes what Funūn provides or promises. Evidence is required.”
- **Controlled policy** — “This language is managed outside the marketing editor.”

Do not communicate the distinction by colour alone.

Render verified claims as intentional claim cards, not disabled text boxes. Each card should show:

- Current approved wording.
- Claim class.
- Status.
- Last verification date.
- Accountable owner.
- A concise evidence summary.
- `View evidence`.
- `Check again`.
- `Propose a change`.

A change proposal should capture:

- Requested wording.
- Reason for the change.
- Intended visitor takeaway.
- Supporting evidence, if known.
- Desired publication date.

Explain the boundary once at the page level:

> **You can edit campaigns, media and presentation here. Product, pricing, rights and privacy claims require verification before they can change.**

Repeat the explanation locally where a locked field appears. Do not send someone to an unexplained ticket queue.

## 5. Use AI primarily as a verifier

Invert the assistant as proposed. Verification is the higher-value job.

Call it a **claim checker**, not a truth checker. It should answer:

1. What evidence was found?
2. What exact portion of the proposed statement that evidence supports.
3. What the evidence does not establish.
4. Whether the evidence matches the deployed product.
5. Whether conflicting or stale evidence exists.
6. Who must decide when the answer is not technical.

Use explicit results rather than confidence percentages:

- `ESTABLISHED`
- `PARTIALLY_ESTABLISHED`
- `NOT_ESTABLISHED`
- `CONFLICTING_EVIDENCE`
- `STALE_EVIDENCE`
- `OUTSIDE_CHECKER_SCOPE`

Retain `NO_APPROVED_ANSWER` as the grounded assistant’s response when approved evidence does not establish an answer.

Do not let the assistant publish, approve, verify its own writing or change a claim’s status.

## 6. Constrain AI writing mode

A writing mode may exist, but confine it to:

- Claim-free editorial language.
- Headline variations around an immutable approved claim.
- Shortening copy without changing the approved meaning.
- Grammar, spelling and tone changes.
- Alt-text drafts that describe visible content without adding a product claim.
- Reordering approved content.
- Drafting questions for the evidence owner.

Allow the assistant to insert approved claim blocks or approved variants. Do not allow it to rewrite locked claim text freely.

Forbid writing mode from:

- Inventing product behaviour.
- Removing a qualifier.
- Broadening “may” into “will.”
- Turning a capability into a guaranteed result.
- Turning a roadmap item into an available feature.
- Changing prices, allowances, deadlines or eligibility.
- Creating “always,” “never,” “first,” “only,” “secure,” “private,” “accurate” or “guaranteed” claims without matching approved evidence.
- Interpreting ownership, licensing authority or legal effect.
- Rewriting a testimonial into words the subject did not approve.
- Inventing a testimonial, identity, photograph or voice.
- Inferring consent.
- Producing a material-connection disclosure without the recorded facts.
- Treating repository comments, plans or migrations as proof of deployed behaviour.
- Publishing or approving its own output.

Show a diff for every AI-assisted change and preserve the prompt, evidence set, model/version and accepting Funūn Team Member in the audit record.

## 7. Require the claim checker to refuse aggressively

Require refusal when:

- No approved source establishes the claim.
- Only a roadmap, planning document, comment or dead code supports it.
- Code exists but is not in the deployed build.
- A feature flag or plan entitlement is unknown.
- The evidence applies only to some Members, plans, jurisdictions or projects and the copy omits that scope.
- Two approved sources conflict.
- Evidence is past its review date.
- The claim is about external services whose current behaviour was not checked.
- The claim is a negative universal such as “we never share.”
- The claim is comparative, superlative or a “first” without current market substantiation.
- A legal clause is being generalized beyond the agreement and parties it governs.
- A service promise lacks an owner, runbook or capacity commitment.
- A privacy claim lacks an end-to-end data-flow review.
- A security claim is based only on intended architecture.
- A customer outcome is supported only by a testimonial.
- The proposed copy removes a material qualifier.
- The request asks the checker to decide a legal conclusion, commercial judgement or policy choice.

The checker may report evidence in these cases. It must refuse to label the public statement established.

## 8. Communicate the limits of code-grounded verification

A code-grounded check is useful but incomplete. Present its result as:

> **Evidence found in the deployed product**

Do not present it as:

> **This claim is true**

For each result, show an evidence ladder:

1. **Text found** — the concept appears in code or documentation.
2. **Path implemented** — executable code appears to provide it.
3. **Test exercised** — a test reaches the relevant behaviour.
4. **Deployed** — the evidence commit matches production.
5. **Observed** — production verification confirms the expected result.
6. **Policy or legal approval** — the applicable accountable role approved the public meaning.

Not every claim needs all six levels. The UI must show which levels exist.

Code-grounded verification stops working reliably for:

- Legal enforceability.
- Ownership in fact-specific disputes.
- Human service quality or future capacity.
- Current competitor comparisons.
- External system behaviour.
- Security absolutes.
- Privacy claims involving unseen operational practices.
- Subjective outcomes.
- Anything dependent on data the checker is not authorised to read.

## 9. Treat consent as a publication dependency

Create a hard publication gate for any identifiable person, voice, quote, artwork or likeness requiring permission.

Missing, expired or withdrawn consent must block publication. This is not too rigid; it is the minimum honest behaviour for a rights product.

At minimum, record:

| Record | Requirement |
|---|---|
| Subject | Verified identity and contact method |
| Capacity | Adult capacity, authorised representative or guardian where required |
| Approved identity fields | Exact approved name, role, city, handle and organization |
| Approved content | Exact quote, transcript, audio, photograph and artwork |
| Asset identity | Stable asset IDs and hashes linking consent to exact media |
| Scope | Website, social, email, paid advertising, press and other destinations separately |
| Permitted transformations | Cropping, resizing, excerpting, subtitles, transcription, translation and dubbing |
| AI use | Separate explicit permission; never infer permission for training or synthetic generation |
| Territory and term | Where and for how long the permission applies |
| Compensation | Payment, free services, gifts, employment or any other material connection |
| Release version | Exact release text, version, locale and document hash |
| Assent evidence | Signature or affirmative action, timestamp, method and supporting audit evidence |
| Status | Pending, active, withdrawn, expired or superseded |
| Revocation | Method offered, request timestamp, effective timestamp and completed-removal timestamp |
| Source | Internal invitation, public intake or other recorded source |
| Downstream use | Every Funūn-controlled destination where the material was published |
| Rights assurance | Who supplied the media and what authority they represented having |
| Retention | What proof is retained after withdrawal and under what approved policy |

Do not assume that a publicity release and consent to process personal data are the same legal instrument. Counsel must determine the applicable legal basis and release language by jurisdiction.

Where consent is the applicable basis, design to the stronger operational standard that withdrawal is as easy as granting it. GDPR Article 7 states that consent withdrawal must be as easy as giving consent; applicability will depend on jurisdiction and lawful basis. See [GDPR Article 7](https://eur-lex.europa.eu/legal-content/EN/AUTO/?uri=CELEX%3A32016R0679) and [ICO consent-management guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/consent/how-should-we-obtain-record-and-manage-consent/).

## 10. Make revocation an emergency suppression action

Do not route revocation through the normal marketing-draft and leadership-publication queue.

A verified withdrawal should perform one atomic eligibility change that:

1. Marks the consent withdrawn.
2. Makes every linked item ineligible for public resolution.
3. Deactivates current and scheduled placements.
4. Invalidates the published-page cache.
5. Removes or blocks public media aliases.
6. Queues deletion of public renditions.
7. Creates takedown tasks for other Funūn-controlled destinations.
8. Notifies leadership and the accountable marketing owner.
9. Records completion and any destination that could not be removed automatically.

Allow an authorised Funūn Team Member to suppress first and investigate second. Leadership notification is required; prior approval is not.

Set and test a takedown service objective before launch. The intended experience should be one action with removal from Funūn-controlled web surfaces within minutes. Do not promise a precise time publicly until it has been measured.

Be honest about the limit: Funūn can remove its own page, media endpoint and controlled posts. It cannot recall screenshots, downloads, search caches or third-party republication instantly. The release and revocation UI must explain that distinction.

Keep originals private. Serve approved public renditions through a revocable asset identity rather than exposing the private original’s permanent URL.

## 11. Reuse existing systems by pattern, not by forcing everything into one table

| Existing capability | Reuse | Do not assume |
|---|---|---|
| The Playbook lifecycle | Reuse revision numbers, immutable history, approver fields and review intervals. | Do not put marketing records into the Playbook table merely because the columns look similar. Marketing adds public rendering, consent, scheduling and cache invalidation. |
| Four-state lifecycle | Reuse its vocabulary where it fits. | Scheduling may require a distinct approved/scheduled state. Do not pretend `draft_pending` and `published` describe every transition. |
| Adoption model | Use it to seed currently hard-coded editorial content. Preserve `source_path`, source hash and one-time adoption. | Do not let later repository changes silently overwrite adopted database content. Do not treat adopted claims as verified merely because they came from the repository. |
| Grounded assistant | Reuse authorised retrieval, hostile-excerpt handling, citation rules and `NO_APPROVED_ANSWER`. | Repository excerpts alone are insufficient evidence for deployment, legal effect or operational promises. |
| Public write endpoints | Reuse rate limiting, bot protection, validation and source discrimination. | Testimonial intake also requires media scanning, identity confirmation, consent evidence, moderation and claim review. |
| Supabase Storage | Reuse storage infrastructure and media-processing conventions. | Do not place marketing media in Member release-material buckets or make unapproved originals public. |

Use separate logical homes for:

- Private testimonial and collaborator-sphere intake.
- Private approved originals.
- Public, revocable renditions.

Use opaque asset names. Do not place names, email addresses or other personal information in public storage paths.

## 12. Ship the smallest honest v1

Ship two section types and one publication workflow.

### Hero carousel

Allow a Funūn Team Member with the `marketing` role to:

- Add and reorder slides.
- Activate or deactivate slides.
- Set a bounded dwell time.
- Schedule a start and end time.
- Upload artwork.
- Edit claim-free campaign text.
- Select approved claim blocks.
- Choose CTA destinations from an allowlist.

Do not make every hero text field unrestricted. A title, tagline or lede may be claim-bearing even when the section is called “content.”

### Testimonial library

Allow:

- Internal creation.
- A subject-specific intake link.
- Quote, identity, photograph and optional audio.
- Consent collection.
- Exact quote/transcript approval.
- Material-connection recording.
- Claim review.
- Display selection, ordering and display count.
- Immediate suppression and revocation.

Prefer an expiring, subject-specific intake link over an openly discoverable submission form in the smallest v1. This gives the subject a limited guest / signature recipient context and reduces impersonation, spam and untrusted-media exposure.

An open public intake form can follow once moderation, identity confirmation, malware handling and abuse operations have been exercised.

### Publication workflow

Require:

- Draft isolation.
- Exact-render preview.
- Claim and consent validation.
- Leadership approval.
- Atomic publication.
- Immutable revision history.
- One-click safe rollback.
- Emergency suppression.

Do not put the AI writing assistant in the critical path of v1. Add claim checking after the claim registry and evidence model exist; otherwise the assistant will provide confidence theatre.

## 13. Build a section registry, but do not build a page builder

Agree with the section-registry proposal. Disagree that every later section should necessarily be “just a config entry.”

Make section **types** code-defined and section **instances** database-managed. A third section is configuration-only when it fits an existing registered type. A genuinely new interaction or presentation still requires a registered implementation.

Each section type must declare:

- Stable section-type key.
- Schema version.
- Field schema and validation.
- Field-level governance class.
- Editor form.
- Production renderer.
- Preview renderer using the same rendering path.
- Media slots, types, sizes, aspect ratios and accessibility requirements.
- Consent requirements.
- Claim requirements.
- Minimum and maximum item counts.
- Ordering and display rules.
- Scheduling rules.
- CTA restrictions.
- Empty and failure states.
- Localisation capability.
- Publication validators.
- Cache dependencies.
- Revision-diff behaviour.
- Schema migration function.
- Emergency-suppression behaviour.
- Test fixtures.

Do not build:

- Arbitrary drag-and-drop layouts.
- User-supplied HTML.
- User-supplied CSS or JavaScript.
- A generic JSON renderer capable of inventing components.
- A Wix clone.

The goal is repeatable governed sections, not unrestricted page construction.

## 14. Treat the collaborator sphere as cheaper, not free

Reuse from testimonials:

- Person identity.
- Media assets and renditions.
- Consent lifecycle.
- Display eligibility.
- Selection and ordering.
- Revocation.
- Audit history.

Still budget separate work for:

- A different public renderer and responsive layout.
- Photograph cropping and focal points.
- Higher person count.
- Professional-detail validation.
- Employer and organization-name accuracy.
- Potential trademark or logo permissions.
- Data-freshness review.
- Bulk selection and reordering.
- Accessibility at high visual density.
- Different implications of association or endorsement.

A photograph and professional title can imply that someone currently works with, endorses or is represented by Funūn. That implication must be reviewed even when no testimonial quote appears.

The amount of reuse is uncertain until the final sphere design and data fields are known. Expect substantial workflow reuse, not a configuration-only launch.

## 15. Keep these things out of the marketing editor

Exclude permanently:

- Terms of service.
- Privacy and cookie policies.
- Rights policies.
- Contract templates.
- Sync representation authority.
- Catalogue admission rules with legal or commercial effect.
- Security promises.
- Data-retention promises.
- Prices and plan-entitlement logic as free text.
- Arbitrary HTML, scripts, tracking pixels or styles.
- Environment variables, secrets and integration credentials.
- Member private information.
- Limited guest / signature recipient private information.
- Buyer-organization records or Client Partner relationship data.
- Payment, tax or banking information.
- Executable redirects or arbitrary CTA destinations.
- Synthetic testimonials.
- AI-generated people, voices or endorsements presented as real.
- Unreviewed automatic translations.
- Product roadmap statements presented as available features.

A separate controlled publication system may eventually manage legal policies. That does not make them marketing content.

## 16. Design now for the first 10× failure: locales

More locales will break the model before more sections do.

A translation can:

- Broaden a claim.
- Remove a qualifier.
- Change a legal meaning.
- Misstate a professional role.
- Turn an individual experience into a general promise.
- Exceed the consent granted for translating a quote or dubbing a voice.

Give content a stable language-independent identity and attach locale variants to it. Do not make the English string the record identity.

Require per-locale:

- Exact preview.
- Claim-equivalence review.
- Testimonial-subject approval where words are translated or voiced.
- Material-connection disclosure.
- Fallback rules.
- Publication status.
- Review date.

Do not build a translation editor in v1, but avoid a schema that makes localisation a destructive migration.

The next pressure will be more editors. Prepare with:

- Optimistic locking.
- Draft ownership.
- Conflict detection.
- Field-level revision diffs.
- Approval invalidation after any edit.
- Server-verified role checks on every mutation.

More sections are manageable if the registry remains typed and versioned. Media volume and cache invalidation will become the next operational constraint.

## 17. Require exact preview before publication

Do not approve an abstract form. Leadership must approve the exact page revision visitors will receive.

The minimum preview must:

- Use the production renderer.
- Include the exact selected claim versions.
- Include final media renditions.
- Show mobile and desktop layouts.
- Show carousel order and dwell behaviour.
- Exercise CTA destinations.
- Include alt text, transcript and accessible controls.
- Reflect scheduled content and timezone.
- Use an expiring, authenticated, `noindex` preview URL.
- Prevent unapproved media from becoming publicly enumerable.

Before approval, show:

- Current production versus draft.
- Text diff.
- Item additions and removals.
- Reordering.
- Consent status.
- Claim status.
- Broken or unapproved links.
- Accessibility requirements.
- Scheduled activation and expiry.
- The exact revision hash being approved.

Any change after approval must invalidate approval.

When one person holds both `marketing` and `leadership`, require that person to complete separate `Submit for approval` and `Publish` actions. Record both actions, timestamps, role snapshots and the approved revision hash.

## 18. Publish immutable manifests and make rollback a new publication

Publish one immutable page manifest containing:

- Section-instance revision IDs.
- Claim IDs and versions.
- Media rendition IDs.
- Consent-record IDs and status checks.
- Ordering.
- Schedule.
- Approver.
- Publication timestamp.
- Manifest hash.

Switch the public page atomically from one manifest to another. Never expose a half-published page.

Rollback must create a new publication event pointing to a prior eligible manifest. Before rollback, revalidate:

- Consent is still active.
- Claims are still verified.
- Assets still exist.
- CTA destinations are still allowed.
- Nothing has expired or been retired.

Never let rollback resurrect withdrawn consent, a known-false claim or deleted media.

Keep emergency suppression separate from rollback. Removing one person whose consent was withdrawn must not require reverting unrelated marketing changes.

After publication, run a smoke check against the public page and retain a safe static fallback if the content service is unavailable.

## 19. Add the safeguards that are easiest to forget

### Govern the entire visitor impression

Apply claim review to:

- Visible copy.
- Testimonials.
- Artwork containing text.
- Image alt text.
- Audio transcripts.
- Page titles and descriptions.
- Open Graph cards.
- Structured data.
- CTA labels.
- Captions and footnotes.

A technically qualified sentence can still become misleading when paired with an image, headline or testimonial that overwhelms the qualifier.

### Track material connections

Record whether a testimonial subject is:

- A Funūn Team Member.
- A contractor.
- An investor.
- A paid endorser.
- Receiving free service.
- A friend or family connection.
- Receiving another benefit.

Render a clear disclosure when required. Do not bury it in an information modal.

### Preserve testimonial integrity

Keep the submitted original and every proposed edit. Permit spelling, punctuation and length edits only through an explicit subject-approval step when meaning could change. Audio and its displayed transcript must agree.

### Sanitize all public input

Accept structured plain text, not rich HTML. Scan uploaded media, verify type by content, transcode public renditions and quarantine failures.

### Allowlist destinations

A marketing editor must not become an open-redirect or phishing system. Restrict CTA destinations to approved internal routes and reviewed external domains.

### Plan for scheduled expiry

Heroes, consent, claims and campaigns all age. Support start time, end time, timezone and an explicit fallback when the active set becomes empty.

### Define stale-claim behaviour

- If a claim is known false, suppress or replace it immediately.
- If evidence is merely past review, alert the owner and block new publication.
- For high-risk rights, price, privacy or security claims, define a fail-closed fallback.
- Do not silently leave a contradicted claim live while a ticket waits.

### Record downstream reuse

If marketing exports a testimonial to Instagram, email or a press kit, record that destination. Revocation cannot propagate to destinations the system does not know exist.

### Keep audit evidence without retaining public exposure

Withdrawal should remove public use. It does not necessarily require destroying the minimal evidence that consent existed and was later withdrawn. Counsel must define retention and deletion rules; the marketing team must not improvise them.

## 20. Final operating rules

1. **Classify the statement, not the section.**
2. **Treat any visitor-reliance statement as a claim.**
3. **Let marketing edit editorial content; require evidence for claims; exclude policy text.**
4. **Use code as the v1 containment boundary, not as permanent proof.**
5. **Make leadership approve the exact immutable revision that will be published.**
6. **Record verification separately from publication approval.**
7. **Let AI draft only inside claim-safe boundaries.**
8. **Require the claim checker to say what the evidence does not prove.**
9. **Block publication when required consent is absent, expired or withdrawn.**
10. **Let revocation suppress first and notify leadership immediately afterward.**
11. **Reuse Playbook workflow patterns without forcing marketing into the Playbook’s data model.**
12. **Register typed sections; do not build an unrestricted page builder.**
13. **Preview with the production renderer and invalidate approval after every edit.**
14. **Rollback only to content that remains currently eligible.**
15. **Design identity and revisions for future locales now, even if v1 is English-only.**

## Uncertainties requiring an explicit owner

- The legally sufficient release language is jurisdiction-dependent and must be approved by counsel.
- The applicable privacy-law basis for storing and publishing a person’s media cannot be inferred from a marketing release alone.
- Exact takedown latency cannot be promised until cache and media invalidation have been measured in production.
- The amount of implementation reuse for the collaborator sphere depends on its final presentation and professional-detail fields.
- A code-grounded checker’s reliability depends on deployed-build identification, test coverage and evidence outside the repository. Without those, it must report limited evidence rather than truth.
