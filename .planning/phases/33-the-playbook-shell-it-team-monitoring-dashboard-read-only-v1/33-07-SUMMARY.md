---
phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1
plan: 07
subsystem: ui
tags: [nextjs, react, typescript, jest, observability, dashboard]

# Dependency graph
requires:
  - phase: 32
    provides: "/api/health route, the daily observability cron's health-check + threshold-classification shapes, lib/observability/config.ts THRESHOLDS/classifyThreshold"
provides:
  - "lib/playbook/digest.ts — getDashboardHealth() (in-process tri-state health re-check) + buildDigestTodayRow() (pure digest today-row) + classifyAllThresholds() (cron-parity helper)"
  - "components/playbook/StatusBanner.tsx — 3-state global health banner (healthy/degraded/unknown)"
  - "components/playbook/DigestPanel.tsx — single live digest today-row + v2 history note"
  - "components/playbook/ThresholdsPanel.tsx — 7-row real-values thresholds table"
affects: [33-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "In-process route re-check: import { GET as checkHealth } from '@/app/api/health/route' and call it directly — never a self-HTTP fetch from a server component"
    - "react-dom/server renderToStaticMarkup for component tests — this repo has no jsdom/@testing-library/react installed; static-HTML string assertions substitute for DOM queries"
    - "Explicit metric allowlist (not Object.keys(THRESHOLDS) minus one exclusion) when a UI surface needs a stricter row set than the cron's own filter"

key-files:
  created:
    - lib/playbook/digest.ts
    - components/playbook/StatusBanner.tsx
    - components/playbook/DigestPanel.tsx
    - components/playbook/ThresholdsPanel.tsx
    - __tests__/playbook-digest.test.ts
    - __tests__/playbook-status-banner.test.tsx
    - __tests__/playbook-thresholds-panel.test.tsx
  modified: []

key-decisions:
  - "Used react-dom/server's renderToStaticMarkup (already an installed dependency) for component tests instead of installing @testing-library/react + jsdom — no test infrastructure existed in this repo (testEnvironment: 'node'), and per CLAUDE.md/deviation-rule guidance, adding a new npm devDependency is not an auto-fixable action; this kept Wave 0 tests real without expanding the install surface"
  - "classifyAllThresholds() exported from digest.ts mirrors the cron's own filter (excludes only monthly_spend_usd) for parity testing, deliberately distinct from ThresholdsPanel's stricter 7-row UI-SPEC allowlist (also excludes uptime_consecutive_failures) — RESEARCH Pitfall 4's two-derivation guidance, applied literally"
  - "DigestPanel parses buildDigestTodayRow()'s '**Label.**' locked-copy prefix into a <strong> at render time (light convention parse, not a markdown library) so the UI-SPEC's bold treatment renders visually while the underlying text field stays a plain, parity-testable string"

requirements-completed: [PLAYBOOK-07, PLAYBOOK-08, PLAYBOOK-09]

coverage:
  - id: D1
    description: "getDashboardHealth() re-checks /api/health in-process (import GET as checkHealth), returns healthy/degraded/unknown, never throws"
    requirement: PLAYBOOK-07
    verification:
      - kind: unit
        ref: "__tests__/playbook-digest.test.ts#getDashboardHealth"
        status: pass
    human_judgment: false
  - id: D2
    description: "buildDigestTodayRow() is a pure digest today-row builder with no email side effect; classifyAllThresholds() stays parity-matched to the cron's own classification loop"
    requirement: PLAYBOOK-08
    verification:
      - kind: unit
        ref: "__tests__/playbook-digest.test.ts#buildDigestTodayRow"
        status: pass
      - kind: unit
        ref: "__tests__/playbook-digest.test.ts#classifyAllThresholds parity with the cron route"
        status: pass
    human_judgment: false
  - id: D3
    description: "StatusBanner renders 3 states (healthy pulsing emerald / degraded steady rose / unknown steady rose) per UI-SPEC copy"
    requirement: PLAYBOOK-07
    verification:
      - kind: unit
        ref: "__tests__/playbook-status-banner.test.tsx#StatusBanner"
        status: pass
    human_judgment: false
  - id: D4
    description: "DigestPanel renders exactly one live today row plus the v2 digest-history note, never invoking the alert fan-out"
    requirement: PLAYBOOK-08
    verification:
      - kind: other
        ref: "grep -c 'Full digest history arrives in v2' components/playbook/DigestPanel.tsx == 1; scratch render assertion (1 data-testid=\"digest-today-row\") during Task 2, not retained as a committed test file"
        status: pass
    human_judgment: true
    rationale: "Verified via grep + an ad-hoc render check during execution, not a committed automated test file (the plan's Task 2 <verify> only runs playbook-status-banner.test.tsx) — visual layout/spacing fidelity to the UI-SPEC mockup still needs a human pass once composed into the 33-08 dashboard page"
  - id: D5
    description: "ThresholdsPanel renders exactly the 7 UI-SPEC-allowlisted rows (excluding monthly_spend_usd and uptime_consecutive_failures) with real THRESHOLDS warn/crit values"
    requirement: PLAYBOOK-09
    verification:
      - kind: unit
        ref: "__tests__/playbook-thresholds-panel.test.tsx#ThresholdsPanel"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-08-18
status: complete
---

# Phase 33 Plan 07: Monitoring Dashboard live-signal core Summary

**In-process /api/health re-check driving a 3-state StatusBanner, a pure never-emails digest today-row, and a real-values 7-row ThresholdsPanel — all standalone leaf components for 33-08's dashboard page to compose.**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-08-18
- **Tasks:** 3
- **Files modified:** 7 (all created, none modified)

## Accomplishments

- `lib/playbook/digest.ts`: `getDashboardHealth()` reuses the daily cron's exact health re-check shape (in-process import of the health route's `GET` handler, tri-state healthy/degraded/unknown, never throws) and `buildDigestTodayRow()` is a pure today-row builder using the UI-SPEC's locked copy with no email side effect
- `components/playbook/StatusBanner.tsx`: renders all 3 UI-SPEC banner states verbatim — healthy (emerald, pulsing dot, "All systems operational"), degraded (rose, steady dot, Incident Runbook link), unknown (same rose treatment, "treat as degraded" subtext)
- `components/playbook/DigestPanel.tsx`: exactly one live "today" row from `buildDigestTodayRow()` plus the muted v2 digest-history note, never calling the alert fan-out
- `components/playbook/ThresholdsPanel.tsx`: real `THRESHOLDS` warn/crit values across the UI-SPEC's explicit 7-metric allowlist (excludes `monthly_spend_usd` and `uptime_consecutive_failures`), fuchsia "Live values · v2" badge, static severity legend
- 3 Wave 0 test files (20 tests total), all TDD RED-verified before implementation, all GREEN after

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/playbook/digest.ts — health re-check + digest row** - `043c2be` (feat)
2. **Task 2: StatusBanner + DigestPanel** - `f5cd0df` (feat)
3. **Task 3: ThresholdsPanel** - `25f9ae2` (feat)

_Note: this plan's tdd="true" tasks combined the RED test file + GREEN implementation into a single commit per task rather than separate `test()`/`feat()` commits — see "TDD Gate Compliance" below._

## Files Created/Modified

- `lib/playbook/digest.ts` - `getDashboardHealth()`, `buildDigestTodayRow()`, `classifyAllThresholds()`
- `components/playbook/StatusBanner.tsx` - 3-state global health banner
- `components/playbook/DigestPanel.tsx` - single live digest today-row + v2 note
- `components/playbook/ThresholdsPanel.tsx` - 7-row real-values thresholds table
- `__tests__/playbook-digest.test.ts` - health mapping tri-state, digest row dot/text, no-email guard, cron parity
- `__tests__/playbook-status-banner.test.tsx` - 3 banner states, pulsing/steady dot semantics
- `__tests__/playbook-thresholds-panel.test.tsx` - exactly-7-rows, both exclusions, real config values

## Decisions Made

- No new npm dependency added for component testing — used `react-dom/server`'s `renderToStaticMarkup` (already installed via `react-dom`) instead of `@testing-library/react` + jsdom, since this repo's Jest config runs `testEnvironment: 'node'` with no DOM testing library anywhere in the codebase. This keeps Wave 0 coverage real (actual JSX render, string-content assertions) without expanding the install surface — package installs are excluded from auto-fixable deviations per this project's executor rules.
- `classifyAllThresholds()` mirrors the cron's own filter (excludes only `monthly_spend_usd`) for a parity test against the cron's classification loop, kept deliberately separate from `ThresholdsPanel`'s stricter UI-SPEC 7-row allowlist (also excludes `uptime_consecutive_failures`) — this matches RESEARCH Pitfall 4's explicit "two different derivations" guidance.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Self-referential grep-guard comments in digest.ts tripped their own acceptance-criteria grep**
- **Found during:** Task 1 (verifying `grep -c "fetch(" ` / `grep -c "observability/alerts"` both == 0)
- **Issue:** Explanatory code comments in `lib/playbook/digest.ts` literally contained the strings `fetch(` and `observability/alerts` (describing what the module does NOT do), which caused the plan's own acceptance-criteria grep commands to report false positives (count 1, not 0)
- **Fix:** Reworded both comments to describe the same intent ("never a self-HTTP call", "it never imports the alert fan-out helper") without containing the literal grepped substrings
- **Files modified:** `lib/playbook/digest.ts`
- **Verification:** `grep -c "fetch(" lib/playbook/digest.ts` and `grep -c "observability/alerts" lib/playbook/digest.ts` both return `0`; full test suite still green after the wording change
- **Committed in:** `043c2be` (Task 1 commit — fixed before commit, not a separate follow-up)

---

**Total deviations:** 1 auto-fixed (1 bug — self-referential comment wording)
**Impact on plan:** Cosmetic wording fix only; no behavior change. No scope creep.

## TDD Gate Compliance

Each task followed the plan's RED→GREEN sequence in execution order (test file written and confirmed failing via `Configuration error: Could not locate module` before the corresponding source file was written, then re-run to confirm green), but per this executor's `task_commit_protocol` ("commit immediately" per task boundary), the RED test file and GREEN implementation were committed together as a single `feat(33-07): ...` commit per task rather than as separate `test(...)` → `feat(...)` commits. Git log therefore shows 3 `feat` commits, not the `test`→`feat` pair the strict TDD gate sequence describes. RED was genuinely verified (tool-call transcript shows each test file failing to resolve its not-yet-created source module before implementation began) — this is a commit-granularity deviation, not a skipped-RED deviation.

## Issues Encountered

None beyond the self-fixed grep-guard wording issue above.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None — all three components render live/real data (config values, computed health status) with no hardcoded empty/placeholder data paths. The "awaiting feed" pill and "Live values · v2" badge on `ThresholdsPanel`, and the v2 history note on `DigestPanel`, are intentional, UI-SPEC-mandated honest-labeling copy (not stubs to resolve) — the underlying threshold *values* and health *status* they annotate are real, not placeholders.

## Next Phase Readiness

- `StatusBanner`, `DigestPanel`, and `ThresholdsPanel` are standalone, dependency-free (no server-only imports beyond `lib/playbook/digest.ts` and `lib/observability/config.ts`) and ready for 33-08's dashboard page to compose alongside the Uptime panel, Vendors panel, and Quick Links.
- 33-08 will need to call `getDashboardHealth()` once per dashboard page render (server component) and pass the resulting status into both `StatusBanner` and `DigestPanel` — no additional health re-check plumbing required from this plan's artifacts.
- No blockers.

---
*Phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1*
*Completed: 2026-08-18*
