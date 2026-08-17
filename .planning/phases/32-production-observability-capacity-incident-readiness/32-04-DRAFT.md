# Phase 32 Plan 04: Vercel Alerts & Supabase Health Review — DRAFT

**Mode:** Draft-first (owner requested drafting automatable artifacts before external Vercel dashboard setup). This is **not** a completion summary — Plan 04 is not done. Do not advance STATE.md/ROADMAP.md progress for 32-04 from this file.

## Drafted (committed)

- `docs/observability/VERCEL-ALERTS-RESPONSE.md` (commit `2e840b3`) — Vercel signal → owner → response table. Covers 5xx rate, dynamic-route p95 latency, function invocations, function duration, `FUNCTION_THROTTLED` (marked URGENT with a defined action), edge requests, bandwidth, usage notifications (50/75/100%), and monthly spend. Cites `lib/observability/config.ts` `THRESHOLDS`/`SPEND_HEADS_UP_USD` as the numeric source of truth. States the Spend Management "Pause production deployment" toggle is OFF (D-07) and documents both the Hobby-fallback and Pro paths since the live plan tier is not yet reconfirmed. This is the file `app/api/cron/daily-observability-check/route.ts`'s `DOC_PATH` constant points to.
- `docs/observability/SUPABASE-HEALTH-REVIEW.md` (commit `2e840b3`) — Supabase metric → read-location → trigger checklist. Covers DB CPU, memory, active connections, service connection distribution (PostgREST/Auth/Storage), disk utilization + growth, IOPS, API errors/latency, Auth failures/anomalies, slow/outlier queries, lock contention, long-running queries, and Query Performance Advisor findings. Pooler-utilization rows marked N/A with reason ("HTTP/Data-API-only; no direct-Postgres traffic confirmed") per the SPEC's own scoping rule. Cites the D-14 ~$50/mo Supabase compute auto-upgrade ceiling at each compute-upgrade decision point. States Supabase Reports/Advisor is review-only (no native alert-config surface assumed) and instructs a live re-check.

Both docs verified against the plan's automated gate (`test -f` + grep checks) — PASS.

## Deferred — needs owner

The following require the owner to act directly in the Vercel dashboard; they were intentionally skipped in this draft-first pass and are **not** auto-approvable:

1. **Confirm the live Vercel plan tier (Hobby or Pro)** — Settings → Billing/Usage. Last recorded as Hobby (STATE.md, 2026-07-06); this must be reconfirmed before Spend Management configuration (which is Pro-only) can proceed. This is `32-04-PLAN.md` Task 1.
2. **Enable Vercel Usage notifications** at 50/75/100% of plan quota (My Notifications).
3. **If Pro:** enable Spend Management with a **$100** threshold (D-09), and leave **"Pause production deployment" OFF** (D-07) — notify-only, no auto-pause.
4. **Set the notification destination to `pete@funun.studio`** (D-08).
5. **Send a forced test notification** and confirm it is received at `pete@funun.studio` — this is the R1 acceptance criterion ("a forced test notification is verified received on the chosen channel").

This is `32-04-PLAN.md` Task 2, gated on Task 1's answer.

## Not done in this pass

- No `32-04-SUMMARY.md` was written (plan is incomplete).
- No changes to `.planning/STATE.md`, `.planning/ROADMAP.md`, or `.planning/REQUIREMENTS.md`.
- No npm packages installed.
- Tasks 1 and 2 (both `checkpoint:human-verify` / `checkpoint:human-action`) remain open. Resume the plan by picking up at Task 1 once the owner is ready to work through the Vercel dashboard.

---
*Phase: 32-production-observability-capacity-incident-readiness*
*Plan: 32-04*
*Draft produced: 2026-08-16*
