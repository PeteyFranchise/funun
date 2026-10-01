---
phase: quick/261001-hna
plan: 01
subsystem: ui
tags: [marketing, static-pipeline, accessibility, copy]

requires: []
provides:
  - Named-tab hero carousel control (The Writer's Room / Sound Vault / The Crate) replacing anonymous 26x3px bars, keyed on aria-selected
  - Writer's Room and Sound Vault hero ledes that name Funūn and classify the product, matching the Crate lede's shape
  - Third anchored owner-comment strip (HERO_TABS_DECISION_COMMENT_START/END) in the marketing sanitizer pipeline
affects: [marketing-page, root-route]

tech-stack:
  added: []
  patterns: ["Anchored removeBetween owner-comment strip (third instance — same shape as DIFFERENTIATORS_OWNER_COMMENT and STEP_BADGE_DECISION_COMMENT_*)"]

key-files:
  created: []
  modified:
    - scripts/marketing-assets.ts
    - scripts/build-marketing-artifact.ts
    - assets/marketing/landing.html
    - assets/marketing/manifest.json
    - private/bench/baseline/FROZEN.sha256 (gitignored, local baseline only)

key-decisions:
  - "Named-tab pill tablist and aria-selected correction shipped exactly as the owner approved on the bench; no new treatments invented."
  - "Third owner-comment strip added as one more anchored removeBetween entry rather than a generic CSS-comment stripper, preserving load-bearing comments the artifact must keep."

requirements-completed: [HNA-01, HNA-02]

coverage:
  - id: D1
    description: "Hero carousel control regenerated as a named pill tablist (The Writer's Room / Sound Vault / The Crate), state tracked via aria-selected, with the two out-of-scope aria-current usages (nav-link rule, scrollspy) untouched"
    requirement: "HNA-01"
    verification:
      - kind: unit
        ref: "scripts/marketing-artifact.test.ts#the real generated artifact — verifyArtifact(...) == []"
        status: pass
      - kind: other
        ref: "npx tsx scripts/verify-marketing-artifact.ts (exit 0, 'verify ok')"
        status: pass
    human_judgment: false
  - id: D2
    description: "Writer's Room and Sound Vault hero ledes rewritten to name Funūn and classify the product, matching the Crate lede's shape; Grammy / 'first built for' claims preserved verbatim"
    requirement: "HNA-02"
    verification:
      - kind: other
        ref: "grep -cF 'Fun&#363;n…writing room' / 'The Sound Vault is where everything a release needs lives on Fun&#363;n:' against assets/marketing/landing.html — both 1, both old ledes 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Live rendering of the shipped artifact at the public root route, as distinct from the byte-level assertions above"
    verification: []
    human_judgment: true
    rationale: "Localhost '/' redirects to /signin under NEXT_PUBLIC_VAULT_DEMO=true (middleware.ts:178-180), so the live render can only be confirmed on the PR's Vercel preview (if demo mode is off there) or on www.funun.studio after merge — genuinely owner-only verification, already noted as expected in the plan's checkpoint."

duration: 55min
completed: 2026-09-30
status: complete
---

# Quick Task 261001-hna: Hero Named Tabs and Funūn Copy Summary

**Marketing hero carousel re-freeze: 26×3px anonymous bars became a named `aria-selected` pill tablist (The Writer's Room / Sound Vault / The Crate), and the Writer's Room + Sound Vault ledes now name Funūn — all via a third anchored sanitizer strip, no bench edits, no verifier weakening.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-09-30T22:30:00Z (approx, from first file read)
- **Completed:** 2026-09-30T23:25:00Z
- **Tasks:** 3 completed
- **Files modified:** 4 tracked (`scripts/marketing-assets.ts`, `scripts/build-marketing-artifact.ts`, `assets/marketing/landing.html`, `assets/marketing/manifest.json`) + 1 gitignored local baseline (`private/bench/baseline/FROZEN.sha256`)

## Accomplishments

- Advanced the frozen bench pin (`FROZEN_SHA256`/`FROZEN_LINE_COUNT`) from `eecfb67d…a58b294`/2151 to `366e6e93…b810fc78`/2167, matching the bench revision the owner already hand-edited and browser-verified.
- Added the third one-off anchored owner-comment strip (`HERO_TABS_DECISION_COMMENT_START`/`_END`), stripping the 7-line `/* Named tabs, not anonymous bars. OWNER DECISION 2026-09-30 … */` block from `sanitize()` without touching any neighbouring comment or generalizing into a CSS-comment stripper.
- Regenerated `assets/marketing/landing.html` (1890 lines, up from 1881) and `assets/marketing/manifest.json` (`sourceSha256` advanced only) from the pinned bench source with zero hand edits.
- Ran the full CI `validate` job locally (6/6 green) plus the two artifact-specific test suites.

## Task Commits

1. **Task 1: Advance the freeze and add the third anchored comment strip** - `5f51435b` (feat)
2. **Task 2: Regenerate the manifest and artifact, and prove the OUTPUT carries both changes** - `a656b784` (feat)
3. **Task 3: Full verification gate, scoped commit, PR** - gate-only task, no additional source commit (see below)

**Plan metadata:** (this SUMMARY + plan directory, committed by the orchestrator per plan convention)

## Files Created/Modified

- `scripts/marketing-assets.ts` - `FROZEN_SHA256`/`FROZEN_LINE_COUNT` advanced to the named-tabs bench revision
- `scripts/build-marketing-artifact.ts` - Added `HERO_TABS_DECISION_COMMENT_START`/`_END` anchors + one `removeBetween` call in `sanitize()` (third sibling strip)
- `assets/marketing/landing.html` - Regenerated: pill tablist CSS/markup/JS, `data-nav` on all three `<section class="slide">` elements, two new ledes, old bar CSS and `.slidenote` span removed
- `assets/marketing/manifest.json` - `sourceSha256` advanced; asset/font/nonce counts unchanged (50/7/1)
- `private/bench/baseline/FROZEN.sha256` (gitignored) - Local baseline regenerated via `shasum -a 256` from inside `private/bench/`, not staged

## Decisions Made

- Matched the existing anchored-strip convention exactly (no generic CSS-comment stripper), per the plan's hard constraint; recorded here as the planner requested: this is the **third** one-off strip of this shape (`DIFFERENTIATORS_OWNER_COMMENT`, `STEP_BADGE_DECISION_COMMENT_*`, now `HERO_TABS_DECISION_COMMENT_*`) and a general rule (e.g., a declarative list of `{start, end, label}` triples consumed by a loop) may be worth a future todo — not attempted here, per the plan's explicit scope boundary.
- Followed the plan's anchor text byte-for-byte by reading it programmatically out of the bench file (`node -e` reading `private/bench/marketing.html` lines 706/712) rather than retyping, consistent with V-3's warning about retyped predicates.

## Deviations from Plan

None - plan executed exactly as written. All six Task 1/Task 2 automated verifications and all Task 3 gate commands passed on the first attempt; no auto-fixes were needed.

## Issues Encountered

None.

## Verification Gate Results (all six CI validate-job commands, run in order)

1. `npm run security:migrations:verify` → PASS (migrations 214–218 unaffected by this change)
2. `npm run typecheck:strict` → clean, no output (0 errors)
3. `npm run lint` → clean, `--max-warnings=0` satisfied (only an unrelated ESLintRCWarning deprecation notice printed, not a lint finding)
4. `npm test -- --runInBand` → **638 suites / 7895 tests passed**, 0 failed
   - Of those, the two suites this change specifically exercises — `scripts/marketing-artifact.test.ts` and `__tests__/marketing-root-route.test.ts` — isolated: **2 suites / 63 tests passed**
5. `npm audit --omit=dev --audit-level=moderate` → 0 vulnerabilities
6. `npm audit --audit-level=high` → 0 vulnerabilities

`npm run build` was deliberately not run (not in CI's validate job; would clobber `.next` under the owner's live dev server on :3000).

## Report Back — measured values against the plan's predictions

- **`wc -l assets/marketing/landing.html` = 1890** (up from 1881) — matches the hard tripwire exactly.
- **Real diff line count:** `git diff --numstat` reported **30 insertions / 21 deletions** for `landing.html`, not the predicted 33/24. The plan explicitly permits this divergence ("the unified-diff algorithm pairs lines its own way... if the line total is 1890 and every assertion below passes, say so and move on") — the 1890 total and every byte-level assertion below passed, so this is recorded as a miss rather than silently reconciled. `manifest.json` diff was **1 insertion / 1 deletion** (the `sourceSha256` line only), exactly as predicted.
- **`aria-current` count in the artifact: exactly 2** — the `.navlinks a[aria-current="true"]` CSS rule and the scrollspy's `a.setAttribute('aria-current', …)` JS call. `grep -c 'cdot\[aria-current'` = 0, confirming neither survivor is inside a `.cdot` selector (the carousel's state attribute is now `aria-selected`).
- **`PROHIBITED_LITERALS` check:** imported the array directly from `scripts/verify-marketing-artifact.ts` rather than hand-copying — **17 literals checked, 0 found** in the regenerated artifact.
- **Carousel/lede assertions:** `slidenote` = 0 occurrences; `hover to pause` = 0 occurrences; all three `data-nav` values present exactly once each (`data-nav="The Writer’s Room"` with the curly U+2019 apostrophe, `data-nav="Sound Vault"`, `data-nav="The Crate"`); both new ledes present in entity form (`Fun&#363;n`) exactly once each, and both old ledes absent (0 occurrences each).
- **Manifest shape:** `assets.length` = 50, `fonts.length` = 7, `nonceScriptCount` = 1, `sourceSha256` advanced to `366e6e93759e9aa9272f6c63e678d2edcdbd8728c1286ae2a3bae496b810fc78` — all unchanged except the sha, as required.
- **Gate commands:** see "Verification Gate Results" above — all six pass; suite/test counts recorded there.
- **Bench hash unchanged:** `shasum -a 256 private/bench/marketing.html` still equals `366e6e93759e9aa9272f6c63e678d2edcdbd8728c1286ae2a3bae496b810fc78` (the value this plan pinned, confirming the bench was never re-edited during execution).
- **`scripts/verify-marketing-artifact.ts` zero-line diff:** `git diff --numstat -- scripts/verify-marketing-artifact.ts` produced no output (0 lines) — the verifier was not touched.

## Staging / Untracked-File Discipline

Staged and committed only: `scripts/marketing-assets.ts`, `scripts/build-marketing-artifact.ts`, `assets/marketing/landing.html`, `assets/marketing/manifest.json` (two commits, one per plan task). No `git add -A` was used at any point. `private/bench/` is gitignored and was never staged. The five pre-existing untracked files (`.planning/reviews/CODEX-PROMPT-260930-marketing-page-port-FOLLOWUP.md`, `.planning/reviews/CODEX-PROMPT-260930-marketing-page-port-to-root-route.md`, `.planning/reviews/CODEX-RESPONSE-260930-marketing-page-port-to-root-route.md`, `.planning/todos/pending/2026-09-29-paid-tier-interest-capture-before-stripe.md`, `.planning/todos/pending/2026-09-30-ship-marketing-page-at-root-scope.md`) remain untracked after this session's commits, confirmed via `git status --porcelain` immediately before writing this summary. The stale worktree at `.claude/worktrees/zen-yalow-0b7a42/` was never read, edited, or staged.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The branch `hero-named-tabs-and-funun-copy` carries two clean task commits on top of `main` (via merge-base `cd5ee13e`), all six CI validate-job commands green locally.
- Per this executor's scope (worktree note + task boundaries), **push and PR creation are left to the orchestrator** — this executor does not push or open the PR. The orchestrator should push the existing branch and open the PR with the eight required body points enumerated in the plan's Task 3 (owner quotes, the aria-selected correction framed as a correction not a rename, the mobile 375px step, the Funūn-naming change with quoted owner request, the split-sheet claim corroboration at `private/bench/marketing.html:1720`, the deliberate re-freeze sha/line-count delta, the third-strip rationale with "verifier not weakened," and the measured 30/21 + manifest 1/1 diff against the 1890-line total).
- No blockers. `main` is protected and was never pushed to directly.

---
*Phase: quick/261001-hna*
*Completed: 2026-09-30*

## Self-Check: PASSED

- FOUND: `assets/marketing/landing.html`
- FOUND: `assets/marketing/manifest.json`
- FOUND: `.planning/quick/261001-hna-hero-named-tabs-and-funun-copy/261001-hna-SUMMARY.md`
- FOUND commit: `5f51435b`
- FOUND commit: `a656b784`
