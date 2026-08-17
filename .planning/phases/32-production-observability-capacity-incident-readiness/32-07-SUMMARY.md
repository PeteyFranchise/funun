---
phase: 32-production-observability-capacity-incident-readiness
plan: 07
subsystem: observability
tags: [better-stack, uptime, status-page, ops]

# Dependency graph
requires: [32-03]
provides:
  - "docs/observability/UPTIME-MONITORING.md — Better Stack uptime setup source-of-truth"
  - "Live external uptime monitoring (Better Stack) on Funūn production + a public status page"
affects: []

key-files:
  created:
    - docs/observability/UPTIME-MONITORING.md
  modified: []

key-decisions:
  - "Independent external uptime monitoring stood up in Better Stack (D-05) on the shared it@funun.studio account (account owner + alert destination). 3 monitors live: funun.studio, /signin, /sync/catalog — apex (not www), 3-min interval, Confirmation period 3 min (alert after 2 consecutive failures), 4 regions."
  - "Alert pipeline verified end-to-end: monitor → alert → email → it@funun.studio → inbox (delivered test alert confirmed)."
  - "Public status page LIVE at https://funun.betteruptime.com (the 3 monitors, each with status history). Custom status.funun.studio domain deferred (DNS CNAME)."
  - "The 4th monitored route (/api/health) is DEFERRED until this branch deploys — the route ships in Phase 32 on feat/lane1-catalogue-menu-help and isn't on production yet; add it as a 503-as-down status-code check post-deploy."

requirements-completed: [R3]

coverage:
  - id: D1
    description: "Independent, externally-hosted uptime monitoring polls production from outside Funūn's infra, alerts on sustained failure, and surfaces a public status page — so a Vercel-wide outage is still detected."
    requirement: "R3"
    verification:
      - kind: manual
        ref: "owner stood up 3 Better Stack monitors (all green) + status page (funun.betteruptime.com) + verified test-alert delivery to it@funun.studio, 2026-08-16"
        status: pass
    human_judgment: true

duration: interactive (owner-guided)
completed: 2026-08-16
status: complete
---

# Phase 32 Plan 07: External Uptime Monitoring (Better Stack) Summary

**Independent Better Stack uptime monitoring stood up on Funūn production (3 monitors, apex, 3-min/2-failure alerting, 4 regions) with a verified alert pipeline to it@funun.studio and a live public status page — executed owner-guided.**

## Accomplishments
- **Better Stack account** created on the shared **`it@funun.studio`** identity (account owner + single alert destination — the consolidated-vendor-inbox model).
- **3 monitors live + green** (Task 1): `funun.studio`, `/signin`, `/sync/catalog` — apex host, 3-min interval, **Confirmation period 3 min** (alerts only after 2 consecutive failures — no single-blip noise), SSL/TLS check on, 4 regions.
- **Alert pipeline verified**: sent a test alert → delivered to `it@funun.studio` inbox. The onboarding "Sample incident" was resolved.
- **Public status page LIVE**: `https://funun.betteruptime.com` (the 3 monitors, each with status history).
- **Task 2 (docs)**: `docs/observability/UPTIME-MONITORING.md` drafted then updated with the live URL, the apex-not-www reconciliation, and the confirmed config.

## Deviations / adjustments
- Ran **draft-first** (doc) then **owner-guided** (the Task-1 Better Stack setup).
- Drafted doc assumed **`www.funun.studio`**; actual monitors use the **apex `funun.studio`** (resolves Up, follow-redirects on) — reconciled in the doc.
- Drafted "status.funun.studio" → actual default is **`funun.betteruptime.com`**; custom domain deferred.

## Open follow-ups (non-blocking)
1. **`/api/health` monitor** — add it (as a 503-as-down status-code check) **after this branch deploys** (the health route isn't on production yet).
2. **Custom status-page domain** `status.funun.studio` — optional DNS-CNAME follow-up.

## Next Phase Readiness
External uptime monitoring + status page are live. Supersedes `32-07-DRAFT.md`.

---
*Completed: 2026-08-16 (owner-guided)*

## Self-Check: PASSED
- FOUND: docs/observability/UPTIME-MONITORING.md
- CONFIRMED: 3 Better Stack monitors live/green + status page (funun.betteruptime.com) + test-alert delivery to it@funun.studio (2026-08-16)
