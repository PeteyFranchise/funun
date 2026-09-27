---
type: review-verification
created: 2026-09-26
verifier: claude
subject: Codex answer on where the authoritative copy of a person's rights identity lives
prompt: .planning/reviews/CODEX-PROMPT-260926-place-of-truth-for-rights-identity.md
verdict: >
  Five more claims checked, all accurate — fourteen across both reviews, none wrong.
  Two findings change the scoped fix. One finding changes the arrival work entirely:
  a working claim page already exists and nothing links to it.
---

# Verification — the place of truth

## The owner's rule, and Codex's answer

Owner: *"the user's own settings page, and if they don't have a settings page, rely on what they
fill out in the form before the minting process."*

Codex: **right with exceptions.** Authority is "the copy the described person controls", but it is
not one column. `publishing_designee` and `administrator` are **work-specific** and must not be
overwritten by profile defaults; the rest are person-scoped. After mint, the persisted snapshot is
truth for that document only.

We accept this. The owner's instinct was correct in principle and the exception is real: a
publisher for one song is not a fact about a person.

## Claims checked

| # | Claim | Verified at | Result |
|---|---|---|---|
| 10 | A `/join/[inviteToken]` claim page **already exists** and is view-only | `app/join/[inviteToken]/page.tsx:12-15` — *"View-only collaborator profile page… No edit controls — self-edit is deferred (D-09)."* 7.3KB, reads `collaborator_invites` joined to `collaborators` | **UPHELD** |
| 11 | The invite email points at `/signup?invite=`, **not** `/join` | `lib/collaborators/invite.ts:37-41` vs `:44-46` — two separate builders. `invite.test.ts:118-124` asserts the email contains the signup URL and `not.toContain('/join/tok123')` | **UPHELD** |
| 12 | The track route is another writer into `split_sheet_parties` | `app/api/vault/[projectId]/tracks/[trackId]/route.ts:189-202` — matches parties by `normalizeName()` and updates `pro`, `ipi` | **UPHELD** |
| 13 | This repo already uses CI architectural boundary tests | `__tests__/member-api-boundary.test.ts`, `__tests__/placements-client-server-boundary.test.ts` — both `readFileSync` a protected route and assert on its source | **UPHELD** |
| 14 | CI runs Jest on every PR and every push to main | `.github/workflows/quality.yml:3-6`, `:30` | **UPHELD** |

Running total across both Codex reviews: **14 factual claims checked, 14 accurate**, including four
that corrected our own premises. That is a materially better record than the marketing-editor
review, whose facts were all recycled from our prompt.

## Finding that changes the arrival work

**A working claim page exists and is orphaned.** `buildCollaboratorJoinUrl()` has **zero production
callers** — `grep` across the repo returns only its own test. The `/join/[inviteToken]` page renders
what an inviter recorded so the person can verify it, which is exactly the screen we spent this
session designing from scratch.

Consequences:

1. **Do not build the claim screen new.** Reuse `/join/[inviteToken]` as the shell. What our bench
   mock (`private/bench/collaborator.html`) contributes is still real and still wanted — the two
   invite densities, the legal-name ask on a quick invite, the "This isn't me" exit — but the page
   and its token lookup already exist.
2. **The email deliberately routes around it**, enforced by a test. Changing that is a product
   decision with a test to update, not an oversight to quietly fix.
3. Our earlier statement that "nothing here is built" was **wrong**. Corrected.

## Findings that change the scoped fix

### The resolver is itself wrong for two of its five fields

We scoped the fix as "route three surfaces through the existing resolver." That is not sufficient.
`resolvePartyIdentity()` treats all five of `pro, ipi, publishing_designee, administrator,
legal_name` identically, overwriting each with any non-blank profile value pre-mint
(`lib/split-sheets/live-identity.ts:47-92`). Per the accepted authority rule, that **erases a
legitimate work-specific publisher or administrator choice**. Routing more callers through it would
propagate the error, not contain it.

### There are four writers, not three readers

`split_sheet_parties` identity is written by: the creation route, the guest approval route, the
track/composer sync path, and the builder save. A boundary test must therefore permit designated
**mutation** routes while forbidding independent **reads** for display or minting. Codex stated this
distinction; it is correct and we had not accounted for it.

Note also that the track path matches parties by `normalizeName()` — a fragile join we are not
fixing here, but which should be recorded as a hazard.

### The gate needs a provenance marker to work at all

Codex argues the blocking gate cannot function without a minimal persisted marker distinguishing
"the recipient asserted this" from "the inviter copied it from their roster", because approval is
**not** identity confirmation — the correction UI is optional, collapsed and separate from
approve/counter/sign (`components/split-sheets/SplitApprovalView.tsx:229-260`). And
`first_viewed_at` is only a page-visit stamp (`app/approve/[token]/page.tsx:87-99`), so it cannot
stand in.

We accept this as **in scope**. It is not the deferred authority model; it is the minimum the gate
the owner already ruled on logically requires.

## Enforcement — accepted

Codex recommends a CI architectural boundary test over a database view, column revocation, renamed
columns, or a branded type. Verified that the pattern already exists here and runs on every PR. We
accept it, with a branded `ResolvedPartyIdentity` type at the PDF sink as defence in depth rather
than as the primary control.

This matters because **convention is what already failed**: the resolver existed and two of three
surfaces simply did not call it.

## Not verified

Everything prospective: the per-sheet assertion shape, the proposed `collaborator_identity_assertions`
table, the field-class table as policy, and whether Funūn should support multiple profile-level
PRO/IPI identities. Codex marks these as design conclusions rather than existing code, which matches
our own reading.

## One correction to Codex

§2 says the invitation email "sends the recipient directly to `/signup?invite=...`, not `/join`" and
cites `lib/collaborators/invite.ts:36-45`. The destination claim is right, but the cited range spans
both builders — `buildCollaboratorInviteUrl` is `:37-41`, `buildCollaboratorJoinUrl` is `:44-46`. A
reader following that citation could conclude the opposite. Minor, but this is exactly the kind of
near-miss that makes an unverified citation dangerous.
