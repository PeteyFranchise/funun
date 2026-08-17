# Uptime Monitoring (R3)

Independent, externally-hosted uptime monitoring for Funūn production, provisioned in Better Stack (D-05). This document is the source of truth for what is monitored, how, and why — it does not require any Funūn code, since the monitor runs entirely on Better Stack's infrastructure.

## Why external, not Vercel-internal

A check that runs on Vercel (a cron job, a serverless function, an internal health ping) shares Vercel's own infrastructure. If Vercel itself has a platform-wide outage, a Vercel-hosted checker goes down *with* the thing it's supposed to be watching — it cannot report its own outage. R3 exists specifically to observe production from **outside** Funūn's infrastructure, so a Vercel-wide incident is still detected and alerted on.

Better Stack is a separately-hosted, independent monitoring provider: it polls the public production routes exactly as any outside visitor would, over the open internet, with no dependency on Vercel's runtime being healthy.

## Monitored routes

Four production routes are polled by Better Stack:

| # | Route | Purpose |
|---|-------|---------|
| 1 | `https://www.funun.studio/` | Marketing/landing root — confirms the app is reachable at all |
| 2 | `https://www.funun.studio/signin` | Auth entry point — confirms the auth surface is up |
| 3 | `https://www.funun.studio/sync/catalog` | Buyer-facing catalogue browse — confirms the core buyer flow is up |
| 4 | `https://www.funun.studio/api/health` | Dedicated health-check API (Plan 03) — confirms app + DB connectivity, not just page rendering |

## Check interval (D-05)

Better Stack's **free tier** polls each monitor at a **3-minute interval**. This is a deliberate, documented relaxation of the SPEC's 1–2 minute target — the free tier does not offer sub-3-minute checks.

**Pre-launch upgrade trigger:** before a major launch or invite batch, upgrade to Better Stack's paid tier (~$25/mo) to drop the interval to 1 minute, tightening detection time ahead of a traffic spike where outages are costlier. Until that trigger is hit, 3 minutes is the accepted interval.

## Alerting: consecutive-failure rule

Alerts require **2–3 consecutive failures** before firing, not a single failed check. This avoids false-positive alerts from a single transient network blip while still catching a real outage quickly.

- A deliberately-failing check (e.g. pointed at a guaranteed-404 or unreachable path) must produce a delivered alert **after** the configured consecutive-failure count is reached — on the Nth failure, not the (N−1)th.
- A single failure immediately followed by a recovery (failure → success) does **not** alert. Only a sustained run of consecutive failures crosses the threshold.
- An unreachable target — DNS failure, connection timeout, zero response — always counts as a **failure**. It is never treated as "unknown" or silently skipped; Better Stack's check semantics resolve any non-response to a failed check, keeping the failure count moving toward the alert threshold.

Alert destination and severity routing (which SEV the alert maps to, who is notified, escalation/ack expectations) are defined once in the shared alert-recipient/SEV config rather than restated here — see `lib/observability/config.ts` (Plan 01, `getAlertRecipients()`) and `docs/observability/THRESHOLDS-AND-SEVERITY.md` (Plan 08) for the SEV-1..4 model and owners.

## `/api/health` monitor: 503-as-down

`/api/health` (`app/api/health/route.ts`, Plan 03) has an explicit status-code contract:

- `200` — healthy (a single cheap read-only Supabase check succeeded within the timeout budget)
- `503` — degraded (the Supabase check failed, timed out, or threw)

The route deliberately never returns an unhandled `500` — every failure path is caught and reported as a handled `503` instead. The Better Stack monitor for `/api/health` is configured as a **status-code check** that treats `200` as up and treats `503` (degraded) as down, matching this contract exactly. This means Better Stack's alerting fires on the same "degraded" signal the Plan 03 health route was built to expose, not just on total unreachability.

## Public status page

A public status page is enabled in Better Stack (e.g. `status.funun.studio`) surfacing up/down state and response time for the four monitored routes. It is buyer-facing: it shows only up/down + response-time, never internal error detail (the `/api/health` response body is already minimal and secret-safe per Plan 03, so a status-page probe reveals nothing sensitive — see threat T-32-11 in the Plan 07 threat register).

**Status page URL:** _to be recorded once the owner enables it in Better Stack (see Task 1 checkpoint)._

## Summary

| Aspect | Value |
|--------|-------|
| Provider | Better Stack (D-05) |
| Monitored routes | `/`, `/signin`, `/sync/catalog`, `/api/health` |
| Check interval | 3 min (free tier) → 1 min (paid, ~$25/mo) before major launch/invite batch |
| Alert threshold | 2–3 consecutive failures |
| Unreachable target | Always counts as a failure, never "unknown" |
| `/api/health` semantics | Status-code check: 200 = up, 503 = down |
| Public status page | Enabled (URL recorded once live) |
| Alert routing | See `lib/observability/config.ts` + `docs/observability/THRESHOLDS-AND-SEVERITY.md` |
