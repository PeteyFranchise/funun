---
quick_id: 260910-buyer-rights-two-states
completed: 2026-09-10
status: complete
---

# Buyer-facing rights states: three to two — COMPLETE

Written by the orchestrator: the executing agent was blocked from writing report
files by the harness, so this records its findings.

## What changed

| File | Change |
|---|---|
| `app/help/page.tsx` | `BADGES` drops the Partial-rights definition; `req` rewritten for the sample case. Dead `.rb.part` CSS removed. |
| `components/buyer/CatalogBrowserLight.tsx` | `'Partial'` removed from `FILTER_OPTIONS.Rights`. `RIGHTS_LABEL` / `RIGHTS_FILTER_LABEL` keep all three keys so the maps stay exhaustive. |
| `lib/deals/catalog-sample.ts` | **Found by the sweep, outside the plan's file list.** Two `SAMPLE_CATALOG_ROWS` carried `rights: 'part'`. That fixture renders on the PUBLIC `/sync` and `/sync/catalog` pages when no live rows exist, so a real visitor would have seen a Partial chip with no definition and no matching filter. |
| `__tests__/buyer-rights-two-states.test.ts` | New, 19 tests. |
| `.planning/deliberations/sync-catalogue-entry-and-samples.md` | Two premise corrections (below). |

## The engine was NOT changed — deliberately

`rightsBadge()` in `lib/sync-library/gate.ts` is byte-identical across all five
commits. `catalogRightsFromStage3()` and `CatalogRightsCode` untouched. **Staff
Crate review needs `partial`** to show a part-way submission; only the buyer
surfaces stop advertising it. The gate makes `partial` unreachable for buyers
rather than wrong.

The drift guard is **behavioural, not textual** — it calls `rightsBadge()` with
three `Stage3Result` shapes and asserts three distinct returns, so collapsing the
branch fails however it is rewritten.

## Mutation testing — 9 mutations, all caught

Including the two that matter most: collapsing `'partial'` into `'contact'` (the
exact "reduce to two states" move), and the copy regaining a timeline promise.

## Two premise corrections to the deliberation

1. **"Nothing computes the tri-state" was WRONG.** `rightsBadge()` has computed
   it since Phase 30-01. The owner's decisions were partly made on that wrong
   premise but survive it — the entry gate makes `partial` unreachable rather
   than incorrect.
2. **Unlocking is not listing.** Three steps, not two: the artist unlocks
   eligibility by completing sync requirements → submits → a Funūn team member
   admits to The Crate. A Funūn invite gives the artist a reason to finish the
   gate quickly, because a named opportunity is waiting rather than an abstract
   checklist.

## Verification

`tsc` clean · 561 suites / 6910 tests green · `npm run build` exit 0, 151 static
pages. The agent additionally served the real production build and checked the
rendered HTML: `/help` emits only `rb ok` and `rb req` with zero "Partial
rights"; `/sync/catalog` has zero "Partial".

## Open — two copy questions raised for the owner

1. **The label is doing two jobs.** "Contact required" is generic while its
   description is specifically about samples. If sample-block is the only
   reachable `req` condition for a buyer — which the gate implies — the label
   should probably say so. Changing it touches `RIGHTS_LABEL`,
   `RIGHTS_FILTER_LABEL` and `FILTER_OPTIONS.Rights` in lockstep, so it is a
   decision, not a cleanup.
2. **The copy may over-commit.** It states an original cut to the same brief as
   the other way a request "lands". The clear/facilitate/partner question is
   explicitly OPEN, and the original-commission side reads more confidently than
   the clearance side. If that capability is not reliably there yet, this is the
   sentence to soften.

Two alternate wordings are recorded in the agent's report; the test asserts
behaviour (sample + clearance + forward path, no time words), not an exact
sentence, so the copy can be swapped freely.
