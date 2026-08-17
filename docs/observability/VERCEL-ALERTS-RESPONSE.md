# Vercel Alerts — Signal-to-Response Table

**Source of truth for numeric thresholds:** `lib/observability/config.ts` (`THRESHOLDS`, `SPEND_HEADS_UP_USD`) and its human-readable projection `docs/observability/THRESHOLDS-AND-SEVERITY.md`. This document does not invent parallel numbers — where a signal has an app-level threshold, the value is cited from `config.ts` by metric name. Where a signal is a native Vercel usage-percentage tier with no app-level entry (function invocations, edge requests, bandwidth), the trigger is Vercel's own 50/75/100%-of-plan usage-notification tiers (D-09).

This document satisfies SPEC R1's acceptance criteria: a written table mapping every Vercel warning to an owner and a documented operating response, with `FUNCTION_THROTTLED` marked as an urgent event with a defined action. It is the target of `app/api/cron/daily-observability-check/route.ts`'s `DOC_PATH` constant — the daily digest cron references this file by path for the human-facing procedure that its own automated summary cannot fully replace.

**Owner (all signals, D-13):** Pete — `pete@funun.studio`. No dedicated backup owner exists yet (single-owner risk, documented in `THRESHOLDS-AND-SEVERITY.md`).

---

## 0. Plan tier status — CONFIRMED PRO (2026-08-16)

**Live tier:** **Pro Plan — Active** (confirmed against the Vercel billing dashboard, 2026-08-16). Supersedes the earlier "Hobby" note (Phase 14 / an earlier checkpoint answer that turned out wrong).

**Configured (32-04 Task 2):** Spend Management is live — **On-Demand Budget $200 USD, notify-only**, with **"Pause production deployment" OFF** (D-07 — a spend cap must never take production down). Personal notifications (Team Settings → My Notifications): **Email + Web ON** for **Usage → "75% of included credit"** and **Team → Spend Management**.

**Open items:**
- **Notification email — owner decision 2026-08-16:** left as the owner's personal Vercel account address (`peter.zora@gmail.com`) for now. **Revisit as the team grows** — add a shared IT/ops account (a `funun.studio` ops inbox/group) as a Vercel team member so alerts reach on-call rather than one person's inbox. Tracked as a todo, and an input to the access-model / RBAC discussion (the "IT team member" role).
- Set the env var **`VERCEL_PLAN_TIER=pro`** on the Vercel project so the daily digest cron (`app/api/cron/daily-observability-check/route.ts` → `isProTier()`) switches its `monthly_spend_usd` line to the Spend-Management (Pro) branch instead of the "spend detection unavailable on Hobby tier" fallback.

Vercel's actual usage alert is a single **"75% of included credit"** threshold (not a configurable 50/75/100% — an earlier draft assumed the latter).

---

## 1. Signal → owner → response table

| Signal | Read location (Vercel dashboard) | Warning trigger | Critical trigger | Owner | Documented operating response |
|---|---|---|---|---|---|
| 5xx error rate | Settings → Observability → Errors | `vercel_5xx_rate` warning = 1% (5-min rolling window) | `vercel_5xx_rate` critical = 5% | Pete | Warning: check `/api/health` status and the most recent deploy for a correlated release; note in the weekly review if isolated. Critical: treat as SEV-2 minimum (SEV-1 if correlated with an outage) — open the Errors tab, identify the failing route(s), check whether the previous deploy is the cause, and consider a rollback per the incident runbook. |
| Dynamic-route p95 latency | Settings → Observability → Latency | `dynamic_route_p95_ms` warning = 800ms (5-min rolling window) | `dynamic_route_p95_ms` critical = 2000ms | Pete | Warning: note the affected route(s); check for a recent deploy or an upstream Supabase slow-query correlation (cross-reference `SUPABASE-HEALTH-REVIEW.md` §1). Critical: SEV-2 — investigate immediately; slow responses at this level are user-visible degradation, not just a metrics blip. |
| Function invocations (volume) | Settings → Usage → Functions | Vercel native usage notification at 50% of plan quota | Vercel native usage notification at 75% / 100% of plan quota (D-09) | Pete | 50%: informational, no action. 75%: review whether invocation growth is organic (traffic growth — good) or a bug (a route looping/retrying — bad); check the Functions tab for an unexpected spike pattern. 100%: treat as urgent — invocations at plan ceiling risk `FUNCTION_THROTTLED` (see below); same-day investigation. |
| Function duration (execution time) | Settings → Observability → Functions | No app-level `config.ts` entry (informational signal, not independently alerted) | — | Pete | Reviewed during the weekly operating-rhythm pass (R10) as a leading indicator: rising average/p95 duration often precedes both `dynamic_route_p95_ms` degradation and increased throttle risk. Investigate any route whose duration trend rises sharply between two weekly reviews, even without crossing a hard threshold. |
| `FUNCTION_THROTTLED` | Settings → Observability → Functions (and the daily digest cron, `app/api/cron/daily-observability-check/route.ts`) | `function_throttle` warning = 1 occurrence (5-min rolling window) | `function_throttle` critical = 5 occurrences | Pete | **URGENT — same-day action regardless of occurrence count.** A single throttle already meets the warning band (see `THRESHOLDS-AND-SEVERITY.md` §1: "treat any throttle occurrence as worth same-day attention even before it reaches 5 occurrences"). Defined action: (1) confirm via the Functions tab which route(s) were throttled and at what volume; (2) check whether this correlates with a genuine traffic spike (good problem — plan a Pro-tier upgrade conversation) or a runaway/looping caller (bug — fix and redeploy); (3) do **not** restate Vercel's ~30,000 concurrent-Function figure as a simultaneous-user capacity guarantee — throttling is the platform's own signal that the real ceiling has been reached, which is more authoritative than that marketing number (SPEC R7/R10 prohibition). Treat sustained throttling as SEV-1 (platform actively rate-limiting the app) per `THRESHOLDS-AND-SEVERITY.md`'s SEV mapping. |
| Edge requests | Settings → Usage → Edge Requests | Vercel native usage notification at 50/75/100% of plan quota | — | Pete | Same posture as function invocations: 50% informational, 75% investigate cause, 100% same-day review for bot/scraper traffic or an unexpected client-side polling loop. |
| Bandwidth | Settings → Usage → Bandwidth | Vercel native usage notification at 50/75/100% of plan quota | — | Pete | 50% informational. 75%: check for an unoptimized asset (e.g. an uncompressed audio/artwork upload path) or a hotlinking pattern. 100%: same-day review — bandwidth overage carries direct cost exposure; cross-reference the monthly-spend row below. |
| Usage notifications (overall, 50/75/100% of plan) | My Notifications (account-level) → Usage | Enabled at 50/75/100% per Task 2 of `32-04-PLAN.md` (deferred — see §0) | — | Pete | Delivery destination: `pete@funun.studio` (D-08). Each threshold crossing is an informational-to-urgent escalation per the specific signal it fires on above (invocations/requests/bandwidth) — this row documents the account-level notification mechanism itself, not a distinct signal. |
| Monthly spend (Vercel + Supabase + monitoring, combined) | Vercel Spend Management dashboard (Pro-only, §0) + Supabase billing page | `monthly_spend_usd` warning = $75 | `monthly_spend_usd` critical = $100 (same figure as `SPEND_HEADS_UP_USD` / `INFRA_REVIEW_TRIGGER_USD` in `config.ts`, and D-09/D-15's infra-review trigger) | Pete | Warning ($75): note in the weekly review; no action required yet. Critical ($100): flags a mandatory capacity/pricing review (D-15) — Pete reviews usage against plan tiers and decides whether to upgrade, optimize, or hold. **Spend Management's "Pause production deployment" toggle is left OFF (D-07) — this is a notify-only posture. Production is never automatically paused on spend, and this must not change without a separate, explicit owner decision.** |

---

## 2. Notification destination and configuration status

- **Destination:** `pete@funun.studio` (D-08). Slack fan-out is planned for later once the workspace exists; the alert-recipient list is deliberately extensible (see `lib/observability/config.ts`'s `getAlertRecipients()` / `observability_recipients` table, D-08/D-10) rather than a hardcoded single sink.
- **Configuration status:** Usage notifications (50/75/100%), Spend Management (if Pro), and the forced test-notification delivery are **not yet configured in the live Vercel dashboard** as of this draft. That work is `32-04-PLAN.md` Task 1 (tier confirmation) and Task 2 (notification setup + forced test), both deferred per the owner's draft-first request — see `32-04-DRAFT.md`. This document is complete and ready to guide that configuration once the owner runs it; it does not itself assert the configuration is live.

## 3. No-auto-pause / no-auto-compute-change posture

Per D-07 and the phase's Prohibitions: this phase **must not** automatically pause production or automatically change infrastructure spend/compute in response to any signal above. Every response in §1 is an owner-executed, judgment-based action — none of it is wired to an automated pause, throttle-response, or scaling action in application code. The only toggle capable of an automatic pause (Vercel Spend Management's "Pause production deployment") is explicitly left **OFF**. Any future change to this posture requires a separate, explicit owner decision — it is not something an alert response document can authorize on its own.

---
*Phase: 32-production-observability-capacity-incident-readiness*
*Plan: 32-04*
