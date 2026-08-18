---
created: 2026-08-17T00:00:00Z
title: Incident-runbook tabletop (Phase 32-10 Task 3) — deferred
area: ops
files:
  - docs/observability/RUNBOOK.md
  - docs/observability/OPERATING-RHYTHM.md
  - .planning/phases/32-production-observability-capacity-incident-readiness/32-10-DRAFT.md
---

## Status (2026-08-17)

Both docs are DRAFTED + committed but stamped **DRAFT / unvalidated** until the owner runs the
tabletop once. Owner decision 2026-08-17: table it for later. No infra, no vendors — it's a ~10-min
review exercise that can be run in ANY session, no deploy/staging dependency.

## What the tabletop is
A dry-run "fire drill": walk ONE simulated production incident end-to-end through `RUNBOOK.md` to
confirm the steps are workable and the owner actually has the access each step assumes — before a
real incident hits. Then confirm the `OPERATING-RHYTHM.md` cadence (daily digest / weekly ~10-min
review / pre-launch checklist / monthly capacity report) is realistic for a solo founder.

## Resume here
1. Claude poses one realistic scenario (e.g. Better Stack alert: `/sync/catalog` down + a new Sentry
   error signature right after last night's deploy).
2. Walk `RUNBOOK.md`'s real steps against it: origin triage (§1) → correlation-ID → deploy (§2) →
   rollback vs forward-fix incl. the schema-ahead caveat (§3/§3a) → status-page comms (§5) →
   post-incident review template (§6/§7).
3. Flag any step that wouldn't work in practice → fix the doc.
4. Gut-check the OPERATING-RHYTHM cadence (too much / just right for a solo founder?).
5. Owner replies "tabletop passed" (or lists revisions) → strip the `DRAFT STATUS` banners from both
   docs → closes Plan 32-10, the last do-now item in Phase 32.
