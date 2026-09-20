---
name: label-integrity-funun
description: Find names that assert more than the data carries — a column, status, flag or predicate whose name claims something nothing actually checks. Two confirmed production instances in Funūn (owner_segment, document status 'signed'). Auto-load when auditing a gate, a readiness/eligibility predicate, a status enum, an alert, or when verifying the OUTPUT of a migration or RPC rather than whether it runs.
---

<context>
## The defect shape

**A name asserts something the data does not carry, the value looks correct, and a
decision is made on it.**

Not a typo and not a naming nitpick. The value is populated, the code runs, tests
pass, and the output reads as an answer. The failure is that the name promises a
guarantee nobody enforces — so every downstream reader inherits a claim that was
never true.

Two confirmed instances in this repo, found six days apart in September 2026. Both
were live in production. Both looked right.

### Instance 1 — `owner_segment` (migration 227)

`storage_usage_over_threshold` returns a column named `owner_segment`. It is the
first path segment of a Storage object — an account id for `{userId}/...` uploads,
but a **work** id for versions/clips/handoffs, a **room** id for playbook media, a
**track** id for stream previews.

Cross-referenced against production: **6 of 8 UUID segments were not accounts.**

The migration was verified by calling it. It executed, returned rows, refused `anon`
by name with a positive control. Every statement about that verification was true and
the output was still wrong, because nothing asked whether a column named
`owner_segment` contained owners.

**Consequence beyond the label:** the detector fragmented one user's bytes across many
work ids, so no group crossed the threshold. It missed precisely the user it existed
to catch.

### Instance 2 — `vault_documents.status = 'signed'`

Written unconditionally once a PDF upload succeeds
(`app/api/vault/[projectId]/documents/[docId]/upload/route.ts`). Nothing opens the
file, finds a signature block, or validates one.

The Crate's readiness items built on it are labelled **"Split sheets signed"** and
**"Producer agreements signed"** (`types/index.ts`). What they actually mean is *an
artist uploaded a file and asserted it is signed* — uploader attestation, not proof of
authorisation, gating entry to a sync catalogue.

The sibling status is the mirror image: `'verified'` is returned when the AI assessed
all four checks, none failed, and **at least one** passed
(`lib/contracts/verify.ts:57-62`) — so `signatures_present: pending`, meaning *the
model could not tell whether it was signed*, still yields `verified`.
</context>

## How to find one

### 1. Collect the name-claims

Any identifier that asserts a fact rather than describing a shape. Search for:

```bash
grep -rnE "\b(owner|owned|verified|signed|confirmed|validated|approved|authorized|cleared|is_[a-z]+|has_[a-z]+)_?[a-z]*\b" \
  supabase/migrations/*.sql lib/ app/ types/ --include=*.ts --include=*.tsx | grep -v node_modules
```

Column names, status enum members, boolean fields, and predicates named `isX()` /
`hasX()` / `canX()` are the population. So are UI labels that restate a field as a
sentence — "Split sheets signed" is a claim the field must actually support.

### 2. Trace to the write site, not the read site

**This is the step that finds the bug.** For each name, answer: *who sets this value,
and on what evidence?*

Ask specifically whether the value is:

- **Derived** — computed from data the system can see. Usually safe; the name can be
  checked against the computation.
- **Asserted** — set by a caller, a user action, or a model's verdict, with no
  independent check. **Danger.** An asserted value wearing an authoritative name is
  the whole defect.

`'signed'` is asserted. `owner_segment` is derived — from the wrong thing.

### 3. Compare the evidence to the claim

Write both sentences out and read them next to each other:

- *What the name says:* "this document is signed"
- *What the write site guarantees:* "a PDF was uploaded without error"

If those differ, you have one. Size the gap before deciding it matters.

### 4. Check whether a gate consumes it

Severity is set here. A mislabelled value that only renders in a UI is a wording bug.
One that feeds **admission, permission, billing, alerting, or eligibility** is a
correctness bug with a blast radius. Trace every consumer.

### 5. Verify against an independent source

Do not verify by running the thing. Running proves the mechanism, not the meaning.

Cross-reference the output against something that knows the truth separately —
`auth.users` and `works` settled `owner_segment` in one query. If no independent
source exists, that absence is itself the finding: nothing can confirm the claim.

## What to do with one

**Do not widen the reader to match the sloppy writer.** That was the instinct for
`signedOf()` and it would have let unexecuted split sheets into a rights catalogue.
Loosening a gate to accommodate a weak label spreads the defect instead of fixing it.

Prefer, in order:

1. **Rename to what it is.** `owner_segment` → `path_segment`. Free, and stops the
   next reader inheriting the claim.
2. **Add the axis the name implied.** If the system genuinely needs "is this
   executed?", model that separately rather than overloading a status word.
3. **Contain it** where a fix needs a migration or a decision. A test that locks the
   number of callers and fails when a second appears buys time without pretending the
   problem is solved — see `__tests__/storage-usage-rpc-caller-lock.test.ts`.
4. **Record it as known-wrong** wherever a reader would otherwise trust it —
   `.planning/STATE.md` carries "migration 227 is applied AND KNOWN DEFECTIVE" for
   exactly this reason.

## The question that caught both

> **Does the label match the contents?**

Ask it of any value a decision rests on, especially one that looks correct.
