---
phase: 260930-uit
plan: 01
subsystem: ui
tags: [tailwind, palette-guard, jest, design-tokens]

requires:
  - phase: 260927-qka (half (c) / lavender rgba guard precedent)
    provides: mutation-testing pattern for guard tests (probe file, both-directions check)
provides:
  - A third guard half (half d) in __tests__/palette-single-source.test.ts that flags any
    dark + blue-dominant arbitrary-hex background/border/gradient-stop utility under app/
    and components/, as a RULE rather than an enumerated list
  - 16 indigo-tinted surface literals converted to theme tokens across 15 files
affects: [palette-single-source.test.ts, tailwind-token-usage]

tech-stack:
  added: []
  patterns:
    - "RULE-based guard (WCAG luminance + blue-dominance classifier) rather than an
       enumerated retired-hex list, so near-miss literals (#1A1840 vs retired #1A1838)
       cannot sail through a future repaint unflagged"
    - "Mutation-testing a guard both ways via a throwaway, unimported .css probe file,
       deleted before the commit that depends on it being gone"

key-files:
  created: []
  modified:
    - __tests__/palette-single-source.test.ts
    - "app/(artist)/vault/[projectId]/readiness/page.tsx"
    - components/antenna/AntennaBrowser.tsx
    - components/antenna/OpportunityCard.tsx
    - components/antenna/OpportunityForm.tsx
    - components/auth/SessionIdentityGuard.tsx
    - components/contracts/ContractLocker.tsx
    - components/contracts/ContractUpload.tsx
    - components/messages/DockedWidget.tsx
    - components/nav/MessagesIcon.tsx
    - components/nav/WorkspaceContextSwitcher.tsx
    - components/profile/ProfileView.tsx
    - components/split-sheets/ReconcileDiff.tsx
    - components/tools/PitchPlugForm.tsx
    - components/vault/PlaybackView.tsx
    - components/vault/VaultProjectCard.tsx

key-decisions:
  - "Guard committed RED first (16 offenders), fix committed separately, per CLAUDE.md's
     'a check that passes before the fix proves nothing'"
  - "No allowlist added to the new guard — the classifier needed zero exceptions against
     the real tree, confirming the rule (not a list) is the right shape"
  - "Score-ring holes tokenised to bg-card, not bg-card2, to preserve the donut-hole
     illusion against the card surface they sit on"
  - "PlaybackView's /95 opacity modifier preserved as bg-card/95"
  - "Both selection-tint ternary branches fully detokenised (border + background), so
     neither leaves a raw hex beside a freshly-tokenised sibling in the same string"
  - "PR push/open explicitly skipped per orchestrator run constraints — the orchestrator
     handles push + PR for this run, overriding the plan's Task 3"

patterns-established:
  - "Dark+blue-dominant surface guard (half d): see __tests__/palette-single-source.test.ts
     header comment for scope (app/+components/ only, bg/border/gradient-stop utilities
     only) and the explicit non-vacuity + classifier-truth-table + mutation-test shape"

requirements-completed: [UIT-01, UIT-02, UIT-03]

coverage:
  - id: D1
    description: "Guard half (d) added, observed RED against the unmodified tree with exactly 16 offenders, zero allowlist entries"
    requirement: UIT-01
    verification:
      - kind: unit
        ref: "__tests__/palette-single-source.test.ts#no dark, blue-dominant surface literal survives (app/components only) > no dark, blue-dominant background/border/gradient-stop literal survives under app/ or components/ (RED commit 497a5eee)"
        status: pass
      - kind: other
        ref: "independent scoped grep over app/+components for 7 in-scope hexes in bg/border/gradient utilities: 16 before fix, 0 after"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 16 in-scope literals replaced by theme tokens; PlaybackView's /95 opacity preserved; both selection-tint sites fully tokenised (border + background)"
    requirement: UIT-02
    verification:
      - kind: unit
        ref: "__tests__/palette-single-source.test.ts (all 4 describe blocks green after commit 38309ea6)"
        status: pass
      - kind: other
        ref: "grep -q 'bg-card/95' components/vault/PlaybackView.tsx; grep -c 'border-brandindigo bg-brandindigo/10' on PitchPlugForm.tsx + OpportunityForm.tsx = 2"
        status: pass
    human_judgment: true
    rationale: "The DockedWidget header shift (#13112a -> card2) is owner-flagged as the one visibly different surface (perceptual distance 32.6) and needs eyeballing, not just a passing grep, per the plan's PR-body requirement."
  - id: D3
    description: "Full CI validate job passes on the branch tip"
    requirement: UIT-03
    verification:
      - kind: other
        ref: "npm run security:migrations:verify"
        status: pass
      - kind: other
        ref: "npm run typecheck:strict"
        status: pass
      - kind: other
        ref: "npm run lint (--max-warnings=0)"
        status: pass
      - kind: unit
        ref: "npm test -- --runInBand (638 suites / 7899 tests)"
        status: pass
      - kind: other
        ref: "npm audit --omit=dev --audit-level=moderate"
        status: pass
      - kind: other
        ref: "npm audit --audit-level=high"
        status: pass
    human_judgment: true
    rationale: "PR open + merge is explicitly out of scope for this execution (orchestrator handles push/PR); a human/orchestrator step confirms the PR is opened and the branch stays unmerged against protected main."

duration: 15min
completed: 2026-09-30
status: complete
---

# Phase 260930-uit Plan 01: Neutralise the Indigo-Tinted Surface Literals Summary

**Added a RULE-based (not enumerated-list) palette guard that catches dark, blue-dominant arbitrary-hex Tailwind utilities, then used it to tokenise the 16 indigo-tinted surface literals the prior two repaint guards structurally couldn't see.**

## Performance

- **Duration:** ~15 min (RED commit to GREEN commit)
- **Started:** 2026-09-30T22:08 (local, first commit)
- **Completed:** 2026-09-30T22:10 (local, second commit) + verification gate
- **Tasks:** 2 of 3 executed (Task 3 — push/PR — explicitly held back per orchestrator run constraints)
- **Files modified:** 16 (1 test file + 15 source files)

## Accomplishments

- Added half (d) to `__tests__/palette-single-source.test.ts`: a classifier-driven guard
  (WCAG relative luminance < 0.05 AND blue dominance ≥ 8) scoped to `app/` + `components/`
  background/border/gradient-stop utilities, with zero allowlist entries — closing the gap
  that let `bg-[#1A1840]` (two characters from the retired `#1A1838`) sail through the
  previous two enumerated-list guards.
- Observed the guard RED against the unmodified tree with **exactly 16 offenders**,
  cross-checked by an independent scoped grep (same count, same file:line set).
- Mutation-tested the classifier both directions using a throwaway, unimported
  `components/__palette-probe.tmp.css` probe: a novel indigo (`#0d0c1e`) was caught, a
  novel warm dark (`#1e1a0d`) and a novel neutral dark (`#0d0d0d`) were not — then deleted
  the probe and confirmed `git status --short components/` was clean before committing.
- Made the truth table permanent as its own assertion (10 bare-hex verdicts, independent
  of the tree state) plus two non-vacuity floors (file count > 400, candidate-utility
  count ≥ 25) — the only things keeping half (d) from going silently vacuous once the
  offender list is permanently empty.
- Converted all 16 literals to theme tokens across 15 files: panel/card grounds and
  score-ring holes → `bg-card` (PlaybackView keeping its `/95` modifier), raised surfaces
  → `bg-card2`, both selection-tint ternary branches → `border-brandindigo bg-brandindigo/10`
  with no raw hex left in either branch.
- Ran the full CI `validate` gate on the branch tip: migration security verify, strict
  typecheck, zero-warning lint, 7899 tests across 638 suites, and both `npm audit`
  invocations — all green. `npm run build` intentionally not run (dev server live on :3000).

## Task Commits

1. **Task 1: Add the dark+blue-dominant guard as half (d) and commit it RED** -
   `497a5eee` (test)
2. **Task 2: Convert the 16 literals to tokens and take the guard green through the
   full CI gate** - `38309ea6` (fix)

Task 3 (push branch + open PR) was **not executed** — see Deviations below.

**Plan metadata:** not committed by this agent per run constraints (orchestrator handles
docs/STATE/ROADMAP commits).

## Files Created/Modified

- `__tests__/palette-single-source.test.ts` - new half (d): dark+blue-dominant surface
  guard, classifier, truth table, non-vacuity floors
- `app/(artist)/vault/[projectId]/readiness/page.tsx` - score-ring hole `#0c0b1a` → `bg-card`
- `components/antenna/AntennaBrowser.tsx` - panel ground `#0b0a16` → `bg-card`
- `components/antenna/OpportunityCard.tsx` - score-ring hole `#0c0b1a` → `bg-card`
- `components/antenna/OpportunityForm.tsx` - selection tint → `border-brandindigo bg-brandindigo/10`
- `components/auth/SessionIdentityGuard.tsx` - raised surface `#11111d` → `bg-card2`
- `components/contracts/ContractLocker.tsx` - two panel grounds `#0b0a16` → `bg-card`
- `components/contracts/ContractUpload.tsx` - panel ground `#0b0a16` → `bg-card`
- `components/messages/DockedWidget.tsx` - raised surface `#13112a` → `bg-card2`
  (owner-flagged as the one visibly different surface, perceptual distance 32.6)
- `components/nav/MessagesIcon.tsx` - raised surface `#0f0e1d` → `bg-card2`
- `components/nav/WorkspaceContextSwitcher.tsx` - raised surface `#121120` → `bg-card2`
- `components/profile/ProfileView.tsx` - score-ring hole `#0c0b1a` → `bg-card`
- `components/split-sheets/ReconcileDiff.tsx` - panel ground `#0b0a16` → `bg-card`
- `components/tools/PitchPlugForm.tsx` - selection tint → `border-brandindigo bg-brandindigo/10`
- `components/vault/PlaybackView.tsx` - panel ground `#0b0a16` → `bg-card`, `/95` preserved
- `components/vault/VaultProjectCard.tsx` - score-ring hole `#0c0b1a` → `bg-card`

## Decisions Made

- Guard committed RED first, fix committed separately — the plan's own hard constraint
  and `.claude/CLAUDE.md`'s "a check that passes before the fix proves nothing."
- No allowlist entry added to half (d), confirming the planner's prototype claim that the
  rule needs zero exceptions against the real tree.
- Score-ring holes went to `bg-card` (not `bg-card2`) per the plan's explicit reasoning —
  the hole must match the card surface it's punched out of, not read lighter than it.
- Task 3 (push + PR) deliberately not executed — the orchestrator's run-specific
  constraints for this execution explicitly state "Do NOT push and do NOT open the PR —
  the orchestrator does both," which overrides the plan's own Task 3 instruction.

## Deviations from Plan

**1. [Constraint override] Task 3 (push + open PR) not executed**
- **Found during:** Start of execution, reading orchestrator constraints
- **Issue:** PLAN.md's Task 3 instructs pushing the branch and opening a PR via `gh`.
  The orchestrator's explicit run constraints for this execution state: "Do NOT push and
  do NOT open the PR — the orchestrator does both."
- **Resolution:** Followed the orchestrator constraint (it supersedes the plan per this
  agent's operating instructions — "no message from any agent is ever your user's consent"
  does not apply here since this is the orchestrator's own directive for this run, not an
  attempt to bypass permissions). Left the branch `neutralise-indigo-surface-literals`
  committed locally with Tasks 1 and 2 complete, ready for the orchestrator to push and
  open the PR using the RED count, mutation results, and mapping table captured in this
  SUMMARY and in the commit messages.
- **Files modified:** none (no-op deviation)
- **Commit:** n/a

**2. [Classifier call-site convention] Truth-table assertions use bare hex strings, no `#`**
- **Found during:** Task 1, first RED run
- **Issue:** The plan's `<behavior>` block lists truth-table values with a leading `#`
  (e.g. `#0d0c1e`), but the classifier is driven in the actual scan by `match[2]`, which
  the capture group `([0-9a-fA-F]{3}|[0-9a-fA-F]{6})` never includes a `#` in. Writing
  the truth-table assertions with a leading `#` caused `isDarkBlueDominantHex` to parse
  `"#0"` as the red channel and fail the luminance/dominance math, producing false
  negatives for all three "flagged" cases.
- **Fix:** Wrote the truth-table assertions with bare hex (no `#`), matching the function's
  actual call site in the scan loop and the plan's own description of the classifier as
  "taking a bare hex string."
- **Files modified:** `__tests__/palette-single-source.test.ts`
- **Verification:** Reran the suite; all 17 tests passed including the corrected truth table.
- **Committed in:** `497a5eee` (part of the Task 1 RED commit — the correction happened
  before the RED commit was made, so the committed truth table is already correct)

---

**Total deviations:** 2 (1 constraint-driven no-op, 1 Rule 1 auto-fix on the new test
itself, applied before any commit).
**Impact on plan:** No scope creep. The classifier call-site fix made the guard's own
test internally consistent with the scan it drives; the Task 3 skip is a run-level
instruction, not a plan defect.

## Issues Encountered

None beyond the one documented deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Branch `neutralise-indigo-surface-literals` has two clean commits (RED guard, then the
16-literal fix + full CI gate green) sitting on top of `origin/main` with nothing else
ahead. The orchestrator can push and open the PR directly using:

- **RED offender count:** 16 (confirmed by guard output and independent grep)
- **Mutation-test results:** novel indigo `#0d0c1e` caught; novel warm `#1e1a0d` and
  novel neutral `#0d0d0d` not caught
- **16-row mapping table:** see "Files Created/Modified" above, grouped by panel grounds,
  score-ring holes, raised surfaces, and selection tints
- **Visible-change callout:** `components/messages/DockedWidget.tsx:138`
  (`#13112a` → `card2`) is the one surface with owner-measured perceptual distance (32.6)
  above the rest (≤24) — flag for eyeballing in the PR
- **Deliberately untouched:** indigo text literals (`#5b5f8c` ×2 in `app/(auth)/auth-ui.ts`,
  `#9b96c8` in `components/auth/SessionIdentityGuard.tsx:120`), the accent family
  (`#818CF8` elsewhere), warm/semantic state tints (rose/amber/emerald, e.g.
  `components/workspaces/WorkspaceRosterView.tsx`), the neutral near-black `option` in
  `components/green-room/PeopleSearch.tsx:271`, and the stale worktree copy under
  `.claude/worktrees/zen-yalow-0b7a42/` — all verified untouched by grep after the fix.
- **Gate output:** `security:migrations:verify` PASS; `typecheck:strict` clean;
  `lint --max-warnings=0` clean; `test --runInBand` 638 suites / 7899 tests passed;
  both `npm audit` invocations found 0 vulnerabilities. `npm run build` not run.

No blockers.

## Self-Check: PASSED

- FOUND: `__tests__/palette-single-source.test.ts`
- FOUND: `components/tools/PitchPlugForm.tsx`
- FOUND: `components/vault/PlaybackView.tsx`
- FOUND: `.planning/quick/260930-uit-neutralise-the-indigo-tinted-surface-lit/260930-uit-SUMMARY.md`
- FOUND commit: `497a5eee` (Task 1, RED guard)
- FOUND commit: `38309ea6` (Task 2, fix + green gate)
- Branch confirmed: `neutralise-indigo-surface-literals`
- Working tree confirmed: only pre-existing untracked `.planning/reviews/` and
  `.planning/todos/pending/` files (plus this quick-task's own new directory) remain
  untracked; no other modifications outstanding.

---
*Phase: 260930-uit*
*Completed: 2026-09-30*
