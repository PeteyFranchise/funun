---
phase: 32-production-observability-capacity-incident-readiness
plan: 08
subsystem: infra
tags: [observability, thresholds, severity, documentation, alerting]

# Dependency graph
requires:
  - phase: 32-production-observability-capacity-incident-readiness (Plan 01)
    provides: "lib/observability/config.ts — THRESHOLDS, classifyThreshold(), SEVERITY_LABELS, budget constants (SPEND_HEADS_UP_USD, SUPABASE_COMPUTE_AUTO_UPGRADE_CEILING_USD, INFRA_REVIEW_TRIGGER_USD) — the single numeric source of truth this doc projects"
provides:
  - "docs/observability/THRESHOLDS-AND-SEVERITY.md — proposed-vs-baseline thresholds table for all 9 R8 signals + complete SEV-1..4 severity model (six fields per severity) + non-overlapping-band/exact-boundary resolution rules"
affects: ["32-09 (k6 capacity baseline — will fill the baseline-adjusted column)", "32-10 (incident runbook + operating rhythm consume this doc's SEV table and owners)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Documentation-projects-config pattern: THRESHOLDS-AND-SEVERITY.md states no numeric value is authoritative on its own — it explicitly defers to lib/observability/config.ts and instructs future editors to update config.ts first, doc second, in the same change"

key-files:
  created:
    - docs/observability/THRESHOLDS-AND-SEVERITY.md
  modified: []

key-decisions:
  - "Read-location column values (Vercel dashboard → Observability → Errors/Functions/Latency; Supabase dashboard → Database/Auth/API Logs; uptime provider dashboard; Vercel Spend Management + Supabase billing) were derived from the SPEC's R1/R2/R3 acceptance criteria and platform names already in use elsewhere in the phase (Plan 05's VERCEL_PLAN_TIER gating, D-05's Better Stack reference) since Plans 06/07 (which will produce dedicated VERCEL-ALERTS-RESPONSE.md/uptime docs) have not yet executed — this doc names the dashboard location directly rather than forward-referencing not-yet-created docs, keeping it self-contained now."
  - "FUNCTION_THROTTLED called out explicitly as urgent in its own paragraph (not just a table row) per the plan's R1 cross-reference: a single throttle occurrence already meets the warning band, framed as worth same-day attention rather than waiting for the 5-occurrence critical threshold."
  - "SEV-1..4 escalation rule explicitly states there is currently no automated escalation path because no backup owner exists yet (D-13) — this is stated as an acknowledged single-owner risk rather than glossed over, matching the plan's 'backup field present but TBD' instruction."

patterns-established:
  - "Pattern: any future observability doc that restates config.ts numbers must include the same 'do not invent parallel numbers — config.ts wins' guardrail paragraph this doc uses, to prevent drift as more docs (runbook, operating rhythm) are added in Plan 10."

requirements-completed: [R8]

coverage:
  - id: D1
    description: "Thresholds table shows proposed warning/critical for all 9 R8 signals (Vercel 5xx, function throttles, dynamic-route p95, Supabase CPU, DB connections, disk, Auth/API 5xx, uptime consecutive failures, monthly spend), sourced verbatim from lib/observability/config.ts THRESHOLDS, with baseline-adjusted column marked provisional pending Plan 09"
    requirement: R8
    verification:
      - kind: other
        ref: "grep -qi provisional docs/observability/THRESHOLDS-AND-SEVERITY.md && grep -q SEV-1 ... && grep -q SEV-4 ... (plan verify gate)"
        status: pass
    human_judgment: false
  - id: D2
    description: "SEV-1..SEV-4 table has all six required fields per severity (notification channel, primary owner, backup owner, ack expectation, escalation rule, resolution criteria); non-overlapping-band + exact-boundary + no-data-unknown resolution rules stated explicitly"
    requirement: R8
    verification: []
    human_judgment: true
    rationale: "Structural completeness of a six-field-by-four-row table and the accuracy of prose resolution rules is a documentation-quality judgment, not something a grep/test can verify beyond presence of the SEV-1/SEV-4 markers already covered by D1's automated gate."

# Metrics
duration: ~8min
completed: 2026-08-13
status: complete
---

# Phase 32 Plan 08: Thresholds & Severity Model Documentation Summary

**`docs/observability/THRESHOLDS-AND-SEVERITY.md` — a thresholds table (proposed vs. provisional-baseline) for all 9 R8 signals sourced from `lib/observability/config.ts`, plus a six-field SEV-1..SEV-4 severity model naming Pete as primary owner with backup TBD**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-08-13T17:21:00Z
- **Completed:** 2026-08-13T17:29:23Z
- **Tasks:** 1 of 1 auto task complete
- **Files modified:** 1 created

## Accomplishments
- `docs/observability/THRESHOLDS-AND-SEVERITY.md` Section 1: a 9-row thresholds table (signal / proposed warning / proposed critical / baseline-adjusted / window+rounding / read-location) covering every R8 signal, with every entry's baseline-adjusted column marked "provisional — pending Plan 09 k6 baseline" and a numeric source-of-truth guardrail pointing at `lib/observability/config.ts`.
- Explicit resolution rules stated in prose directly beneath the table: no-data → `unknown` (never silently healthy), value exactly at `warning` or between bands → `warning`, value at/above `critical` → `critical`, with a worked one-step-either-side example proving determinism at every boundary.
- `FUNCTION_THROTTLED` called out as urgent per R1/R8 cross-reference.
- Section 2: a complete SEV-1..SEV-4 table with all six required fields (notification channel, primary owner, backup owner, acknowledgement expectation, escalation rule, resolution criteria) per severity, naming Pete (pete@funun.studio, D-13) as primary owner across all four levels with backup explicitly marked TBD, plus a SEV-mapping paragraph tying each level to representative threshold breaches.
- D-15's $100/mo infra-review trigger and D-14's ~$50/mo Supabase compute auto-upgrade pre-authorized ceiling documented as measurable decision points, with an explicit note that no code in this phase automatically triggers a compute change.
- Closing "Non-overlap and drift guarantees" section citing Plan 01's `config.test.ts` programmatic `warning < critical` assertion as the backstop against band overlap.

## Task Commits

Each task was committed atomically:

1. **Task 1: Thresholds + SEV-1..4 model documentation** - `86f9d84` (docs)

**Plan metadata:** pending (this SUMMARY's own commit, made after this file is written)

## Files Created/Modified
- `docs/observability/THRESHOLDS-AND-SEVERITY.md` - proposed-vs-baseline thresholds table + SEV-1..4 severity model + boundary-resolution rules

## Decisions Made
- Read-location values were sourced from platform dashboard names already established elsewhere in the phase (Plan 05's Vercel/Supabase references, D-05's Better Stack reference) rather than forward-referencing Plans 06/07's not-yet-created dedicated response docs, keeping this doc self-contained regardless of execution order.
- FUNCTION_THROTTLED given its own explicit "urgent" callout paragraph beyond the table row, per the plan's explicit R1 cross-reference instruction.
- The SEV table's escalation-rule field states plainly that no automated escalation path exists today (no backup owner) rather than implying a process that doesn't exist yet.

## Deviations from Plan

None - plan executed exactly as written. The single auto task was completed per the plan's action/acceptance-criteria text; no bugs, missing functionality, or blocking issues required a Rule 1/2/3 auto-fix.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. This is a documentation-only deliverable.

## Next Phase Readiness

- `docs/observability/THRESHOLDS-AND-SEVERITY.md` is ready for Plan 09 (k6 capacity baseline) to update the baseline-adjusted column once measured data lands, and for Plan 10 (incident runbook + operating rhythm) to consume the SEV table's owners/channels/escalation fields directly.
- No blockers. This plan has no downstream dependents blocked on it beyond the two named above, and both are unblocked to proceed independently.

---
*Phase: 32-production-observability-capacity-incident-readiness*
*Completed: 2026-08-13*

## Self-Check: PASSED

- FOUND: docs/observability/THRESHOLDS-AND-SEVERITY.md
- FOUND commit: 86f9d84 (Task 1)
