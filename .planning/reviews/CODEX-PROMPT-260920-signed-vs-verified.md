---
type: review-prompt
reviewer: codex
created: 2026-09-20
status: complete
subject: is an AI-verified document as good as a signed one for Crate admission
source:
  - lib/vault/readiness.ts (signedOf vs evidencedOf)
  - .planning/ROADMAP.md item (g) under Phase 40 — flagged as a CONFIRMED defect
---

# Codex review — signed vs verified for Crate admission

## Why this was asked

The roadmap flags `signedOf()` as a confirmed defect: it counts only
`status === 'signed'`, so a split sheet uploaded through `/api/contracts/verify`
— which writes `'verified'` after AI verification — reads `'warning'` and blocks
Crate entry. The framing on the roadmap and in my own first reading was **"the
stronger path produces the worse outcome."**

That framing assumed `verified` dominates `signed`. **The prompt deliberately
put that assumption up for refutation**, because the day before, a differently
named thing (`owner_segment` in migration 227) turned out not to contain what
its name said, and the lesson recorded in `.claude/CLAUDE.md` was that running
something proves the mechanism, not the meaning.

The specific alternative the prompt named: the two statuses may be **orthogonal
rather than ordinal** — `signed` asserting execution, `verified` asserting
content correctness — in which case widening `signedOf()` would admit unsigned
but well-formed documents to a sync catalogue, which is worse than the bug.

## The prompt — copy from here

````text
# FIRST: write your answer to a file

Write your entire response to
`.planning/reviews/CODEX-RESPONSE-260920-signed-vs-verified.md` in this repo.
Create the file. **Do not print its contents back** — reply with only the path
and the section headings.

---

# Is an AI-verified document as good as a signed one for Crate admission?

Funūn's sync catalogue ("The Crate") gates admission on rights readiness.
`lib/vault/readiness.ts:116` `signedOf()` counts a document item complete only
when every matching document has `status === 'signed'`. A `'verified'` document
reads `'warning'` and blocks admission.

`evidencedOf()` at `:154` accepts `signed || verified`, but is used for the
copyright item only. Three other modules — `lib/vault/stage3.ts`
`docStatusToReq()`, `lib/contracts/locker-attention.ts`, and
`lib/eligibility/direct-overlay.ts` — already treat `signed || verified` as one
state. `signedOf()` is the outlier, and the comment at `:148` says so and says
it was left deliberately because widening it moves gates.

## What I established by reading code — VERIFY THIS, do not inherit it

`vault_documents.status` is `CHECK (status IN ('pending','signed','verified'))`
(`supabase/migrations/001_initial_schema.sql:175`).

- `'signed'` is written by
  `app/api/vault/[projectId]/documents/[docId]/upload/route.ts:65` — **uploading
  a PDF transitions the document to 'signed'.** I saw no verification of the
  file's contents on that path.
- `'verified'` is written by `app/api/contracts/verify/route.ts:124`, and only
  when AI verification returns `verified`; anything else is written `'pending'`.

If that is right, `signedOf()` treats "a file was uploaded" as complete and "a
file was uploaded AND machine-read" as a warning — the stronger path producing
the worse outcome.

**I may be wrong, and I was wrong about a differently-named thing yesterday.**
Check the upload path for validation I missed, and check what
`result.status === 'verified'` actually requires.

## The possibility that would flip the answer

These two statuses may not be ordinal at all. They may be **orthogonal**:

- `'signed'` may assert **execution** — "this is the executed copy, with
  signatures."
- `'verified'` may assert **content correctness** — "this is a well-formed split
  sheet with the expected fields" — while saying nothing about whether anyone
  signed it.

If that is the case, widening `signedOf()` would admit **unsigned but
well-formed** documents into a sync catalogue, which is worse than the bug it
fixes. Determine which of these is true by reading what the AI verification
actually asserts, not by reasoning from the status names.

## Answer these

1. **Ordinal or orthogonal?** Does `'verified'` strictly dominate `'signed'`, or
   do they assert different things? Cite what the verification prompt/logic
   actually checks.
2. **Given your answer, what is the correct fix?** Widen `signedOf()`, narrow
   the other three modules, introduce a third concept, or leave it alone.
3. **What actually gets into the Crate that does not today**, if `signedOf()`
   widens? Be concrete about the admission consequence — this is a rights
   catalogue and the cost of admitting an unauthorised song is not symmetric
   with the cost of blocking an authorised one.
4. **Is `'signed'` trustworthy at all?** If uploading a PDF sets it with no
   checks, a user can mark any file signed. Does that make `signedOf()` a weaker
   gate than it appears — independent of this question?
5. **Blast radius.** Which other call sites consume `signedOf()`, and what moves
   if it changes? The comment at `:148` says widening "moves gates this change
   was not asked to move" — name them.

## Constraints

- Migrations are human-gated. Propose SQL; never claim anything is applied.
- Production is at migration 227.
- `main` is protected.
- This repository is PUBLIC.
- Answer the rights question on its merits. Do not optimise for the smallest
  diff — a one-line change that admits unlicensable songs to a sync catalogue
  is the expensive kind of cheap.

## Structure

- BOTTOM LINE — ordinal or orthogonal, and the fix, in 5 sentences
- CORRECTIONS — where my reading above is wrong, with evidence
- WHAT EACH STATUS ACTUALLY MEANS — cited, not inferred from names
- CONSEQUENCE — what enters the Crate under each option
- RECOMMENDATION — with the code change, and what tests would prove it
- CONFIDENCE — verified by reading code vs inferred

Cite `file:line` throughout. Where you are guessing, say so.

Write the file. Reply with the path and headings only.
````

## Copy to here

## Response — received 2026-09-20, complete

`.planning/reviews/CODEX-RESPONSE-260920-signed-vs-verified.md`.

**Verdict: orthogonal, not ordinal. Do not widen `signedOf()`.**

### Dispositions — verified in-code before acceptance

| Claim | Disposition | Evidence |
|---|---|---|
| `verified` can be returned with `signatures_present: pending` | **ACCEPTED — decisive, verified independently** | `lib/contracts/verify.ts:57-62` returns `verified` when all four checks are assessed, none is `fail`, and **at least one** is `pass`. The prompt at `:131` tells the model to use `pending` "when the document doesn't contain enough to tell". So a document whose signature block the AI could not read still comes back `verified` |
| The three modules do NOT establish a uniform policy | **ACCEPTED — refutes my premise** | `direct-overlay.ts` requires exactly `signed` for a split sheet and allows `signed \|\| verified` only for sample clearance; `locker-attention.ts` is bucketing the Contract Locker, not deciding Crate eligibility |
| Only two readiness items move | **ACCEPTED** | `signedOf()` serves `split_sheet` and `hire_right`; copyright uses `evidencedOf()`, and sample clearance is not one of the six Crate-entry items |
| The upload path does *some* validation | **ACCEPTED as a correction to my wording** | It authenticates, scopes, applies upload admission, and caps at 5 MB with a client-declared MIME. It performs **no execution validation** — no magic bytes, no signature block parsing. "No validation at all" was too broad; "no validation that it is executed" is exact |

### The finding that outgrew the question

The question was "is `verified` good enough?" The answer is that **neither status
is what the gate claims.**

`'signed'` is written unconditionally after a PDF upload succeeds. Nothing
inspects the file for signatures. So the Crate's `split_sheets` and `hire_right`
items — labelled "Split sheets signed" and "Producer agreements signed" in
`types/index.ts` — currently mean **"the artist uploaded a file and asserted it
is signed."**

That is uploader attestation, not proof of authorisation. The gate reads
stronger than it is, in the same shape as `owner_segment`: a name asserting
something the data does not carry.

### Recommended direction, not yet decided

A separate `execution_assurance` axis —
`none | uploader_attested | ai_observed | provider_completed | staff_confirmed` —
with Crate admission requiring `provider_completed` or `staff_confirmed`.
DocuSeal's completion webhook is named as the authoritative producer, since it
already holds provider completion state and the executed artifact.

**Also flagged: a TypeScript-only widening would diverge from the database.**
`vault_readiness_score` in migration 070 still computes exact-`signed` for these
two document types, so UI counts and Crate gates could pass while the stored
score stayed lower.

### Open for the owner

Whether to build the execution-assurance axis, and what interim posture to hold.
Codex's interim advice is to **leave `signedOf()` unchanged** — the conservative
gate is currently the only thing preventing AI-reviewed-but-unexecuted documents
from satisfying two of the Crate's three rights requirements.
