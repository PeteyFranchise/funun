---
phase: 261004-wrr
plan: 01
subsystem: ui
tags: [tailwind, react, catalogue, design-tokens]

requires: []
provides:
  - GuidingLine's action button restyled to a tinted-border secondary, ending a gradient double-spend against ComposerCard's reserved primary-action gradient
  - WorkHeader title row restyled to the bench's inline indigo-pill treatment; chips moved to project-token bordered treatment
  - WorkRoster avatar/pending/chip treatment ported to the bench's in-list row vocabulary, with per-row affordances (promote, designation picker, badges) preserved
  - Provenance-row ("FROM AN IDEA") cut captured as a todo, pending a work->idea reverse lookup
affects: [writers-room-restyle-part2, catalogue-work-page]

tech-stack:
  added: []
  patterns:
    - "Token-only restyle discipline: bench CSS literals (incl. retired-lavender rgba(199,203,247,...)) translated to tailwind.config.ts token names, never pasted as literals; enforced per-file by negative-regex test assertions"
    - "Label-integrity test tightening: a test's assertion body is widened to match what its name claims, rather than trusting a passing test with a narrow check"

key-files:
  created:
    - .planning/todos/pending/2026-10-04-work-page-provenance-row.md
  modified:
    - components/catalogue/GuidingLine.tsx
    - components/catalogue/GuidingLine.test.tsx
    - components/catalogue/WorkHeader.tsx
    - components/catalogue/WorkHeader.test.tsx
    - components/catalogue/WorkRoster.tsx
    - components/catalogue/WorkRoster.test.tsx

key-decisions:
  - "GuidingLine's button changed from an opaque two-stop brand gradient to a tinted-border secondary (bench's .doit) -- this is a correctness fix, not just a restyle, since the component's own header comment and ComposerCard.tsx:118-122 both already forbade the gradient here."
  - "Kept the shipped 'Unreleased work' copy over the bench's 'Writer's Room' wording -- different claims, and changing it would be a copy decision outside this plan's visual-only scope."
  - "Did not convert WorkRoster's member list into the bench's .msrow toggle-selector -- that surface has no promote button, designation picker, or tier labels, and converting would delete per-row affordances (IA loss, not styling)."
  - "Provenance row ('FROM AN IDEA') cut, not built -- no work->idea reverse lookup exists yet (lib/ideas/schema.ts:44 only points idea->work); captured as a todo instead of faking the link."
  - "Before-state comparison against the shipped page is UNVERIFIED -- /vault/works/<id> is behind auth (confirmed via curl: 307 to /signin) and could not be reached from this execution context."

requirements-completed: [QUICK-261004-WRR]

coverage:
  - id: D1
    description: "GuidingLine action button no longer paints the full two-stop brand gradient; container wash and single-step contract unchanged"
    requirement: "QUICK-261004-WRR"
    verification:
      - kind: unit
        ref: "components/catalogue/GuidingLine.test.tsx — all 7 cases, incl. tightened gradient-budget assertion and the @ts-expect-error type-level case"
        status: pass
    human_judgment: false
  - id: D2
    description: "WorkHeader renders the bench's title row (21px bold title + inline uppercase indigo pill) and bench-token chips, with no raw amber class and no prop change"
    requirement: "QUICK-261004-WRR"
    verification:
      - kind: unit
        ref: "components/catalogue/WorkHeader.test.tsx — all 14 cases, incl. 4 new restyle-guard cases"
        status: pass
    human_judgment: false
  - id: D3
    description: "WorkRoster avatar/pending/chip treatment ported to bench vocabulary with every per-row affordance (promote, designation picker, badges) still rendering"
    requirement: "QUICK-261004-WRR"
    verification:
      - kind: unit
        ref: "components/catalogue/WorkRoster.test.tsx — all 21 cases, incl. non-vacuity promote-affordance guard"
        status: pass
    human_judgment: false
  - id: D4
    description: "Visual fidelity to the bench and side-by-side comparison against the shipped, authenticated Writer's Room page"
    verification: []
    human_judgment: true
    rationale: "Shipped /vault/works/<id> is behind auth and was not reachable from this execution context (confirmed 307 to /signin via curl) -- static-markup tests prove the token/class changes, but final visual sign-off against the live rendered page requires the owner, per this plan's autonomous: false gate."

duration: ~25min
completed: 2026-10-04
status: complete
---

# Phase 261004-wrr Plan 01: Writer's Room Restyle (Part 1) Summary

**Restyled GuidingLine, WorkHeader, and WorkRoster to the approved bench using only `tailwind.config.ts` token names — and fixed a live gradient-budget violation the restyle uncovered.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-10-04T04:17:39Z
- **Tasks:** 3/3 completed
- **Files modified:** 6 (+ 1 created)

## Accomplishments

- **GuidingLine** (Task 1): action button changed from an opaque `from-brandindigo to-brandfuchsia` gradient (double-spending the page's one gradient) to the bench's tinted-border secondary (`border-brandindigo/45 bg-brandindigo/[.12]`, hover `/[.22]`). Container wash/border and the single-step `GuidingLineStep | null` contract are untouched. Tightened the test named "never spends the full bg-grad gradient" — which only grepped the literal `bg-grad` class and had been green through the component's entire life while this bug shipped — to also reject the opaque pair via a negative-slash lookahead, and added wash-survives + no-retired-lavender-literal cases.
- **WorkHeader** (Task 2): the "Unreleased work" eyebrow moved from a dim stacked `<p>` to an inline uppercase indigo pill beside a 21px/bold/tight-tracked title input. `CHIP_CLASS` moved to a bordered/10px/bold hairline treatment; `CHIP_SPLITS_CLASS` moved off raw `amber-400`/`amber-300` onto this project's `money`/`money2` tokens. `splitsStatus` still renders a state word only, never a percentage. No prop changed; the reserved right-hand slot (37.2's destination lights) stays empty and `aria-hidden`.
- **WorkRoster** (Task 3): member avatar grew 28px→34px with the bench's `bg-lav/10` wash and 11px initials; a pending member's avatar now also dims (`opacity-55 grayscale`) alongside its existing pending chip; the pending chip and split-sheet chips moved to the same `money`/`money2` bordered treatment as the header; member rows gained the bench's hover tint. The accordion structure, the two-groupings separation (PITFALL 3), the add form, and every per-row affordance (✍/🎤 badges, promote button, designation picker) are unchanged — the bench's own roster surface (a toggle-selector with none of those affordances) was deliberately **not** adopted.
- Captured the bench's "FROM AN IDEA" provenance row as a todo (`.planning/todos/pending/2026-10-04-work-page-provenance-row.md`) rather than building it — it needs a work→idea reverse lookup that doesn't exist yet.
- Full CI Verification Gate green: `security:migrations:verify`, `typecheck:strict`, `lint --max-warnings=0`, `test --runInBand` (641 suites / 8011 tests), `audit:gate`. `npm run build` deliberately not run (dev server live on :3000; also not part of CI's `validate` job).
- Plan-level verification confirmed: `__tests__/palette-single-source.test.ts` passes (17/17); `git diff --stat main...HEAD` touches exactly the 6 `components/catalogue/` files + the 1 todo file; `LyricsPad.tsx`/`WorkPage.tsx` have zero diff against `main`; no `export type *Props = {` block changed.

## Task Commits

Each task was committed atomically:

1. **Task 1: GuidingLine gradient-budget restyle, label-integrity test fix, provenance todo** — `89f664e7` (fix)
2. **Task 2: WorkHeader title row, room-tag pill, chip treatment** — `c1064236` (feat)
3. **Task 3: WorkRoster avatar + chip treatment, full Verification Gate** — `78ae81c6` (feat)

Branch pushed: `writers-room-restyle-part1` (PR intentionally not opened — per orchestrator handoff).

## Files Created/Modified

- `components/catalogue/GuidingLine.tsx` - button restyled to tinted-border secondary
- `components/catalogue/GuidingLine.test.tsx` - tightened gradient-budget assertion + 2 new cases
- `components/catalogue/WorkHeader.tsx` - title row, CHIP_CLASS, CHIP_SPLITS_CLASS restyled
- `components/catalogue/WorkHeader.test.tsx` - 4 new restyle-guard cases
- `components/catalogue/WorkRoster.tsx` - avatar, pending state, pending/split chips, row hover restyled
- `components/catalogue/WorkRoster.test.tsx` - 4 new cases incl. non-vacuity promote-affordance guard
- `.planning/todos/pending/2026-10-04-work-page-provenance-row.md` - provenance-row cut, captured for later

## Decisions Made

- Kept shipped "Unreleased work" copy over the bench's "Writer's Room" wording (different claim; copy change is out of scope).
- Did not convert `WorkRoster`'s list into the bench's `.msrow` toggle-selector (would delete per-row affordances).
- Cut the provenance row rather than faking a work→idea link that doesn't exist server-side yet.
- Treated the GuidingLine gradient fix as in-scope correctness work (Rule 1), not an architectural deviation, since both the component's own comment and `ComposerCard.tsx:118-122` already stated the rule being violated.

## Deviations from Plan

None — plan executed exactly as written. The GuidingLine gradient fix and test tightening were explicitly called out as required work in the plan itself (not a deviation discovered mid-execution).

## Issues Encountered

- Initial `git commit -m "$(cat <<'EOF' ... EOF)"` heredoc-in-command-substitution failed to parse in the shell for Task 2's message (likely due to embedded `--` sequences inside parens); resolved by switching to `git commit -F -` with a plain heredoc. No functional impact — the commit content was identical in substance.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Visual sign-off is still owed to the owner** (plan is `autonomous: false`): serve the bench over HTTP at `http://127.0.0.1:4321/index.html` and compare against the shipped, authenticated Writer's Room at `http://localhost:3000/vault/works/<id>` per the plan's `human-check` verification step. This execution confirmed the shipped page is behind auth (307 → `/signin`) and could not make that comparison itself — before-state is UNVERIFIED, not claimed otherwise.
- **Part 2 is open and unstarted**: the bench's seven-peer-tab replacement of the interleaved canvas reverses owner-ratified Phase 37 decision 001 ("the diary is the canvas") and must be decided on its own merits before any tab/module work begins.
- The provenance-row todo (`.planning/todos/pending/2026-10-04-work-page-provenance-row.md`) is ready to be picked up whenever a work→idea reverse lookup is prioritized.

---
*Phase: 261004-wrr*
*Completed: 2026-10-04*

## Self-Check: PASSED

All 7 created/modified files confirmed present on disk; all 3 task commit hashes (`89f664e7`, `c1064236`, `78ae81c6`) confirmed present in git log.
