---
phase: 32-production-observability-capacity-incident-readiness
plan: 10
subsystem: observability
tags: [incident-response, runbook, operating-rhythm, capacity, ops, tabletop]

# Dependency graph
requires:
  - phase: 32-05
    provides: "daily-observability-check cron + fanOutAlert — the daily cadence's automated heartbeat"
  - phase: 32-08
    provides: "SEV-1..4 model + thresholds table the runbook routes severity on"
  - phase: 32-09
    provides: "measured capacity baseline (PENDING — sample monthly report stays illustrative until the k6 run lands)"
provides:
  - "docs/observability/RUNBOOK.md — tabletop-validated incident-response runbook (origin triage, correlation-ID → deploy, safe rollback + schema-ahead caveat, break-glass reference, post-incident review) (R9)"
  - "docs/observability/OPERATING-RHYTHM.md — daily/weekly/pre-launch/monthly cadences with named owner + a measurable, deterministic capacity-upgrade trigger (R10)"
  - "docs/observability/monthly-capacity-report-sample.md — format-demonstration monthly report (illustrative numbers until 32-09's baseline)"
affects: [incident-response, "on-call / future backup owner", "32-09 (real CAPACITY-REPORT.md feeds the first real monthly report)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Runbook references (never duplicates) docs/BREAK-GLASS.md — destructive recovery stays behind one door"
    - "Schema-ahead rollback caveat: never roll app below a live migration without confirming old-code/new-schema compatibility — favor forward fix"

key-files:
  created:
    - docs/observability/RUNBOOK.md
    - docs/observability/OPERATING-RHYTHM.md
    - docs/observability/monthly-capacity-report-sample.md
  modified:
    - vercel.json
    - app/api/cron/daily-observability-check/route.ts

key-decisions:
  - "Tabletop PASSED 2026-08-18 (owner-run, Claude-facilitated). Scenario: /sync/catalog 5xx after an 8:55pm deploy that also shipped migration 112 (NOT NULL license_tier on tracks). Owner correctly applied §3a — forward fix, NOT rollback — because rolling the app below the live migration would run old code against the new schema. The runbook's most important step guided the correct call."
  - "Cadence confirmed workable at founder scale (daily digest / weekly ~10-min / pre-launch / monthly)."
  - "Daily observability digest retimed from 06:00 UTC to 15:00 UTC (≈ 8am PDT / 7am PST) so it lands in the owner's Pacific morning — owner request during the tabletop. Vercel cron is UTC-only; the local time shifts one hour across DST but stays morning."
  - "The monthly-capacity-report sample remains ILLUSTRATIVE (placeholder numbers) by design until 32-09's k6 run produces docs/observability/CAPACITY-REPORT.md; the FORMAT and the deterministic recommend/hold rule are validated, the real data is not yet available."
  - "Sentry-based steps in RUNBOOK §1/§2 are written for the target state and become fully usable once 32-06's Sentry setup is live (deferred); the §2 time-window/route fallback covers the interim — surfaced and accepted at the tabletop."

patterns-established:
  - "Draft-first ops doc → owner tabletop → strip DRAFT banner + stamp validated → SUMMARY. Same close-out shape as 32-04/32-07 owner-config plans."

requirements-completed: [R9, R10]

coverage:
  - id: D1
    description: "Incident-response runbook: origin triage (Vercel/Supabase/app/DNS/Auth/Storage/external), user-report → correlation-ID → deployment, safe Vercel rollback AND the schema-ahead 'when NOT to roll back' caveat, references (not duplicates) BREAK-GLASS.md, no destructive steps, post-incident review template (R9)."
    requirement: "R9"
    verification:
      - kind: manual_procedural
        ref: "owner tabletop 2026-08-18 — walked a /sync/catalog-5xx-after-migration scenario end-to-end through §1→§7; §3a correctly steered to forward-fix over rollback"
        status: pass
      - kind: other
        ref: "grep for destructive verbs (db reset / drop database / migration repair / supabase db reset) → 0 matches; §4 references BREAK-GLASS.md without duplicating it"
        status: pass
    human_judgment: true
    rationale: "A runbook's fitness is validated by a human walking a realistic incident through it and confirming each step is workable with the access it assumes — exactly what the tabletop did."
  - id: D2
    description: "Operating rhythm: daily/weekly/pre-launch/monthly cadences each naming an owner (Pete, D-13); a measurable, deterministic capacity-upgrade trigger ($100/mo combined spend, D-15) with a recommend/hold rule that resolves cleanly one step either side of the boundary (R10)."
    requirement: "R10"
    verification:
      - kind: manual_procedural
        ref: "owner tabletop 2026-08-18 — cadence confirmed realistic at founder scale; daily digest retimed to Pacific morning as part of sign-off"
        status: pass
    human_judgment: true
    rationale: "Whether a solo-founder cadence is actually sustainable is an owner judgment, not an automated check."
  - id: D3
    description: "One monthly capacity report demonstrating the required format (traffic, peak concurrency, p95, error rate, DB utilization, disk growth, cost + projection, throttling, 90-day recommendation) with the deterministic recommend/hold rule."
    requirement: "R10"
    verification:
      - kind: manual_procedural
        ref: "docs/observability/monthly-capacity-report-sample.md — format + recommend/hold logic demonstrated; every number explicitly marked ILLUSTRATIVE pending 32-09's measured baseline"
        status: pass
    human_judgment: true
    rationale: "Format is demonstrated and validated; the FIRST REAL monthly report requires 32-09's measured baseline + a month of real traffic and is a recurring future artifact, not a 32-10 deliverable. Carried forward as a known dependency on 32-09."

# Metrics
duration: interactive tabletop (~15 min, owner-guided)
completed: 2026-08-18
status: complete
---

# Phase 32 Plan 10: Incident Runbook + Operating Rhythm Summary

**Tabletop-validated incident-response runbook (origin triage → correlation-ID → safe/schema-aware rollback → comms → post-incident review) plus a named-owner daily/weekly/pre-launch/monthly operating rhythm with a deterministic $100/mo capacity-upgrade trigger — closed after a live owner tabletop that also retimed the daily digest to Pacific morning.**

## Performance

- **Duration:** interactive tabletop (~15 min), owner-guided; docs drafted+committed in an earlier session
- **Completed:** 2026-08-18T03:45:00Z
- **Tasks:** 3 of 3 complete (Task 3 = the tabletop, passed this pass)
- **Files:** 3 docs finalized (banners stripped), 2 files touched for the digest retime

## Accomplishments
- **Task 3 — tabletop PASSED (the checkpoint that gated this plan).** Facilitated a realistic incident: `/sync/catalog` 5xx after an 8:55pm deploy that bundled **migration 112** (`NOT NULL license_tier` on `tracks`). Walked §1 origin triage → §2 correlation → §3 rollback decision → §5 comms → §6 timeline → §7 post-incident review. **The owner correctly applied §3a** (forward fix, not rollback — old app code against the new schema would widen the outage). The runbook's highest-risk step guided the right call.
- **Tasks 1–2 (docs) validated + banners stripped.** RUNBOOK.md and OPERATING-RHYTHM.md are now stamped tabletop-validated; the illustrative monthly-report sample keeps its explicit PLACEHOLDER labels by design.
- **Owner tweak applied:** the daily observability digest moved from **06:00 UTC → 15:00 UTC** (≈ 8am PDT / 7am PST) so it lands in the owner's Pacific morning.

## Task Commits

Docs were committed in an earlier session (draft-first); this pass validated + finalized them:

1. **Task 1: incident response runbook** — `2a99fb7` (docs, drafted)
2. **Task 2: operating rhythm + sample monthly report** — `b722685` (docs, drafted)
3. **Task 3: tabletop + finalize (strip banners, retime digest, SUMMARY)** — this close-out commit

## Files Created/Modified
- `docs/observability/RUNBOOK.md` — DRAFT banner removed; footer stamped `VALIDATED — tabletop passed 2026-08-18`; Sentry-dependency note added.
- `docs/observability/OPERATING-RHYTHM.md` — DRAFT banner replaced with tabletop-validated note; §1 digest time updated to 15:00 UTC / Pacific morning.
- `docs/observability/monthly-capacity-report-sample.md` — unchanged (illustrative-by-design; no banner to strip).
- `vercel.json` — daily-observability-check cron `0 6 * * *` → `0 15 * * *` (curator-reach cron untouched).
- `app/api/cron/daily-observability-check/route.ts` — schedule comment updated to match.

## Decisions Made
- **Forward-fix-over-rollback validated live** — the schema-ahead caveat (§3a) is the runbook's load-bearing decision and it held up against a concrete migration scenario.
- **Digest retimed to Pacific morning** (owner request).
- **Monthly sample stays illustrative until 32-09** — format proven, real data deferred (see Issues/Deferred).

## Deviations from Plan
None in structure. Process: executed draft-first across sessions (docs earlier, tabletop now). The one owner-directed change beyond the plan was retiming the daily digest — a config tweak that crosses into 32-05's cron entry but is recorded here since it originated at this tabletop; 32-05's historical SUMMARY/PLAN are left as-is.

## Issues Encountered / Known Dependencies Carried Forward
- **Sentry steps aspirational until 32-06 goes live.** RUNBOOK §1/§2 lean on Sentry for app-origin triage + event correlation; Sentry's live setup is deferred (32-06 Task 3). The §2 time-window/route fallback covers the interim — surfaced and accepted at the tabletop, and noted in the runbook header.
- **Real capacity data pending 32-09.** The monthly-report sample is a format demonstration with placeholder numbers; the first real monthly report needs 32-09's k6 baseline (`docs/observability/CAPACITY-REPORT.md`) + a month of real traffic.
- **Detection gap ~6 min** on the free Better Stack tier (3-min interval × 2 failures) — acknowledged as acceptable at founder scale during the tabletop.

## Next Phase Readiness
- R9 + R10 documentation is validated and live. Supersedes `32-10-DRAFT.md` (removed).
- **Phase 32 is NOT complete:** 32-09 (k6 capacity harness — owner load run pending) is the last do-now plan; 32-06's live Sentry verify is a tracked post-deploy UAT.
- Once 32-09 lands, its measured baseline should seed the first real monthly capacity report (this plan proved the format).

---
*Phase: 32-production-observability-capacity-incident-readiness*
*Plan: 32-10*
*Completed: 2026-08-18 — tabletop passed, docs validated*

## Self-Check: PASSED
- FOUND: docs/observability/RUNBOOK.md (VALIDATED stamp), docs/observability/OPERATING-RHYTHM.md (tabletop note + retimed digest), docs/observability/monthly-capacity-report-sample.md
- CONFIRMED: tabletop walked §1→§7; §3a forward-fix decision correct; DRAFT banners stripped from both docs; digest cron 0 6→0 15; no destructive verbs in runbook; BREAK-GLASS.md referenced not duplicated
- CARRIED FORWARD: monthly sample illustrative until 32-09 baseline; Sentry steps live once 32-06 deploys
