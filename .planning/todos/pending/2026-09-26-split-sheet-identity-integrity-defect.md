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

1. **One server-side resolver — and fix its policy, do not just reuse it.**
   `lib/split-sheets/resolve-party-identities.server.ts`, taking a sheet id and returning fully
   resolved parties. It must be the only way any surface obtains party identity.
   **`resolvePartyIdentity()` is itself wrong for two of its five fields** and must not simply be
   wrapped: it overwrites all of `pro, ipi, publishing_designee, administrator, legal_name` with
   any non-blank profile value (`lib/split-sheets/live-identity.ts:47-92`). Per the accepted
   authority rule, `publishing_designee` and `administrator` are **work-specific** — a publisher
   for one song is not a fact about a person — and a profile default must not erase a
   work-specific choice. Routing more callers through the current policy would spread the bug.
2. **Every read onto it — and note there are four WRITERS, not three readers.**
   Readers to convert: the owner page, the approval page, the mint route. Writers that legitimately
   mutate these columns and must stay permitted: the creation route, the guest approval route
   (`app/api/approve/[token]/route.ts`), the builder save, and the track/composer sync
   (`app/api/vault/[projectId]/tracks/[trackId]/route.ts:189-202`, which matches parties by
   `normalizeName()` — a fragile join, recorded as a hazard, not fixed here).
   The rule is: **designated routes may write; nothing outside the resolver may read for display
   or minting.**
3. **Persist at mint, render from what was persisted.** The PDF, the signer preview and the audit
   evidence must all derive from one stored mint snapshot, not from three separate reads.
4. **A pre-mint conflict gate that BLOCKS.** *(Owner ruling 2026-09-26 — see below.)* If
   resolution immediately before mint differs from the identity the approver actually approved,
   the request **fails closed**: no PDF rendered, no DocuSeal envelope created, no signer emails,
   no spend, nothing frozen. Return a structured conflict the initiator can act on, offering:
   the party's confirmed value; an alternate value that party has explicitly acknowledged for this
   work; omission of a disputed optional identifier where the agreement permits; or stop and
   resolve. It is a gate, not a wall — the resolution belongs on the same screen as the refusal.
   Keep the policy itself one predicate so a future ruling can change it without touching the gate.
5. **A minimal provenance marker on the party row.** The gate cannot work without one. Approval is
   **not** identity confirmation — the correction UI is optional, collapsed and separate from
   approve/counter/sign (`components/split-sheets/SplitApprovalView.tsx:229-260`) — and
   `first_viewed_at` is only a page-visit stamp (`app/approve/[token]/page.tsx:87-99`), so it
   cannot stand in. Persist enough to distinguish *"the recipient asserted this"* from *"the
   inviter copied it from their roster"*. This is not the deferred authority model; it is the
   minimum the blocking gate logically requires.

6. **Fix the write-back.** Either drop `publishing_designee` from the collaborators payload and
   check the error, or remove the cross-row write entirely pending the authority ruling.
   **Do not leave a swallowed error in a rights path.**

### Explicitly deferred to roadmap work, not this fix

Codex's Phases 2–5: the authority/provenance model, the guest email-verification flow, the existing-
Member review task, disagreement resolution and propagation, and retention. Those need owner
rulings and probably counsel. Do not let them expand this fix.

## Enforcement — a CI boundary test, not a convention

Convention is precisely what failed here: the resolver already existed and two of three surfaces
did not call it. Add `__tests__/split-sheet-identity-boundary.test.ts` following the pattern this
repo already uses (`__tests__/member-api-boundary.test.ts`,
`__tests__/placements-client-server-boundary.test.ts` both `readFileSync` a protected route and
assert on its source). CI runs Jest on every PR and every push to main
(`.github/workflows/quality.yml:3-6`, `:30`), so this is an enforceable rule rather than a comment.

It should fail unless the resolver is the only module reading those columns for display or mint,
and unless the three surfaces import it. A branded `ResolvedPartyIdentity` type at the PDF sink is
worth adding as defence in depth, but not as the primary control — TypeScript is structurally
typed and an assertion bypasses it.

## Verification this fix needs

The usual gate will not catch a regression here — the defect is three surfaces silently disagreeing,
which typechecks cleanly and passes every existing test. Require:

- a test that the owner page, approval page and mint route resolve the **same** identity version for
  the same sheet and party;
- a test that mint refuses when resolution changed since the approver's last view;
- a test that a `publishing_designee` in the correction payload does not silently discard the other
  four fields;
- a negative `grep` assertion that no surface outside the resolver reads party identity columns.

## Rulings

### Decision 2a — BLOCK at mint. Owner ruling, 2026-09-26. SETTLED.

We had leaned toward warn-and-override; Codex argued that is indefensible at the signature
boundary, and the owner ruled to block.

**The reasoning, recorded so it is not relitigated.** Mint is the irreversible step — its own
header comment says it is *"the ONLY path that spends money in Phase 17 — each completed document
bills $0.20 and each signer gets a real email."* Before mint a wrong identifier is a field you
edit. After mint it is a voided envelope with the spend already committed and every signer asked
to sign again; and once any party signs, the document's own operative text governs — *"may not be
modified or amended except by writing and signed by all Co-writers named above."*

The decisive point is not the cost asymmetry, it is **who the disputed value belongs to.** The
person clicking send is the initiator; the identifier in dispute is the other party's, and that
party is not present at the moment of the click. A warning only protects anyone if its reader
knows the right answer — here, by construction, they do not. That is why the conflict exists.

A block costs roughly ten seconds, on the rare send where something genuinely disagrees.

### Decision 1 — still open

Codex rejects the owner's 2026-09-26 ruling (show name, email and PRO pre-authentication) and
wants a masked email, no PRO, and no field-presence disclosure until email control is proven.
Relevant to the claim screen, not to this fix. Not yet ruled.
