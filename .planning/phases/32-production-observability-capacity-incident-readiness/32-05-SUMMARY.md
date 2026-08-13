---
phase: 32-production-observability-capacity-incident-readiness
plan: 05
subsystem: observability
tags: [alerts, cron, resend, email, threshold-classification, next.js]

requires:
  - phase: 32-01
    provides: "lib/observability/config.ts — getAlertRecipients() (growable, table-backed with Pete-only fallback), THRESHOLDS + classifyThreshold, SPEND_HEADS_UP_USD"
  - phase: 32-03
    provides: "app/api/health/route.ts — read-only, timeout-bounded, never-throws GET the daily cron re-checks"
provides:
  - "lib/observability/alerts.ts — fanOutAlert(subject, html), the extensible D-08 alert sink (never hardcoded, reads config's growable recipient list)"
  - "app/api/cron/daily-observability-check/route.ts — R10's daily automated digest cron, fail-closed CRON_SECRET-gated"
  - "vercel.json daily cron entry alongside the existing weekly curator-reach entry"
affects: ["32-08 (thresholds doc)", "32-09 (k6 capacity baseline)", "32-10 (runbook/operating rhythm)", "future Observability Admin Dashboard"]

tech-stack:
  added: []
  patterns:
    - "Fan-out helper reads recipients from a config module, never a literal address — the D-08 extensible-sink pattern"
    - "Fail-closed CRON_SECRET Bearer check copied verbatim from app/api/cron/curator-reach/route.ts, including the !process.env.CRON_SECRET guard"
    - "Per-recipient/per-row loop that never lets one failure abort the batch"
    - "Threshold metrics with no live telemetry feed yet classify 'unknown' via classifyThreshold(metric, undefined) rather than being fabricated as healthy"
    - "Self-declared VERCEL_PLAN_TIER env flag gates spend-line rendering (Hobby-safe default when unset — no assumed Pro-only capability)"

key-files:
  created:
    - lib/observability/alerts.ts
    - lib/observability/alerts.test.ts
    - app/api/cron/daily-observability-check/route.ts
    - app/api/cron/daily-observability-check/route.test.ts
  modified:
    - vercel.json

key-decisions:
  - "fanOutAlert always sends via lib/email's sendEmail per config-listed recipient; a failed/rejected send increments `failed` and never aborts the loop or throws."
  - "The daily digest always calls fanOutAlert once when authorized (the digest itself is 'something to report' per R10's daily-heartbeat cadence) rather than conditionally suppressing on all-healthy/all-unknown."
  - "No live Vercel spend API exists in this codebase (confirmed: no VERCEL_TOKEN/API client anywhere in lib/ or app/) — the monthly_spend_usd line is tier-branched by a self-declared VERCEL_PLAN_TIER env var, not a live API read on either branch, satisfying 'never attempt an unavailable API read.'"
  - "The daily cron re-checks health by importing and calling app/api/health/route.ts's GET() directly (same-process function call), not an HTTP round-trip — avoids base-URL/self-fetch complexity in a serverless function."

patterns-established:
  - "lib/observability/alerts.ts is now the single fan-out call site every future alert source (SEV routing, threshold breaches, the deferred admin dashboard) should call instead of calling sendEmail directly."

requirements-completed: [R1, R8, R10]

coverage:
  - id: D1
    description: "fanOutAlert(subject, html) reads the growable recipient list from config and sends one email per recipient via lib/email's sendEmail, tolerating per-recipient failure without aborting the batch."
    requirement: "R1"
    verification:
      - kind: unit
        ref: "lib/observability/alerts.test.ts#fanOutAlert sends once per recipient from the growable config list"
        status: pass
      - kind: unit
        ref: "lib/observability/alerts.test.ts#fanOutAlert does not let one failing recipient abort the batch"
        status: pass
      - kind: unit
        ref: "lib/observability/alerts.test.ts#fanOutAlert counts a thrown/rejected send as a failure without aborting the batch"
        status: pass
      - kind: unit
        ref: "lib/observability/alerts.test.ts#fanOutAlert sends exactly once to the single default recipient when config falls back"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/cron/daily-observability-check fails closed on a missing/mismatched/unset CRON_SECRET (401) before any digest work runs."
    requirement: "R10"
    verification:
      - kind: unit
        ref: "app/api/cron/daily-observability-check/route.test.ts#returns 401 and never runs the digest when the Authorization header is missing/mismatched"
        status: pass
      - kind: unit
        ref: "app/api/cron/daily-observability-check/route.test.ts#returns 401 (fails closed) when CRON_SECRET is unset, never matching Bearer undefined"
        status: pass
    human_judgment: false
  - id: D3
    description: "The authorized daily digest re-checks /api/health, classifies each R8 threshold metric via classifyThreshold, degrades the spend line gracefully by Hobby/Pro tier, and fans the digest out exactly once."
    requirement: "R8, R10"
    verification:
      - kind: unit
        ref: "app/api/cron/daily-observability-check/route.test.ts#runs the digest and fans it out exactly once when authorized"
        status: pass
      - kind: unit
        ref: "app/api/cron/daily-observability-check/route.test.ts#reports healthStatus \"degraded\" when the health re-check is degraded, and still fans out"
        status: pass
      - kind: unit
        ref: "app/api/cron/daily-observability-check/route.test.ts#never throws when the health re-check itself rejects (reports unknown instead)"
        status: pass
      - kind: unit
        ref: "app/api/cron/daily-observability-check/route.test.ts#degrades the spend line to the Hobby-tier note when VERCEL_PLAN_TIER is not \"pro\""
        status: pass
      - kind: unit
        ref: "app/api/cron/daily-observability-check/route.test.ts#includes the Spend Management dashboard note when VERCEL_PLAN_TIER is \"pro\""
        status: pass
    human_judgment: false
  - id: D4
    description: "vercel.json registers the new daily cron entry alongside the existing weekly curator-reach entry, and the file still parses as valid JSON."
    requirement: "R10"
    verification:
      - kind: other
        ref: "node -e \"JSON.parse(require('fs').readFileSync('vercel.json','utf8'))\" — parses; both crons entries present"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-08-13
status: complete
---

# Phase 32 Plan 05: Extensible Alert Fan-out + Daily Observability Cron Summary

**Built `fanOutAlert` (D-08's growable, never-hardcoded alert sink) and the fail-closed `/api/cron/daily-observability-check` route that re-checks `/api/health`, classifies R8 thresholds, and delivers R10's daily automated digest.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-13T17:23:59Z
- **Tasks:** 2
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments
- `lib/observability/alerts.ts` exports `fanOutAlert(subject, html)`, awaiting `getAlertRecipients()` from the Plan-01 config layer and looping `lib/email`'s `sendEmail` once per recipient — no literal address anywhere in the file, verified by `grep -c '@funun' lib/observability/alerts.ts` returning 0.
- A failed or thrown `sendEmail` call for one recipient increments `failed` and never aborts the loop, mirroring `app/api/cron/curator-reach/route.ts`'s per-row resilience.
- `app/api/cron/daily-observability-check/route.ts` copies curator-reach's fail-closed `CRON_SECRET` Bearer check verbatim (including the `!process.env.CRON_SECRET ||` guard that prevents an unset-secret bypass), then builds a digest: re-checks `/api/health` in-process, classifies every `THRESHOLDS` metric via `classifyThreshold` (currently all resolve `unknown` — no live telemetry feed is wired yet, which is the correct "no-data is never silently healthy" behavior, not a bug), and renders a Hobby/Pro-branched `monthly_spend_usd` line before calling `fanOutAlert` exactly once.
- `vercel.json` now registers both crons: the existing weekly `curator-reach` entry and the new `0 6 * * *` daily entry, within Hobby's once-per-day-per-expression ceiling.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extensible alert fan-out helper** - `1826034` (feat)
2. **Task 2: Daily observability cron (R10 automated) + vercel.json entry** - `68f0258` (feat)

_No TDD RED/GREEN split commits — tests were authored alongside each implementation in the same commit per this plan's `tdd="true"` task shape, verified green before committing._

## Files Created/Modified
- `lib/observability/alerts.ts` - `fanOutAlert(subject, html)`, the D-08 extensible fan-out helper
- `lib/observability/alerts.test.ts` - multi-recipient fan-out, one-failure-doesn't-abort, thrown-send, single-default-recipient cases
- `app/api/cron/daily-observability-check/route.ts` - fail-closed daily digest cron (R10)
- `app/api/cron/daily-observability-check/route.test.ts` - 401-unauth, 401-secret-unset, authorized-fan-out, degraded/unknown health, Hobby/Pro spend-line cases
- `vercel.json` - added the daily cron entry, preserved the existing weekly entry

## Decisions Made
- **No live Vercel spend API integration exists anywhere in this codebase** (confirmed by grep across `lib/` and `app/` — no `VERCEL_TOKEN`/spend-API client). Rather than inventing one, the digest's `monthly_spend_usd` line is gated by a self-declared `VERCEL_PLAN_TIER` env var: on `'pro'` it references the Vercel Spend Management dashboard note (citing `SPEND_HEADS_UP_USD` from config); on anything else (including unset, matching STATE.md's confirmed Hobby tier as of 2026-07-06) it emits the "spend detection unavailable on Hobby tier — see docs/observability/VERCEL-ALERTS-RESPONSE.md manual check" note. Neither branch attempts a live API read, satisfying the plan-checker's "never attempt an unavailable API read or hard-fail the digest" note.
- **The digest always fans out on an authorized run** rather than conditionally suppressing when nothing is warning/critical — the daily digest email itself is R10's "something to report" (a heartbeat), matching the plan's `authorized-digest-fans-out` acceptance-criteria naming.
- **Health re-check calls `app/api/health/route.ts`'s `GET()` directly** (same-process function import) rather than an HTTP self-fetch, avoiding base-URL/self-fetch complexity inside a Vercel serverless function; the health route's own never-throw contract is preserved (a rejected/erroring call still resolves the digest to `'unknown'`, never crashing the cron).

## Deviations from Plan

None - plan executed exactly as written, including the plan-checker's already-incorporated Hobby/Pro spend-line clarification.

## Issues Encountered

- Initial `route.test.ts` had a TypeScript error (`Record<string, string>` vs an optional-property object literal) in the `request()` test helper's `Headers` construction; fixed by explicitly typing the headers object before `tsc --noEmit` passed clean. Rule 1 (bug) — trivial, fixed inline before the task commit, no separate commit needed since it was caught before the initial commit.

## User Setup Required

None - no external service configuration required. (`VERCEL_PLAN_TIER` is an optional, self-declared env var the owner may set to `'pro'` after confirming the live Vercel tier via Plan 04's checkpoint; it defaults safely to the Hobby-degraded note when unset.)

## Next Phase Readiness
- `fanOutAlert` is now the single call site every future alert source (SEV routing, threshold-breach alerts, the deferred Observability Admin Dashboard) should use instead of calling `sendEmail` directly.
- The daily cron's threshold section will start surfacing real `warning`/`critical` states as soon as a live telemetry feed (Sentry, Vercel API, or a future ingestion job) supplies values to `classifyThreshold` — no code change needed in this route, only a metric-source wiring addition.
- Plan 04's checkpoint (confirming the live Vercel plan tier) is still pending; once resolved, the owner can set `VERCEL_PLAN_TIER=pro` in the deployment environment if applicable — the route already branches correctly either way.
- No blockers for Plan 08 (thresholds doc) or Plan 09 (k6 baseline), which can now cite `lib/observability/alerts.ts` and this cron as the delivery mechanism for any baseline-driven threshold work.

---
*Phase: 32-production-observability-capacity-incident-readiness*
*Completed: 2026-08-13*

## Self-Check: PASSED

All created files verified present on disk; both task commits (`1826034`, `68f0258`) verified present in git log.
