---
type: review-prompt
reviewer: codex
created: 2026-09-26
status: sent
subject: where the authoritative copy of a person's rights identity should live
source: Claude-authored prompt supplied by the owner
prior: .planning/reviews/CODEX-RESPONSE-260926-collaborator-claim-and-stale-copies.md
response: (pending)
---

# Codex — follow-up: name the place of truth, concretely

You reviewed our collaborator-claim design and told us not to ship it until we fix the signing
integrity gap. We verified your claims against source; all nine we checked were accurate,
including three that corrected our own premises. That work is recorded and the fix is scoped.

**One owner ruling has since been made:** the pre-mint identity gate **blocks**. Mint fails closed
on an unresolved conflict — no PDF, no envelope, no signer emails, no spend. The deciding argument
was not cost asymmetry but that the disputed identifier belongs to a party who is not present when
the initiator clicks send, so a warning is read by the one person who cannot know the answer.

Now we need the narrower question answered before we write the resolver.

## The question

A person's IPI can exist in four places at once, verified:

| Location | Copies |
|---|---|
| `user_profiles.ipi` — the person's own profile | one |
| `collaborators.ipi` — one row per Member who added them | many |
| `split_sheet_parties.ipi` — one row per sheet | many |
| track composer metadata (`Composer.ipi`, `lib/metadata/schema.ts:63-68`) | many |

Plus `user_profiles.claim_prefill` (`072_repoint_claim_functions.sql:50`) holding provenance for
prefilled values, and the minted PDF once signed.

**No column anywhere is marked authoritative.** The only precedence that exists is inside
`resolvePartyIdentity()` (`lib/split-sheets/live-identity.ts`), which is policy expressed as one
function and called by exactly one screen.

## The owner's proposed rule

> *"My instinct says it's in the user's own settings page, and if they don't have a settings page,
> we have to rely on what they fill out in the form before the minting process."*

Restated: **the authoritative copy is the one the described person controls.**

- If they are a Member → their Settings (`user_profiles`, edited via
  `components/profile/RightsContractsSections.tsx`).
- If they are not → whatever they entered on the approval form before signing
  (`components/split-sheets/SplitApprovalView.tsx` exposes `pro`, `ipi`, `administrator`;
  `app/api/approve/[token]/route.ts` writes it, action `update_identity`).
- Everything else — an inviter's `collaborators` row, a draft sheet's party row, track composer
  metadata — is a **cache** that defers to those, up until signature.
- After signature the executed document is the truth **for that document**, permanently, and must
  never silently re-resolve.

This already matches what `resolvePartyIdentity()` intends: pre-mint a claimed profile overwrites
the snapshot; with `claimedProfile === null` the snapshot (which the non-Member edited on the form)
stands. The defect is that only one of three surfaces obeys it.

## Tell us whether that rule is right, and specifically:

1. **Is "the copy the described person controls" the correct authority rule**, or does your
   field-class table from the prior doctrine mean some fields should not follow it? You argued
   publisher/administrator are work-specific rather than person-level. Does the owner's rule break
   for those, and if so, exactly which fields are exceptions?

2. **The gap we think the rule does not cover.** An invited collaborator with **no song** has
   neither surface: no Settings page (not a Member) and no split sheet (nothing attached — the
   invite carries `collaborator_id` only, no `work_id`, no `project_id`). Someone has written down
   their IPI and they have nowhere to contest it. Where does truth live for that person, before
   they are a Member and before any document exists? This is precisely the arrival we were about
   to build, so we need a concrete answer, not a principle.

3. **Two controlled copies that disagree.** A Member has an IPI in Settings, and separately typed a
   different one into the approval form for one particular song. Both are "the copy they control."
   Which wins for that sheet, and does correcting Settings later reach back into that draft?

4. **Enforcement, not convention.** We can write one resolver and route three callers through it,
   but nothing stops a fourth caller reading `split_sheet_parties.ipi` directly next quarter — that
   is exactly how this defect happened. What mechanism actually holds? Consider: a lint rule, a
   database view, revoking column access, naming the raw columns something that reads as wrong to
   use, or a type that cannot be constructed outside the resolver. Recommend one and say why the
   others are weaker here.

5. **Does the rule survive the non-Member becoming a Member?** They corrected their IPI on an
   approval form as a guest, then sign up later. Does the form value seed their profile, become an
   unconfirmed prefill, or neither — and what happens to sheets already drafted with the guest
   value?

## Constraints

- Next.js 15, TypeScript strict, Supabase with RLS, Tailwind. No shadcn/Radix/framer-motion.
- The fix already scoped is deliberately narrow: one resolver, three call sites, a persisted mint
  snapshot, a blocking pre-mint gate. **Do not expand it.** If your answer requires more, say so
  explicitly and say what should be deferred.
- The repository is public. Never propose committing real personal data.
- Prefer reusing what exists; name the file.

## Format

One fenced Markdown block, copy-paste ready. Lead with a direct answer to the owner's rule —
right, wrong, or right-with-exceptions — before any elaboration. Where you disagree, say so plainly
and say what to do instead. Mark uncertainty as uncertainty. If a claim we made about the code is
wrong, name it.
