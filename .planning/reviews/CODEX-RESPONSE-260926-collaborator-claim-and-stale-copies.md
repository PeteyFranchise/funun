---
type: review-response
reviewer: codex
created: 2026-09-26
status: received, partially verified
subject: the invited-collaborator claim screen, and stale copies of a person's rights data
prompt: .planning/reviews/CODEX-PROMPT-260926-collaborator-claim-and-stale-copies.md
verification: .planning/reviews/CODEX-VERIFICATION-260926-collaborator-claim-and-stale-copies.md
headline: >
  Do not ship the claim screen in isolation. Three surfaces resolve party identity
  differently and the minted PDF can carry a value the owner's screen says was corrected.
  Fix that first.
---

> Pasted verbatim from Codex, 2026-09-26. Claims are verified separately — see the
> verification document in the frontmatter. Do not act on an unverified claim in here.

# Doctrine: Rights Identity, Collaborator Claims, and Split-Sheet Snapshots

**Status:** Pre-build doctrine
**Applies to:** Members, limited guests / signature recipients, collaborator records, rights identity, split sheets, and executed amendments
**Does not create:** a fourth identity class. Client Partner remains a relationship held by a Member; Funūn Team Member remains the staff identity class; Team remains a Member pricing tier.

## Bottom line

Do not ship the proposed claim screen as an isolated UI change. The correct model is: an inviter owns their private observation, the described person controls their own assertions, a registry may verify an identifier, the parties choose the work-specific values, and the executed document preserves exactly what was agreed. Allow draft creation with warnings, but do not permit an inviter-only override of a subject-confirmed conflict at the signature boundary. Keep immutable snapshots, but create the legally meaningful snapshot at mint—not at initial draft creation—and reconcile every signing surface against the same proposed version first. Treat the current mint path as an integrity defect because it can render older stored identity values even when the owner's editor displays newer live values.

## 1. Use "authority" rather than pretending one record owns the truth

1. **Treat `collaborators` as an inviter-owned observation.** It records what one Member believes or needs for their roster. It must retain provenance and may remain different from the described person's assertions.
2. **Treat a Member's confirmed `user_profiles` values as subject assertions, not automatically verified facts.** A verified account email proves control of an email address; it does not prove that an IPI, PRO, publisher, administrator, legal name, or address is correct.
3. **Treat registry-verified evidence as a separate authority.** Do not use the word "verified" merely because the value came from a Member's profile.
4. **Treat split-sheet party values as work-specific proposals.** They answer "what identity and rights information are we using for this work?" rather than "what is universally true about this person?"
5. **Treat the executed PDF and its audit evidence as the immutable record of what the parties signed.** Correct it through a void/reissue or signed amendment; never mutate the executed artifact.

Do not define a single global precedence rule such as "the Member profile always wins." Use field-specific authority:

| Field class | Default authority | Required behavior |
|---|---|---|
| Personal legal identity | The person's confirmed assertion, ideally supported by evidence where legally necessary | An inviter's alternate value becomes a disagreement, not an automatic override |
| PRO/IPI identity | The person chooses the applicable registered identity; external registry evidence may verify it | Do not assume one scalar value is correct for every work; this cardinality requires rights-operations validation |
| Publisher/administrator | Work- and agreement-specific selection | Never overwrite it globally merely because a profile default changed |
| Role and split percentage | Agreement among the parties | Never derive from the person's profile |
| Phone, mailing address, payout or tax information | The person, shared for a disclosed purpose | Never propagate automatically to every inviter or document |
| MLC/SoundExchange identifiers | Registry- and workflow-specific | Do not place them on a split sheet merely because they exist in a profile |

The current resolver treats PRO, IPI, publishing designee, administrator, and legal name as one homogeneous live-linked group (`lib/split-sheets/live-identity.ts:39-53`, `:74-92`). That is too coarse for long-term doctrine.

## 2. Correct the premises before planning the screen

### A claimed person can already read the inviter's row
The original owner-only policy exists (`018_collaborators_split_sheets.sql:29-31`), but migration 026 added a separate SELECT policy allowing `claimed_by = auth.uid()` to read the row (`026_collaborator_identity_reconciliation.sql:63-69`). The described person still cannot edit that row.

> Before linkage, the described person cannot read the row. After linkage, they can read it, but only the inviter can edit it.

### Existing Members may be linked without seeing an invitation
Migration 179 automatically links a row to an existing confirmed Member with that email (`179_existing_member_collaborator_reconciliation.sql:10-55`). Quick Invite then returns `alreadyMember: true` and does not generate a signup link (`app/api/collaborators/quick-invite/route.ts:115-127`). A screen inserted only before `/signup` will miss existing Members.

### A verified signup claims more than the token's one row
`claim_collaborators()` links every unclaimed collaborator row with the same email (`076_rename_artist_profiles_to_user_profiles.sql:345-349`), then chooses the most recently updated nonblank third-party value for each empty profile field (`:368-481`).

### The current reverse prefill is not authoritative identity
The selected third-party value is written into `user_profiles` with `claim_prefill[field].confirmed = false` (`076:384-481`). Settings labels it "Unconfirmed — review this value" (`components/profile/RightsContractsSections.tsx:88-125`). However the live split-sheet resolver receives profile fields without their confirmation provenance and lets any present profile value win (`lib/split-sheets/live-identity.ts:61-92`; `app/(artist)/split-sheets/[id]/page.tsx:196-236`).

### Split sheets are intended to remain live before mint
The newer lifecycle defines `draft`, `pending_approval`, `approved`, `countered` as pre-freeze; only `esign_pending` and `executed` are frozen (`lib/split-sheets/lifecycle.ts:1-14`, `:121-126`). "The wrong value freezes when the draft is created" is not current doctrine. The intended freeze is mint.

### The implementation does not consistently honor that doctrine
- The initiator's detail page resolves current Member profile values (`app/(artist)/split-sheets/[id]/page.tsx:196-253`).
- The public approval page reads the stored row directly (`app/approve/[token]/page.tsx:24-27`, `:159-165`).
- The mint route also renders directly from stored party fields (`app/api/split-sheets/[id]/mint-envelope/route.ts:126-130`, `:247-282`).

An identity-only refresh is deliberately excluded from `partiesActuallyChanged()` (`lib/split-sheets/lifecycle.ts:57-73`), so saving the owner's live-looking editor may not persist what the owner sees. **This is the load-bearing defect: the editor, recipient, and PDF can use different identity versions.**

### A limited guest / signature recipient can already edit identity
The approval-token screen offers identity correction (`components/split-sheets/SplitApprovalView.tsx:229-260`). Its public route writes directly to the party snapshot and then attempts to overwrite the inviter's collaborator row (`app/api/approve/[token]/route.ts:61-109`). That conflicts with the proposed "never silently overwrite the inviter's row" rule. It also passes `publishing_designee` into a collaborator record whose corresponding column is `publisher`; the secondary update's error is ignored.

### MLC ID and mailing address are not split-sheet party snapshots
The creation allowlist includes name, email, PRO, IPI, role, split, legal name, publishing designee, administrator (`app/api/split-sheets/route.ts:7-25`, `:140-153`). It does not copy MLC ID, SoundExchange ID, phone, or mailing address.

### Do not state that every wrong IPI sends royalties "to nobody"
A wrong IPI can cause a mismatch, delay, dispute, or incorrect attribution. Treat the harm as serious, but do not promise a deterministic outcome the code does not establish.

## 3. Change Decision 1: verify the inbox before disclosing the record

Do not show full name, full email, PRO, or sensitive-field presence merely because someone possesses a bearer link. The current public resolver already returns the full invited email (`app/api/signup/invite/[token]/route.ts:101-119`), but that is not a reason to expand the exposure.

1. Before verification, show only: that the invitation came from a named inviter; a masked destination such as `e***@example.com`; the purpose; and actions to verify, decline as wrong recipient, or get help.
2. Do not reveal PRO or the presence of IPI, MLC ID, address, phone, payout, or tax information before verification.
3. Verify control of the invited email using the existing confirmed-signup boundary or an email OTP.
4. After verification, let the person review the actual values as a limited guest / signature recipient. Do not require Member conversion to access, correct, or decline information about themselves.
5. Offer conversion to Member separately.

A bearer token can authorize one narrow invited action without authenticating the holder as the described human.

## 4. Make claim review field-by-field and provenance-aware

1. Show every inviter whose row was or will be linked by the normalized email.
2. Show each distinct candidate value, who supplied it, when, and whether the described person confirmed it.
3. Let the person confirm, correct, leave unresolved, or say the record is not about them.
4. Never choose "most recently updated inviter wins." Recency proves only that somebody typed later.
5. Never write a third-party candidate into the authoritative profile without visible, machine-readable unconfirmed provenance.
6. Never feed an unconfirmed prefill into a split sheet as though the person supplied it.
7. Preserve prior assertions as history.

Source states: `inviter_observed`, `subject_unconfirmed`, `subject_confirmed`, `registry_verified`, `document_selected`, `document_acknowledged`, `executed_snapshot`, `superseded`.

"Claim" must mean "link this record to the person who controls the verified email," not "the person now agrees every value in it is true."

## 5. Preserve the inviter's record, but do not let it silently govern the person

Decision 2 is directionally correct. When values disagree:

1. Create a structured disagreement per field.
2. Notify the inviter that their copy differs; do not put the raw IPI, address, phone, tax or bank data in the notification.
3. Let the inviter open Funūn to see the comparison only where the person authorized that sharing.
4. Let the inviter accept individual fields, not all-or-nothing.
5. Record who accepted which value, source, timestamp.
6. If the inviter keeps a different value, preserve it as `inviter_observed`; do not mark resolved merely because they declined.
7. Do not automatically share mailing address or private contact information with every inviter.

`lib/profile/claim-prefill.ts` is reusable for provenance shape, but its "most recent source wins" behavior must not be (`:38-53`).

## 6. Keep draft creation permissive; make signature dispatch strict

**Warn and allow override is defensible at draft creation. It is not defensible as the only control before signature.**

**Draft creation** — allow, warn inline, do not freeze identity, do not interrupt the creative act.

**Approval request** — resolve every party against the same reconciliation service; show the recipient the exact identity fields proposed for them; require an explicit review action on conflict; record which version they reviewed; mark prior approval stale if a material value changes.

**Mint and signature dispatch** — re-run reconciliation server-side immediately before mint; hard-block unresolved material conflicts; do not permit an inviter-only "use mine anyway" override against a subject-confirmed or registry-verified value. Permit: the person-confirmed value; an alternate work-specific value explicitly acknowledged by that person; omission of an optional disputed identifier where the agreement permits; or stop and resolve. Persist final values, source versions, acknowledgment evidence and document hash as one mint snapshot, and render PDF, signer preview and audit evidence from that same snapshot.

**After mint** — at `esign_pending` require voiding first; at `executed` never edit or regenerate. Create a linked amendment or superseding sheet. An executed document is immutable; it is not inherently uncorrectable.

## 7. Propagate corrections according to lifecycle, not one blanket rule

- **Unapproved draft:** refresh unambiguous person-level fields automatically, record it, surface work-specific choices.
- **Pending approval / approved:** mark the proposed version stale, require re-acknowledgment. Counsel decides whether all parties must re-approve per class of change.
- **Countered:** carry the reconciliation task into the revised draft.
- **E-sign pending:** do not mutate; void and remint.
- **Executed:** correction flag and amendment workflow.

Do not auto-propagate publisher/administrator defaults across works; mailing address, phone, payout or tax data without purpose-specific consent; an unconfirmed `claim_prefill` value; or anything merely because the account email is verified.

## 8. Implement "This isn't me" as a bounded capability revocation

1. Explicit POST after a confirmation screen. **Never invalidate on GET** — email scanners and preview bots follow links.
2. Atomically transition only a still-pending invitation to a terminal state such as `wrong_recipient`.
3. Revoke or rotate the raw bearer token, retain a minimal hashed audit record.
4. Do not delete the collaborator row, unlink an established Member, or change profile/split-sheet data.
5. Return a generic, idempotent success response.
6. Notify the inviter only that the invitation was reported misdirected.
7. No unauthenticated free-text messages to the inviter. A structured reason is enough.
8. Rate-limit by token hash and network signal, deduplicate, log no raw rights values.
9. Let the inviter correct the address and reissue.

The invite status constraint permits only `pending`, `accepted`, `expired` (`018:107-119`), so this requires a human-reviewed migration. If a record was already linked to a Member, do not let an old public token undo it — provide an authenticated dispute/unlink workflow.

## 9. Establish retention and deletion before collecting more data

1. **Minimize at roster creation** — a stub needs a display name and a contact method. Defer IPI, MLC ID, SoundExchange ID, address, phone, payout and tax data until a disclosed workflow needs them.
2. **Record the purpose** — why it exists, who supplied it, when the person was notified, what retention class applies.
3. **Expire bearer capabilities** — on expiry remove or irreversibly hash the raw token.
4. **Separate mutable contact data from legal evidence.**
5. **Provide access, correction and deletion requests to nonmembers** via verified email control, not Member conversion.
6. **Treat archive as visibility, not deletion.** Claimed rows can currently only be archived (`app/api/collaborators/[id]/route.ts:57-108`).
7. **Preserve only necessary legal evidence.**
8. **Support legal holds explicitly.**
9. **Prohibit secondary use** — no People Search, marketing, enrichment, AI training or unrelated discovery.
10. **Require counsel and privacy approval for exact periods.** The repository does not establish a defensible universal duration.

State machine: `active_purpose`, `invite_pending`, `invite_expired_review_due`, `referenced_by_draft`, `preserved_as_executed_evidence`, `deletion_requested`, `legal_hold`, `redacted`, `deleted_with_minimal_tombstone`.

## 10. Reuse existing work selectively

**Reuse:** `docs/architecture/ACCOUNT-TYPES.md`; `lib/profile/claim-prefill.ts` (provenance shape only); `components/profile/RightsContractsSections.tsx`; `lib/split-sheets/lifecycle.ts`; `lib/split-sheets/live-identity.ts` as a pure starting point after adding confirmation/provenance/field semantics; `lib/collaborators/invite.ts`; `lib/invites/completeSignupClaim.ts` and migration 214's boundary; `074_split_sheet_identity_flags.sql` + `app/api/split-sheets/[id]/correction-flag/route.ts` for flag-never-mutate; `components/split-sheets/StagedFlagPanel.tsx`.

**Do not reuse unchanged:** `app/api/signup/invite/[token]/route.ts` (exposes full invited email pre-verification); `pickWinningSource()` (recency is not authority); `app/api/approve/[token]/route.ts`'s direct collaborator overwrite; `buildIdentityCorrectionFlagNotification()` (includes the raw suggested value — `lib/social/notifications.ts:381-405`); `split_sheet_identity_flags` for ordinary pre-sign disagreements.

**Suggested new boundaries:** `docs/architecture/RIGHTS-IDENTITY-AUTHORITY.md`; `lib/rights-identity/authority.ts`; `lib/rights-identity/reconcile.ts`; `lib/split-sheets/resolve-party-identities.server.ts`; `components/collaborators/CollaboratorClaimReview.tsx`; `app/api/collaborator-invites/[token]/review/route.ts`; `app/api/collaborator-invites/[token]/wrong-recipient/route.ts`; `app/api/rights-identity/disagreements/route.ts`; a next-sequential human-reviewed migration.

## 11. Build in this order

**Phase 1 — Contain the signing integrity gap.** One server-side party-identity loader used by the owner page, approval page and mint route. Exclude unconfirmed claim-prefill from authoritative resolution. Add a pre-mint conflict gate. Make PDF input and signer preview derive from one persisted mint snapshot.
*If skipped: the new claim screen may correct a profile while the PDF still mints stale party values.*

**Phase 2 — Introduce authority and provenance.** Model subject assertions, inviter observations, registry verification, document selection and execution snapshots separately. Remove newest-wins. Add field-level disagreement and sharing state. Validate PRO/IPI cardinality with rights operations before replacing scalar fields.

**Phase 3 — Build review for nonmembers and existing Members.** Email-verification flow for guests; authenticated review task for Members linked by migration 179; show every matching inviter row; separate review from signup.

**Phase 4 — Disagreement resolution and document propagation.** Summary-only notifications; field-level acceptance; stale-marking after material change; void/remint and executed-amendment lineage.

**Phase 5 — Retention and data-subject operations.** Expiry cleanup, purpose review, deletion/redaction, legal holds, nonmember requests. Synthetic fixtures only; never commit real personal data to this public repository.

## 12. Required tests

A bearer token reveals no unmasked email or rights information before verification · a wrong-recipient GET cannot mutate state · a wrong-recipient POST revokes only its pending invitation · existing Members get the same review opportunity · claiming one invitation surfaces all rows the email-based claim will link · conflicting inviter values never resolve by recency alone · unconfirmed `claim_prefill` cannot win split-sheet reconciliation · owner, approval recipient and mint route resolve the same identity version · a profile change after approval marks the document stale · mint fails if reconciliation changes between preflight and snapshot · e-sign-pending requires voiding before identity changes · executed documents remain byte-stable and corrections create linked amendments · a signature recipient may correct their proposed document identity without silently rewriting the inviter's roster · notifications contain no raw IPI, address, phone, payout, tax or bank information · retention cleanup preserves executed evidence and legal holds while removing expired capabilities · RLS permits the linked person to read records about themselves without granting ownership of the roster row.

## 13. Uncertainties requiring explicit decisions

- Which identity changes legally require every party to re-approve rather than only the affected party.
- Whether an optional disputed IPI should be omitted, marked pending, or block the document, per agreement type.
- Supported cardinality of PRO affiliations, IPI base/name numbers, writer vs publisher identities, territorial relationships.
- What evidence qualifies a rights identifier as registry-verified.
- Exact retention periods by jurisdiction and document class.
- Whether the amendment workflow must regenerate downstream registrations automatically.
- Whether Funūn is controller, processor, or both for each Member-entered collaborator dataset.

Until those are decided, describe values as observed, asserted, confirmed, or verified-by-source. Never collapse them into "verified identity."
