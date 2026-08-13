---
phase: 32-production-observability-capacity-incident-readiness
plan: 01
subsystem: infra
tags: [observability, config, thresholds, severity, alerting, supabase, jest]

# Dependency graph
requires:
  - phase: 32-production-observability-capacity-incident-readiness (Plan 02)
    provides: "lib/observability/scrub.ts, lib/logging/correlation.ts (established the lib/observability/ and lib/logging/ conventions this plan extends)"
provides:
  - "lib/observability/config.ts — the single D-10 config surface: SeverityLevel/SEVERITY_LABELS/SEVERITY_VALUES, ThresholdMetric union, THRESHOLDS (seeded from SPEC R8, all provisional), classifyThreshold(), budget constants (SPEND_HEADS_UP_USD/SUPABASE_COMPUTE_AUTO_UPGRADE_CEILING_USD/INFRA_REVIEW_TRIGGER_USD), Recipient/DEFAULT_ALERT_RECIPIENTS, getAlertRecipients()/getIncidentOwners()"
  - "supabase/migrations/110_observability_config.sql — observability_recipients table (drafted + text-tested, NOT yet pushed)"
affects: [32-05-alert-fanout-daily-cron, 32-08-thresholds-severity-doc]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-10 hybrid config shape: mostly-static values (thresholds, SEV enum) live in a typed module; growable values (recipients/owners) live in a service-role-only table read through the same module — one import surface for every downstream consumer"
    - "Never-throw fallback to a single-owner default (DEFAULT_ALERT_RECIPIENTS) whenever the backing table is empty, errors, or doesn't exist yet — matches lib/email/index.ts's no-op-when-unconfigured philosophy, and specifically decouples this plan's code from the pending human migration push"

key-files:
  created:
    - lib/observability/config.ts
    - lib/observability/config.test.ts
    - supabase/migrations/110_observability_config.sql
    - __tests__/migration-110.test.ts
  modified: []

key-decisions:
  - "THRESHOLDS numeric values: no literal 'brief' with proposed numbers was found in SPEC.md/CONTEXT.md/RESEARCH.md beyond the $100/$50 budget figures (D-09/D-14/D-15) and Better Stack's 2-3 consecutive-failure alerting (D-05); seeded sensible provisional defaults for the remaining six metrics (vercel_5xx_rate, function_throttle, dynamic_route_p95_ms, supabase_cpu_pct, db_connections, disk_pct, auth_api_5xx_rate) with every entry carrying `provisional: true` so Plan 09's k6 baseline and Plan 08's thresholds doc are the actual validation gate, not this commit"
  - "classifyThreshold's boundary rule: value >= critical -> 'critical', value >= warning (and < critical) -> 'warning', else 'healthy' — a value exactly AT warning resolves to 'warning' per the must_haves truth and SPEC's 'a value exactly at a threshold resolves to one documented severity'"
  - "getAlertRecipients()/getIncidentOwners() wrap the entire service-client call (including createServiceClient() itself) in try/catch, not just the query — so a missing env var or thrown client-construction error also falls back to DEFAULT_ALERT_RECIPIENTS rather than propagating"
  - "Migration 110 follows migration 108's structural conventions exactly (header WHY/WHAT, HUMAN-GATED footer, trailing NOTIFY pgrst) and mirrors funun_staff's zero-policy RLS posture rather than inventing a new access pattern"

patterns-established:
  - "Pattern: any future config value that needs to be owner-editable without a redeploy goes in this same observability_recipients-style table pattern, read through lib/observability/config.ts, never a new standalone module"

requirements-completed: [R1, R8, R10]

coverage:
  - id: D1
    description: "classifyThreshold(metric, value) resolves boundary/adjacency/critical/healthy/unknown deterministically for every THRESHOLDS metric, and every threshold band has warning < critical"
    requirement: R8
    verification:
      - kind: unit
        ref: "lib/observability/config.test.ts#classifyThreshold (6 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "getAlertRecipients()/getIncidentOwners() return DEFAULT_ALERT_RECIPIENTS on empty/error/throw and the real table rows otherwise — never throw, never block on migration 110 being pushed"
    requirement: R1
    verification:
      - kind: unit
        ref: "lib/observability/config.test.ts#getAlertRecipients (4 tests), #getIncidentOwners (2 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Migration 110 (observability_recipients) is drafted to the migration-108 convention: correct columns/CHECK, RLS enabled with zero CREATE POLICY statements, HUMAN-GATED footer, trailing NOTIFY pgrst"
    requirement: R10
    verification:
      - kind: unit
        ref: "__tests__/migration-110.test.ts (5 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Migration 110 reviewed and pushed live by the owner via `supabase db push`, LOCAL=REMOTE parity confirmed through 110"
    verification: []
    human_judgment: true
    rationale: "This project never runs `supabase db push` from an agent (migrations 080-108 convention) — the push is a human-gated checkpoint (Task 3), not automatable. The config module already falls back safely to DEFAULT_ALERT_RECIPIENTS so nothing downstream is blocked pending this."

# Metrics
duration: ~20min
completed: 2026-08-13
status: complete
---

# Phase 32 Plan 01: D-10 Central Observability Config Layer Summary

**Typed threshold/SEV/budget config module (`lib/observability/config.ts`) plus a drafted, text-tested, human-gated `observability_recipients` migration (110) for the growable alert-recipient/owner list**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-13T17:14:11Z
- **Tasks:** 2 of 3 auto tasks complete; Task 3 (human-verify checkpoint) open, awaiting owner
- **Files modified:** 4 created, 0 modified

## Accomplishments
- `lib/observability/config.ts`: the single D-10 surface exporting `SeverityLevel`/`SEVERITY_LABELS`/`SEVERITY_VALUES`, the `ThresholdMetric` union covering all nine SPEC R8 signals, `THRESHOLDS` (seeded, provisional), `classifyThreshold()` with deterministic boundary/adjacency/unknown resolution, the three D-09/D-14/D-15 budget constants, `Recipient`/`DEFAULT_ALERT_RECIPIENTS`, and `getAlertRecipients()`/`getIncidentOwners()` — both never-throw with a Pete-only fallback.
- `lib/observability/config.test.ts`: 12 tests covering the full behavior block (boundary, adjacency/lower-band, critical + one-step-above, below-warning healthy, null/undefined unknown, non-overlapping-bands assertion over every THRESHOLDS entry, empty-array fallback, error fallback, thrown-client fallback, real-rows pass-through, and incident-owner role filtering).
- `supabase/migrations/110_observability_config.sql`: drafted `observability_recipients` (id/email/role/created_at) with zero-policy RLS, D-10/D-04 rationale in `COMMENT ON TABLE`/`COMMENT ON COLUMN`, and the verbatim HUMAN-GATED footer — NOT pushed by this executor.
- `__tests__/migration-110.test.ts`: 5 tests text-locking the table/columns/CHECK constraint, RLS-enabled + zero `CREATE POLICY` against this table, the HUMAN-GATED footer, and the trailing `NOTIFY pgrst` line.
- Full plan verification green: `npx jest lib/observability/config.test.ts __tests__/migration-110.test.ts` (17/17 passed) and `npx tsc --noEmit` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Typed threshold + SEV + recipient config module** - `b6353d7` (feat)
2. **Task 2: observability_recipients migration (draft + text-test)** - `9d9fec6` (feat)
3. **Task 3: Checkpoint — owner reviews + pushes migration 110** - OPEN (not yet actioned; this is a `checkpoint:human-verify` gate, no commit expected until the owner confirms)

**Plan metadata:** pending (this SUMMARY's own commit, made after this file is written)

## Files Created/Modified
- `lib/observability/config.ts` - the D-10 typed config surface (thresholds, SEV enum, budgets, recipients/owners readers)
- `lib/observability/config.test.ts` - unit coverage for classifyThreshold + recipient/owner fallback behavior
- `supabase/migrations/110_observability_config.sql` - drafted `observability_recipients` migration, human-gated, not pushed
- `__tests__/migration-110.test.ts` - text-lock test for migration 110's contents

## Decisions Made
- No literal numeric "brief" was found anywhere in `32-SPEC.md`/`32-CONTEXT.md`/`32-RESEARCH.md` for six of the nine R8 signals (only the $100/$50 budget figures and Better Stack's 2-3 consecutive-failure alerting had explicit numbers). Seeded reasonable provisional defaults for the rest (documented inline in `config.ts` and above in `key-decisions`) — every entry is `provisional: true`, so Plan 09's k6 baseline is the actual validation gate, not this commit's numbers.
- `classifyThreshold`'s boundary semantics (>= critical -> critical, >= warning -> warning, else healthy) implement the SPEC's "a value exactly at a threshold resolves to one documented severity" and the plan's `must_haves` truth verbatim.
- `getAlertRecipients()`/`getIncidentOwners()` wrap `createServiceClient()` itself (not just the query) in try/catch, so a missing/misconfigured env var also falls back safely rather than throwing.

## Deviations from Plan

None - plan executed exactly as written. The two auto tasks (Task 1, Task 2) were completed and committed per the plan's action/acceptance-criteria text; no bugs, missing functionality, or blocking issues were found that required a Rule 1/2/3 auto-fix.

## Issues Encountered

None during Task 1/2 execution. Task 3 (the migration-push checkpoint) is intentionally left open per this plan's `autonomous: false` frontmatter and the project's standing convention that agents never run `supabase db push` — see "Next Phase Readiness" below.

## User Setup Required

**Migration 110 requires manual review + push.** See Task 3's checkpoint below:
1. Review `supabase/migrations/110_observability_config.sql` for the zero-policy RLS and D-10/D-04 comment.
2. Run `supabase db push` from your working checkout.
3. Confirm `LOCAL=REMOTE` with `supabase migration list` (parity through 110).
4. Optional: `INSERT` a `backup` recipient row to confirm `getIncidentOwners()` picks up growth without a redeploy.

## Next Phase Readiness

- `lib/observability/config.ts` is ready for Plan 05 (`lib/observability/alerts.ts` fan-out helper, daily cron) and Plan 08 (`THRESHOLDS-AND-SEVERITY.md` doc) to import immediately — both read `getAlertRecipients()`/`THRESHOLDS`/`classifyThreshold`/`SEVERITY_*` from this single module, and neither is blocked on migration 110 being pushed since the fallback default is safe.
- **Blocker for full plan completion:** Task 3 (migration 110 review + push) is an open `checkpoint:human-verify` gate. The plan is functionally unblocked downstream, but this plan itself stays open until the owner pushes and confirms parity.

---
*Phase: 32-production-observability-capacity-incident-readiness*
*Completed: 2026-08-13 (Tasks 1-2; Task 3 awaiting owner)*

## Self-Check: PASSED

- FOUND: lib/observability/config.ts
- FOUND: lib/observability/config.test.ts
- FOUND: supabase/migrations/110_observability_config.sql
- FOUND: __tests__/migration-110.test.ts
- FOUND commit: b6353d7 (Task 1)
- FOUND commit: 9d9fec6 (Task 2)
