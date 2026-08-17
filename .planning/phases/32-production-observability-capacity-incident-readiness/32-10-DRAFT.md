# Phase 32 Plan 10: Draft-First Execution Note

**This is NOT a SUMMARY.md — the plan is not complete.** Per the owner's draft-first
instruction, this run drafted every automatable artifact from 32-10-PLAN.md and
deliberately skipped the plan's human checkpoint. No `32-10-SUMMARY.md` was written,
and `.planning/STATE.md` / `.planning/ROADMAP.md` were not touched.

## Drafted

- `docs/observability/RUNBOOK.md` (Task 1) — incident response runbook: origin triage
  (Vercel/Supabase/app/DNS/Auth/Storage/external), user-report → correlation ID
  (`lib/logging/correlation.ts`) → deployment correlation, safe Vercel rollback +
  the schema-ahead "when NOT to roll back" caveat, references (not duplicates)
  `docs/BREAK-GLASS.md`, degraded-service comms, incident timeline, and the
  eight-field post-incident review template. Verified clean of destructive verbs
  (`db reset`, `drop database`, `migration repair`, `supabase db reset`).
- `docs/observability/OPERATING-RHYTHM.md` (Task 2) — daily (Plan 05 cron)/weekly
  (~10-min Vercel + Supabase review)/pre-launch/monthly cadences, each naming Pete
  (pete@funun.studio, D-13) as owner, plus the deterministic capacity-upgrade
  recommend/hold rule citing `INFRA_REVIEW_TRIGGER_USD` ($100/mo, D-15) and
  `SUPABASE_COMPUTE_AUTO_UPGRADE_CEILING_USD` (~$50/mo, D-14) from
  `lib/observability/config.ts`.
- `docs/observability/monthly-capacity-report-sample.md` (Task 2) — a sample monthly
  capacity report demonstrating the required format (traffic, peak measured
  concurrency, p95, error rate, DB utilization, disk growth, cost + projection,
  throttling, 90-day recommendation). **Every number in it is explicitly marked
  ILLUSTRATIVE/PLACEHOLDER** — Plan 09 (the k6 non-production load harness) has not
  been executed yet, so `docs/observability/CAPACITY-REPORT.md`'s real measured
  baseline does not exist. The sample correctly avoids restating the Vercel ~30,000
  Function figure as simultaneous-user capacity, and demonstrates the
  recommend/hold rule's logic against a placeholder $0 spend input.

Both automated verification gates from the plan pass:
- Task 1: `docs/observability/RUNBOOK.md` exists, references BREAK-GLASS.md, contains
  no forbidden destructive phrases. **PASS**
- Task 2: both files exist; `OPERATING-RHYTHM.md` contains "weekly" and "monthly".
  **PASS**

## Deferred — needs owner

- **Task 3 — Checkpoint: tabletop the runbook + confirm owner cadence** (SKIPPED,
  not blocked on). This is a `checkpoint:human-verify` gate; per draft-first mode it
  was not executed. **Exact owner action required:**
  1. **Tabletop the runbook end-to-end** using a simulated incident (e.g. "buyers
     report `/sync/catalog` 500s after a deploy") — walk origin triage, the
     report → correlation-ID → deployment correlation, the rollback decision
     (including a schema-ahead case where you must NOT roll back), degraded-service
     comms, the incident timeline, and the post-incident review. Confirm the
     runbook was sufficient (or note gaps to fix), that it referenced break-glass
     without duplicating it, and that it has no destructive steps.
  2. **Confirm the operating-rhythm cadence** — that the weekly/monthly checklists
     correctly name you as owner and that the capacity-upgrade trigger ($100/mo
     combined spend, per D-15) is workable as a measurable trigger in practice.
  3. Reply with **"tabletop passed"** (noting any gaps found) or **"needs
     revision"** with specifics, per the plan's resume-signal, to unblock a
     follow-up execution run that completes the plan (writes `32-10-SUMMARY.md`,
     updates STATE.md/ROADMAP.md/REQUIREMENTS.md).

- **Real Plan 09 baseline still pending** (not this plan's checkpoint, but a hard
  dependency the sample report calls out): once Plan 09's own checkpoints
  (install k6 + provision non-prod staging target; run the harness + rehearse the
  abort) are completed by the owner and `docs/observability/CAPACITY-REPORT.md`
  exists with real measured data, `docs/observability/monthly-capacity-report-sample.md`
  should be redone (or clearly superseded by) a first real monthly report built
  from that baseline plus a month of real production traffic — the current file
  is a format demonstration only, not a usable capacity report.

---
*Phase: 32-production-observability-capacity-incident-readiness*
*Plan: 32-10*
*Mode: draft-first (owner-directed) — plan NOT complete*
