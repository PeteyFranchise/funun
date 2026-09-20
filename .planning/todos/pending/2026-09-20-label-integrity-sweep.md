---
created: 2026-09-20T00:00:00Z
title: Sweep for names that assert more than the data carries
area: correctness
severity: medium
effort: half-day
skill: label-integrity-funun
files:
  - .claude/skills/label-integrity-funun/SKILL.md
---

## Why

Two instances found six days apart, both live in production, both looking correct:

- **`owner_segment`** (migration 227) — 6 of 8 UUID segments were not accounts.
- **`vault_documents.status = 'signed'`** — written unconditionally once a PDF upload
  succeeds; nothing opens the file.

Two is a pattern, not a coincidence. Neither was found by a test, a review checklist,
or CI. Both were found by someone asking what a name actually meant — the first by
accident while applying an unrelated migration, the second only because the first had
just happened.

**That is not a detection method.** This todo is the deliberate version.

## What to do

Run the procedure in the `label-integrity-funun` skill across the codebase. It is a
one-time sweep; the skill exists so the check can also be applied in passing whenever
a gate or status is touched.

Prioritise by blast radius rather than by count — a mislabelled value that only
renders in a UI is a wording bug, one that feeds admission, permission, billing,
alerting or eligibility is a correctness bug.

## Where to look first

Ranked by how much rests on them:

1. **Readiness and eligibility predicates** — `lib/vault/readiness.ts`,
   `lib/sync-library/readiness.ts`, `lib/eligibility/`, `lib/vault/stage3.ts`.
   `signedOf()` came from here and `evidencedOf()` sits beside it; the file has
   already proven it holds this shape.
2. **Status enums that gate something** — `vault_documents.status`, listing states,
   workspace and membership states. Any enum whose member names are claims.
3. **`is_*` / `has_*` / `can_*` in SQL and TypeScript.** `is_uuid` in migration 227 is
   a live example that survives: UUID-ness was being read as account-ness.
4. **UI labels that restate a field as a sentence.** "Split sheets signed" in
   `types/index.ts` is a claim the underlying field must support. Where a label makes
   a stronger statement than the field guarantees, the label is the finding.
5. **Alert and report column names** — anything a human reads as an answer without
   being able to check it.

## What NOT to do

**Do not widen readers to match weak writers.** The instinct on finding `signedOf()`
was to accept `verified` too; that would have admitted unexecuted split sheets to a
sync catalogue. Loosening a gate to accommodate a sloppy label spreads the defect.

Renaming is usually the cheapest correct fix and should be the default proposal.

## Done when

Every name-claim that feeds a gate has been traced to its write site, and each is
either confirmed accurate, renamed, or recorded as known-wrong with containment. A
finding that is deferred is fine; a finding nobody wrote down is not.

## Known open instances

- `owner_segment` / `is_uuid` in migration 227 — contained by
  `__tests__/storage-usage-rpc-caller-lock.test.ts`, real fix is migration 228.
- `vault_documents.status` — `signed` and `verified` both overclaim; the proposed fix
  is a separate `execution_assurance` axis. See
  `.planning/reviews/CODEX-RESPONSE-260920-signed-vs-verified.md`.
