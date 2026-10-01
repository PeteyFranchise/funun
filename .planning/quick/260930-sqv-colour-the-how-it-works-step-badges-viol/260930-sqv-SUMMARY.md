---
phase: quick/260930-sqv
plan: 01
subsystem: marketing
tags: [marketing-pipeline, css, artifact-regeneration, sanitizer]

requires:
  - phase: quick/260930-ibp
    provides: "the marketing artifact pipeline (marketing-assets.ts, build-marketing-artifact.ts, verify-marketing-artifact.ts) and the frozen-source gate this task advances"
provides:
  - "Violet How-it-works step badges (`.steps .who`) shipped in the regenerated public marketing artifact"
  - "An anchored sanitizer strip (`STEP_BADGE_DECISION_COMMENT_START/END`) that keeps a second owner-decision comment off the public page"
  - "Freeze constants (FROZEN_SHA256/FROZEN_LINE_COUNT) advanced to the bench revision carrying the violet treatment"
affects: [marketing-pipeline, root-route-marketing-rewrite]

tech-stack:
  added: []
  patterns:
    - "Second instance of the anchored removeBetween owner-comment-strip pattern (first precedent: DIFFERENTIATORS_OWNER_COMMENT), confirming it as the repo's standard approach for keeping owner-decision commentary in the bench source while excluding it from the public artifact."

key-files:
  created: []
  modified:
    - scripts/marketing-assets.ts (FROZEN_SHA256, FROZEN_LINE_COUNT advanced to the new bench revision)
    - scripts/build-marketing-artifact.ts (STEP_BADGE_DECISION_COMMENT_START/END anchors + removeBetween call in sanitize())
    - assets/marketing/landing.html (regenerated; .steps .who now carries #a5b4fc / indigo border+fill / font-weight:600)
    - assets/marketing/manifest.json (sourceSha256 advanced)
    - private/bench/baseline/FROZEN.sha256 (gitignored local baseline; not committed)

key-decisions:
  - "Reused the existing DIFFERENTIATORS_OWNER_COMMENT removeBetween precedent verbatim in shape for the new step-badge decision comment, rather than inventing a new sanitizer mechanism."
  - "Did not touch verify-marketing-artifact.ts or PROHIBITED_LITERALS — the fix lives entirely in the sanitizer, per the plan's explicit instruction."

requirements-completed: [SQV-01]

coverage:
  - id: D1
    description: "The five How-it-works step badges render violet (#a5b4fc text, indigo-tinted border/fill, font-weight:600) in the regenerated, committed marketing artifact; the uncolored var(--lav-dim) treatment is gone."
    requirement: "SQV-01"
    verification:
      - kind: other
        ref: "grep assertions against assets/marketing/landing.html's .steps .who rule (color:#a5b4fc, background:rgba(129,140,248,.11), border:1px solid rgba(129,140,248,.38), font-weight:600, zero occurrences of color:var(--lav-dim))"
        status: pass
      - kind: other
        ref: "npm run marketing:verify -> 'verify ok'"
        status: pass
    human_judgment: false
  - id: D2
    description: ".pcard .who (the pricing-card badge rule) is byte-identical and untouched by the diff."
    requirement: "SQV-01"
    verification:
      - kind: other
        ref: "grep -c '.pcard .who{font-size:12px;color:var(--lav-dim);margin:0 0 20px}' == 1, and git diff does not touch that line"
        status: pass
    human_judgment: false
  - id: D3
    description: "No internal decision commentary (OWNER DECISION, .planning/ paths) reaches the public artifact."
    requirement: "SQV-01"
    verification:
      - kind: other
        ref: "grep -c 'OWNER DECISION' assets/marketing/landing.html == 0; grep -c '.planning/' == 0; scripts/marketing-artifact.test.ts (verifyArtifact == [])"
        status: pass
    human_judgment: false
  - id: D4
    description: "Full CI validate-job gate passes locally: migrations verify, typecheck:strict, lint (--max-warnings=0), full test suite, both npm audit levels."
    verification:
      - kind: other
        ref: "npm run security:migrations:verify; npm run typecheck:strict; npm run lint; npm test -- --runInBand (638 suites / 7895 tests); npm audit --omit=dev --audit-level=moderate; npm audit --audit-level=high"
        status: pass
    human_judgment: false
  - id: D5
    description: "The badges render as violet when the artifact is actually served at the live app route."
    verification: []
    human_judgment: true
    rationale: "The dev server's `/` currently redirects anonymous visitors to /signin instead of the marketing document — this is pre-existing, documented, demo-mode behavior (middleware.ts:179-180: 'with NEXT_PUBLIC_VAULT_DEMO=true this rewrite never runs ... Expected -- do not chase it'), unrelated to this change and out of this task's scope. The byte-level greps and marketing:verify prove the artifact itself is correct; actually seeing the rendered page requires a non-demo-mode session, which only a human with the right env/auth state can confirm."

duration: ~35min
completed: 2026-09-30
status: complete
---

# Phase quick/260930-sqv: Colour the How-it-works step badges violet — Summary

**Advanced the marketing artifact freeze to the owner-approved violet bench revision and regenerated the shipped artifact — fixing low salience (not contrast) on the five How-it-works step badges, while keeping the owner's new decision comment out of the public page via an anchored sanitizer strip.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3/3 completed
- **Files modified:** 4 committed (`scripts/marketing-assets.ts`, `scripts/build-marketing-artifact.ts`, `assets/marketing/landing.html`, `assets/marketing/manifest.json`) + 1 gitignored local file updated on disk (`private/bench/baseline/FROZEN.sha256`)

## Accomplishments

- `.steps .who` now renders `color:#a5b4fc`, `border:1px solid rgba(129,140,248,.38)`, `background:rgba(129,140,248,.11)`, `font-weight:600` — the violet, salient treatment the owner selected after reviewing three bench renders.
- `scripts/build-marketing-artifact.ts` gained a second anchored `removeBetween` owner-comment strip (`STEP_BADGE_DECISION_COMMENT_START`/`_END`), stopping the new `OWNER DECISION 2026-09-30` bench comment from reaching the public artifact — the exact failure mode the plan's verified findings (V-3) flagged as a blocker.
- The freeze constants (`FROZEN_SHA256`, `FROZEN_LINE_COUNT`), `manifest.json`'s `sourceSha256`, and the local gitignored `FROZEN.sha256` all now agree on the same bench revision (`eecfb67d...8a294`, 2151 lines).
- `.pcard .who` (the pricing-card badge, a separate CSS rule) is confirmed byte-identical — untouched by the diff.
- Full CI validate-job gate passes locally with no substitutions: migrations verify, `typecheck:strict`, `lint --max-warnings=0`, the full test suite (638 suites / 7895 tests, including the two suites that specifically cover this pipeline), and both `npm audit` levels.

## Task Commits

Each task was committed atomically:

1. **Task 1: Advance the freeze and teach the sanitizer to strip the new decision comment** - `951e14d1` (feat)
2. **Task 2: Regenerate the manifest and artifact** - `2c7e9c65` (feat)
3. **Task 3: Full verification gate** - no additional commit (gate-only task; no source changes to commit per plan)

**Plan metadata:** not committed by this agent — per this task's constraints, the orchestrator commits `.planning/` docs (SUMMARY.md, STATE.md) separately. The branch (`step-badge-violet`) was not pushed and no PR was opened — per this task's constraints, the orchestrator handles shipping (push + PR).

## Files Created/Modified

- `scripts/marketing-assets.ts` — `FROZEN_SHA256` and `FROZEN_LINE_COUNT` advanced to the bench revision carrying the violet rule.
- `scripts/build-marketing-artifact.ts` — new `STEP_BADGE_DECISION_COMMENT_START`/`_END` anchor constants plus one `removeBetween` call inside `sanitize()`, immediately after the existing `DIFFERENTIATORS_OWNER_COMMENT` strip.
- `assets/marketing/landing.html` — regenerated via `npm run marketing:assets` + `npm run marketing:build`; carries the violet `.steps .who` rule.
- `assets/marketing/manifest.json` — `sourceSha256` advanced; asset/font/nonce counts unchanged (50/7/1).
- `private/bench/baseline/FROZEN.sha256` (gitignored, not committed) — updated on disk to the new sha so the local baseline stays honest.

## Decisions Made

- Reused the exact shape of the pre-existing `DIFFERENTIATORS_OWNER_COMMENT` anchored-strip pattern for the new step-badge decision comment, rather than introducing a different sanitizer mechanism — keeps the two owner-comment strips reading together as the plan requested.
- Left `verify-marketing-artifact.ts` and `PROHIBITED_LITERALS` completely untouched; the fix lives entirely in the sanitizer (`build-marketing-artifact.ts`), as instructed.

## Deviations from Plan

None - plan executed exactly as written. The two source edits (Task 1), the three-step regeneration pipeline in the exact order specified (Task 2 — `marketing:assets` before `marketing:build`, per the plan's V-2 correction), and the full six-command verification gate (Task 3) all ran without needing any Rule 1-4 auto-fixes.

**One prediction in the plan did not hold, and is recorded per the plan's own instruction to report rather than silently overwrite:**

The plan predicted the `assets/marketing/landing.html` diff would be `4` insertions / `3` deletions. The actual, measured diff (`git diff --numstat`) is **`3` insertions / `2` deletions**. Reason: the old 3-line `.steps .who` rule and the new 4-line rule share one unchanged trailing line (`  border-radius:999px;padding:3px 9px}`), which git's diff algorithm correctly treats as unchanged context rather than counting it as both a deletion and an insertion. The plan's prediction assumed the whole rule would be replaced line-for-line; the real diff is the minimal edit. The full rule content before and after was manually verified via `git diff` and matches the intended before/after text exactly — this is a diff-granularity difference, not a content or markup discrepancy. No markup, `<script>`, `<div>`, `<section>`, or `<body>` lines were touched; the diff is confined entirely to the `.steps .who` declaration block.

The `assets/marketing/manifest.json` diff matched the prediction exactly: `1` insertion / `1` deletion (the `sourceSha256` line only).

## Issues Encountered

None.

## Report Back — Required Measurements

**Diff line counts (`git diff --numstat`), actual vs. predicted:**
- `assets/marketing/landing.html`: **3 insertions / 2 deletions** (plan predicted 4/3 — see Deviations above for why; confirmed confined to the `.steps .who` rule only, no markup/script moved)
- `assets/marketing/manifest.json`: **1 insertion / 1 deletion** (matches the plan's prediction exactly — the `sourceSha256` line only)

**Six CI validate-job gate commands — all green, no substitutions:**
1. `npm run security:migrations:verify` → `PASS: migrations 214–218 are transactional, collision-sensitive, least-privilege, checksum-pinned, and covered by read-only probes.`
2. `npm run typecheck:strict` → clean, zero errors (includes `noUnusedLocals`/`noUnusedParameters`)
3. `npm run lint` → clean, zero warnings/errors under `--max-warnings=0` (only output was an unrelated ESLintRC deprecation notice, not a finding)
4. `npm test -- --runInBand` → **638 test suites passed, 7895 tests passed**, 0 failed, 43.8s. Targeted re-run of the two suites this change specifically touches — `scripts/marketing-artifact.test.ts` and `__tests__/marketing-root-route.test.ts` — confirms **2 suites / 63 tests, all passing**.
5. `npm audit --omit=dev --audit-level=moderate` → 0 vulnerabilities
6. `npm audit --audit-level=high` → 0 vulnerabilities

**`.pcard .who` byte-identical confirmation:** Confirmed. `grep -c '.pcard .who{font-size:12px;color:var(--lav-dim);margin:0 0 20px}' assets/marketing/landing.html` returns `1`, and `git diff` across both commits shows zero touched lines containing `.pcard`.

**Prohibited literals in the shipped artifact:** Zero occurrences. `grep -c 'OWNER DECISION' assets/marketing/landing.html` → `0`. `grep -c '.planning/' assets/marketing/landing.html` → `0`. `scripts/marketing-artifact.test.ts`'s `verifyArtifact(...)` assertion (`expect(...).toEqual([])`) passes as part of the full test run.

**Manifest shape after rebuild:** 50 assets / 7 fonts / `nonceScriptCount: 1` — unchanged from before the rebuild, confirming the sanitizer's new strip didn't disturb asset/script accounting. `sourceSha256` advanced to `eecfb67d68a7b6feb762aa2de1b2f92a661fe88eb95fd86275ea48c94a58b294`.

**Human-check (non-blocking, per plan):** Loading `http://localhost:3000/` on the live dev server currently redirects anonymous visitors to `/signin` rather than serving the marketing document. This is pre-existing, documented, unrelated behavior: `middleware.ts:179-180` states "with `NEXT_PUBLIC_VAULT_DEMO=true` this rewrite never runs and `/` still goes to `/signin`. Expected -- do not chase it." The byte-level greps against `assets/marketing/landing.html` and `npm run marketing:verify`'s pass already prove the violet treatment is correctly embedded in the artifact; actually seeing it rendered live requires a non-demo-mode session. Flagged as coverage item D5 (human_judgment: true) above rather than silently marked done.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The marketing artifact pipeline is in a clean, regenerable state: freeze constants, manifest `sourceSha256`, and the local gitignored baseline all agree on the current bench revision. No blockers. Remaining work outside this task's scope: the pending todo `.planning/todos/pending/2026-09-30-ship-marketing-page-at-root-scope.md` (observed, not touched) covers getting the marketing document actually served at `/` outside demo mode — unrelated to the violet badge change but relevant context for anyone trying to visually verify this or future marketing-artifact changes against the live dev server.

The branch `step-badge-violet` is 2 commits ahead of `origin/main` (`951e14d1`, `2c7e9c65`), unpushed, with the working tree otherwise matching the pre-existing untracked state (five untracked files under `.planning/reviews/` and `.planning/todos/pending/`, left alone as instructed). Push, PR creation (with the salience-not-contrast framing, 6.2:1 old / 10.5:1 new), and docs commit are left to the orchestrator per this task's constraints.

---
*Phase: quick/260930-sqv*
*Completed: 2026-09-30*

## Self-Check: PASSED

All claimed files found on disk (`scripts/marketing-assets.ts`, `scripts/build-marketing-artifact.ts`, `assets/marketing/landing.html`, `assets/marketing/manifest.json`, `private/bench/baseline/FROZEN.sha256`). Both claimed commits (`951e14d1`, `2c7e9c65`) found in `git log --all`.
