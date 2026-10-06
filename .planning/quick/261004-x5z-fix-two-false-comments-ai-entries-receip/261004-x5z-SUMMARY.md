---
phase: quick/261004-x5z-fix-two-false-comments-ai-entries-receip
plan: 261004-x5z
subsystem: catalogue, sync-library
tags: [label-integrity, comments, documentation, jest, rights, crate]
status: complete

requires: []
provides:
  - "lib/catalogue/ai-entries.ts — composeReceipt()'s docblock now states that ONLY receipt.citation is persisted and that splitsEffect/releaseEffect/crateConsequence are transient, with the consequence spelled out: a prior Crate verdict must be recomputed (under today's rules) or an explicit decision persisted"
  - "lib/sync-library/gate.ts — header, GateSignal.rightsClear and rightsBadge() now name isSyncRightsClear() as the admit gate's rights authority, and carry the reason the route diverges (sample clearance is deliberately outside admission)"
  - "lib/deals/catalog.ts — catalogRightsFromStage3()'s header no longer claims shared authority with the admit gate"
  - "components/catalogue/AiEntryFlow.tsx — the filed-receipt render comment no longer says the whole receipt was stored"
  - "__tests__/ai-entry-receipt-persistence.test.ts — behavioural pin (3 tests) on what the route actually inserts; both halves mutation-verified"
affects: [phase-50-crate-admit, catalogue, sync-library]

tech-stack:
  added: []
  patterns:
    - "When a comment's claim is falsified by a later change, correct the claim AND carry the reason the code diverges — a bare correction leaves the next maintainer free to 'unify' the two signals again"
    - "Annotate a superseded phase SUMMARY in place with a dated SUPERSEDED note rather than rewriting it: the record of what was decided stays, the misdirection stops"
    - "Mutation-check a new regression test before trusting it — introduce the defect it claims to catch and confirm the suite goes red"

key-files:
  created:
    - __tests__/ai-entry-receipt-persistence.test.ts
  modified:
    - lib/catalogue/ai-entries.ts
    - lib/sync-library/gate.ts
    - lib/deals/catalog.ts
    - components/catalogue/AiEntryFlow.tsx
    - .planning/phases/30-the-crate-sync-library-catalogue-engine-sync-readiness/30-01-SUMMARY.md
---

## What shipped

Two confirmed `label-integrity-funun` instances (a description asserting more
than the code does), found by an adversarial verification pass on 2026-10-04,
plus two further live repeats found by sweep during this task.

**Defect 1 — the AI-entry receipt.** `composeReceipt()`'s docblock said the
route "stores the resulting strings on the `ai_entries` row". It stores one of
four: the insert names `citation: receipt.citation` and nothing else
(`app/api/works/[workId]/ai-entries/route.ts:185-204`), the full receipt is
returned at `:214-219`, and migration 135 (`:273-290`) gives the table no
eligibility, verdict, consequence or splits column. Corrected to say what
persists, what is transient, and the consequence: a prior Crate verdict can
only be **recomputed** via `resolveCrateConsequence()` — under today's rules,
which may differ from what the artist was shown — or an explicit decision must
be persisted. Phase 50 depends on knowing which.

**Defect 2 — the sync admit gate's rights authority.** `lib/sync-library/gate.ts`
said in three places that `rightsClear` comes from `computeStage3().canContinue`
and that `rightsBadge()` shares that signal. The admit route derives
`rightsClear` from `isSyncRightsClear(syncItems)` and does not call
`computeStage3()` at all (`:265-283`, with its own explicit comment at
`:280-282`). Corrected to name the real authority **and keep the reason
attached**: `canContinue` blocks on an uncleared sample, which is right for the
artist's release pipeline and wrong for the catalogue, where the owner decided
on 2026-09-09 that a sampled track IS listed and labelled "Contains a sample".
Following the stale comment back to `canContinue` would have re-blocked those
tracks — the exact defect fixed on 2026-09-10.

## Repeats found by sweep

- `lib/deals/catalog.ts:430` — "the SAME rights authority the sync-library gate
  uses". Corrected; the T-30-11 point (not a second hardcoded definition) kept.
- `components/catalogue/AiEntryFlow.tsx:367` — "the receipt is what was ACTUALLY
  stored". Corrected.
- `30-01-SUMMARY.md` (two places) asserted "can never disagree" / "can never
  drift" as standing invariants. Annotated SUPERSEDED with date and reason
  rather than rewritten.
- Checked and **accurate, left alone**: `app/help/page.tsx:27` and
  `components/buyer/CatalogBrowserLight.tsx:110` (they only say `rightsBadge()`
  still returns three states, which is true).
- Historical `30-01-PLAN.md` / `30-04-PLAN.md` left as-is: they record what was
  specified at the time, and the route header + deliberations doc already carry
  the correction.

## Tests

`__tests__/ai-entry-receipt-persistence.test.ts` (3 tests) mocks the Supabase
client and captures the real object the route hands to `.insert()`. It asserts
`citation` is present, the other three receipt lines reach no column under any
spelling, all four still reach the caller in the response, and migration 135's
`ai_entries` has no column a verdict could land in. **Both halves were
mutation-checked** — adding `crateConsequence` to the insert turns 2 tests red;
adding a `crate_eligible` column to 135 turns the schema test red.

**No test written for defect 2, deliberately.** `evaluateInclusionGate()`
receives a plain boolean and cannot observe its provenance, so "rightsClear is
not derived from canContinue" has no behavioural surface at that level. The
route-level alternative — mocking `computeStage3` to assert it is never called
— pins an import graph rather than a rights rule, and would pass just as
happily if `rightsClear` were hardcoded `true`. The real invariant is already
pinned: `app/api/sync-library/admin/[listingId]/route.test.ts:515-530` asserts
a sampled track IS admittable.

## Verification

Full Verification Gate per CLAUDE.md, all six green:
`security:migrations:verify` PASS · `typecheck:strict` clean · `lint`
(--max-warnings=0) clean · `npm test -- --runInBand` 8140/8140 in 651 suites ·
`npm audit --omit=dev --audit-level=moderate` 0 vulnerabilities · `audit:gate`
clean (1 active deferral, earliest expiry 2026-11-02). `npm run build` NOT run
(dev server on :3000).

Comment-only discipline was verified mechanically: every added and removed line
under `lib/` and `components/` is a comment line (`git diff -U0` filtered for
non-comment changes returns empty).
