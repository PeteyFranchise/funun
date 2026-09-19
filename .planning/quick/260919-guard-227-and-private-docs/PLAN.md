---
type: quick
slug: guard-227-and-private-docs
created: 2026-09-19
branch: guard-227-and-private-docs
migration: none
---

# Three small guards, each closing a way something already went wrong

## 1. Lock the number of callers of `storage_usage_over_threshold`

PR #87 stopped the cron treating path segments as owners, but **the SQL function still
returns a column named `owner_segment` and still groups by first path segment.** Production
is on 227 and will stay there while migration 228 is deferred. The next caller inherits the
trap, and the column name actively invites it.

Fixing the function needs a migration. Making the trap *loud* does not.

Assert in a test:
- `storage_usage_over_threshold` has exactly **one** caller across `app/` and `lib/` — the
  cron route.
- **No source file reads `owner_segment` or `is_uuid`** from its result. This is the real
  failure mode: using the column as though the name were true.
- The test carries a comment saying why, and names migration 228 as the actual fix.

If someone adds a second consumer, the test fails and they read the reason.

## 2. Record the verification lesson in `.claude/CLAUDE.md`

The Verification Gate section already holds one hard-won lesson: six Phase 39 waves passed
on build+test while lint caught a real defect. This is the second, and it is a different
shape.

Migration 227 was verified by calling it: it ran, returned rows, and refused `anon` with a
positive control. All true. **All of it proved the mechanism and none of it proved the
meaning** — six of eight rows labelled `owner_segment` did not contain an owner, and that
was never checked because the column name was taken at face value.

Add a short paragraph. The point to land: *running it proves the mechanism; it does not
prove the answer.* When output is labelled, verify the label against an independent source
— here, cross-referencing the segments against `auth.users` and `works` took one query and
would have caught it immediately.

## 3. Get the financing documents out of the repo's reach

Two investor documents sit untracked in the repo root:

```
Contingent_Capital_Commitment_Memorandum_REDLINE_WORKING.docx
Investor_Funding_Advance_Agreement_REDLINE_WORKING.docx
```

Untracked is not safe — it is one `git add -A` from permanent, and deleting a file later
does not remove it from history.

- Create `private/` and move both files there.
- Add **`private/`** and **`*.docx`** to `.gitignore`. No `.docx` is tracked anywhere in the
  repo, so the blanket pattern costs nothing and makes the accident structurally impossible
  rather than merely unlikely.
- **Do not open or read the documents.** Move them.

## Out of scope

No migration. No change to migration 227's SQL. Not attribution repair.

## Verification gate

Every step CI `validate` runs, per `.claude/CLAUDE.md`.
