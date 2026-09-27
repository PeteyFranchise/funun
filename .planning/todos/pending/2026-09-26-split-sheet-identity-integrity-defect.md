# DEFECT: the split sheet you sign can carry an identity the app told you was corrected

**Captured:** 2026-09-26 · **Status:** confirmed defect in shipped code, not yet fixed
**Severity:** high — the artifact affected is a signed document that moves money
**Found by:** Codex, in review of the collaborator-claim design. Verified against source:
`.planning/reviews/CODEX-VERIFICATION-260926-collaborator-claim-and-stale-copies.md`

**This blocks the invited-collaborator claim screen.** A screen whose purpose is letting someone
correct their rights data is worse than nothing while the correction reaches the owner's display
and not the PDF — it creates a documented expectation the system does not honour.

## The defect

`resolvePartyIdentity()` (`lib/split-sheets/live-identity.ts`) gives a claimed party's live profile
overwrite semantics until mint. It has exactly **one** production caller.

| Surface | Reads | Shows |
|---|---|---|
| Owner's sheet page | `resolvePartyIdentity` — `app/(artist)/split-sheets/[id]/page.tsx:236` | the corrected value |
| Approver's page | `split_sheet_parties.*` direct — `app/approve/[token]/page.tsx:24-27` | the stored value |
| Minted PDF | `pro: p.pro, ipi: p.ipi` — `app/api/split-sheets/[id]/mint-envelope/route.ts:255-256` | the stored value |

`partiesActuallyChanged()` excludes identity fields by contract (`lib/split-sheets/lifecycle.ts:57-73`),
so a builder save does not persist the refresh the owner is looking at.

**Result:** the initiator sees one identifier, the co-writer approves another, and the signed
document carries the stored one. Nothing surfaces the disagreement.

## Second, separable defect in the same area

`app/api/approve/[token]/route.ts:104-106` writes a signature recipient's identity correction back
to the inviter's `collaborators` row with the **service client** (bypassing RLS, from an
unauthenticated token holder) and **discards the error**. Its field list includes
`publishing_designee`, which exists on `split_sheet_parties` (`063:37-40`) but was **never added to
`collaborators`** — `legal_name` came from `066:55-56`, `administrator` from `063:86-87`, and
`publishing_designee` from neither. One `UPDATE` → `42703 undefined_column` → the whole statement
fails, taking `pro`, `ipi`, `legal_name` and `administrator` with it. The documented "reuse on
future sheets" behaviour silently does nothing.

## Scope of the fix

Deliberately narrow. This is containment of a shipped defect, **not** the authority/provenance
model — that is separate roadmap work (see "Deferred" below).

1. **One server-side resolver.** Extract a single loader (Codex suggests
   `lib/split-sheets/resolve-party-identities.server.ts`) that takes a sheet id and returns fully
   resolved parties. It must be the only way any surface obtains party identity.
2. **Three call sites onto it** — the owner page, the approval page, and the mint route. After this,
   a `grep` for direct `split_sheet_parties` identity-column reads outside the resolver should
   return nothing.
3. **Persist at mint, render from what was persisted.** The PDF, the signer preview and the audit
   evidence must all derive from one stored mint snapshot, not from three separate reads.
4. **A pre-mint conflict gate.** If resolution at mint differs from what the approver last saw,
   stop. Do not mint silently. (What the gate *offers* — block vs acknowledge — depends on the
   Decision 2a ruling, still open. Build the gate; make its policy a single, changeable predicate.)
5. **Fix the write-back.** Either drop `publishing_designee` from the collaborators payload and
   check the error, or remove the cross-row write entirely pending the authority ruling.
   **Do not leave a swallowed error in a rights path.**

### Explicitly deferred to roadmap work, not this fix

Codex's Phases 2–5: the authority/provenance model, the guest email-verification flow, the existing-
Member review task, disagreement resolution and propagation, and retention. Those need owner
rulings and probably counsel. Do not let them expand this fix.

## Verification this fix needs

The usual gate will not catch a regression here — the defect is three surfaces silently disagreeing,
which typechecks cleanly and passes every existing test. Require:

- a test that the owner page, approval page and mint route resolve the **same** identity version for
  the same sheet and party;
- a test that mint refuses when resolution changed since the approver's last view;
- a test that a `publishing_designee` in the correction payload does not silently discard the other
  four fields;
- a negative `grep` assertion that no surface outside the resolver reads party identity columns.

## Open rulings this fix does not decide

- **Decision 2a** — block vs warn-and-acknowledge at the signature boundary. Codex argues
  warn-with-override is indefensible at mint against a subject-confirmed value; we had picked warn.
  Build the gate so the answer is one predicate.
- **Decision 1** — Codex rejects the owner's 2026-09-26 ruling and wants a masked email with no PRO
  before email control is proven. Relevant to the claim screen, not to this fix.
