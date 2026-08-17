---
created: 2026-08-17T06:30:00Z
title: Observability Dashboard v2 — wire live metrics + charts (future phase)
area: observability
files:
  - (future) app/(admin)/observability  OR  the IT Playbook "Monitoring Dashboard" page
  - lib/observability/config.ts (classifyThreshold target)
  - app/api/cron/daily-observability-check/route.ts (currently reports `unknown` until telemetry wired)
---

## Status
Owner decision 2026-08-17: build the Observability Admin Dashboard **v1 = single pane of glass**
(aggregate live `/api/health` + Better Stack uptime + the daily digest + thresholds/severity + the
vendor directory + deep links; **no new vendor-API integration**). Then **v2 = its own future phase**
that wires **live metrics + charts**.

## v2 scope (future GSD phase — discuss → plan → execute)
Pull live numbers into in-app charts — a telemetry integration per vendor:
- **Vercel** — 5xx rate, dynamic-route p95 latency, function invocations/throttles (Vercel API / Observability).
- **Supabase** — CPU, memory, connections, disk, slow queries (Supabase API / reports).
- **Sentry** — error counts / new-issue rate (Sentry API).
Feed these into `classifyThreshold()` so the digest + dashboard show **real bands** instead of `unknown`,
and render sparklines/trend charts. Rolls out after v1 proves useful.

Ties to: `docs/observability/VENDOR-DIRECTORY.md`, `docs/observability/THRESHOLDS-AND-SEVERITY.md`,
the v1 dashboard, and the Team-Member RBAC brief (who sees it: IT + leadership).
