---
type: quick
slug: guard-227-and-private-docs
status: complete
created: 2026-09-19
migration: none
key-files:
  created:
    - __tests__/storage-usage-rpc-caller-lock.test.ts
  modified:
    - .claude/CLAUDE.md
    - .gitignore
  moved:
    - two financing .docx from the repo root into gitignored private/
---

# Three guards, each closing a way something already went wrong

## 1. The caller lock — making a known-wrong function loud

Migration 227's `storage_usage_over_threshold` returns a column named `owner_segment`, and
that name is false: it is the first path segment, which is an account id for
`{userId}/...` uploads but a **work** id for versions, clips and handoffs, a **room** id for
playbook media, and a **track** id for stream previews. Against production, 6 of 8 UUID
segments were not accounts.

PR #87 fixed the single caller. **It did not fix the function**, and production stays on 227
while migration 228 is deferred — so the column name keeps inviting the same mistake from
whoever calls it next.

The test asserts exactly one caller (the cron route) and that **no source reads
`owner_segment` or `is_uuid`**. Adding a second consumer fails the suite and hands the
reader the reason.

### The trap inside the trap

The only mentions of those columns in `app/` and `lib/` are inside a comment explaining that
they are deliberately unread. A naive scan would have failed on the comment describing the
rule — **the same hazard that has bitten this repo three times in a week**, where a comment
satisfied a source-counting assertion.

So the scan runs on comment-stripped source, **and the stripper is itself tested**: five
assertions prove it removes line, trailing and block comments while keeping real code and
not eating `https://`. Without that, every assertion in the file could pass vacuously
against source that still contained the identifiers.

### Proven to bite

A throwaway `lib/observability/__mutation-probe.ts` calling the RPC and reading
`owner_segment` failed both assertions by name, listing the offending file. Removed; 5/5.

## 2. The verification lesson, in CLAUDE.md

The Verification Gate section already carried one hard-won rule (six waves green on
build+test while lint caught a real defect). This is the second and a different shape.

227 was verified by calling it: it executed, returned rows, refused `anon` with a positive
control. Every statement true; the output still wrong. **Running it proved the mechanism and
nothing proved the meaning** — the column name was taken at face value.

The rule recorded: when a result is named, verify the name against an independent source.
Cross-referencing those segments against `auth.users` and `works` was one query and would
have caught it the same afternoon.

## 3. Financing documents out of reach

Two investor redlines sat untracked in the repo root. **Untracked is not safe** — it is one
`git add -A` from permanent, and deleting a file later does not remove it from history.

Moved to `private/`, and both `private/` and `*.docx` added to `.gitignore`. No `.docx` is
tracked anywhere in this repo, so the blanket pattern costs nothing and makes the accident
**structurally impossible** rather than merely unlikely. The documents were moved, not
opened.

## Verification

Every step of CI `validate`: `security:migrations:verify` PASS · `typecheck:strict` clean ·
`lint --max-warnings=0` clean · **625 suites / 7,612 tests** · both `npm audit` levels clean.

## What this does not do

Migration 227 is unchanged and still misattributes to any direct caller. The fix is
migration 228, deferred against the triggers in
`.planning/reviews/CODEX-RESPONSE-260919-what-is-worth-doing.md`.
