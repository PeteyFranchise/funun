# Operating Rhythm

**Owner (all cadences):** Pete — pete@funun.studio (D-13). No dedicated backup owner yet (single-owner risk, flagged in `docs/observability/THRESHOLDS-AND-SEVERITY.md`); additional owners are added later via the D-10 config layer (`lib/observability/config.ts`'s `observability_recipients` table) without a redeploy.

This is the founder-scale process wrapper that keeps the monitoring system in routine use (R10) — "a system nobody uses is a failure condition." Four cadences: daily automated, weekly manual review, pre-launch checklist, and monthly capacity report.

> **DRAFT STATUS:** This document is drafted ahead of the Task 3 tabletop checkpoint. The owner still needs to confirm the named cadence is workable in practice (see `32-10-DRAFT.md`).

---

## 1. Daily (automated) — owner: Pete

**What runs automatically:** `app/api/cron/daily-observability-check/route.ts`, scheduled via `vercel.json`'s `0 6 * * *` cron entry (Plan 05), fires every day at 06:00 UTC. It:
- Re-checks `/api/health` in-process and reports `healthy` / `degraded` / `unknown`.
- Classifies every `THRESHOLDS` metric in `lib/observability/config.ts` via `classifyThreshold()` (currently `unknown` until a live telemetry feed is wired — a monitoring gap is reported as `unknown`, never silently `healthy`).
- Renders a Hobby/Pro-branched spend line (no live Vercel spend API exists in this codebase; the line degrades to a manual-check note on Hobby tier).
- Fans the digest out via `lib/observability/alerts.ts`'s `fanOutAlert()` to the growable recipient list (currently Pete only) every authorized run — the daily email is itself the heartbeat.

**Owner action:** Read the daily digest email. No action required on a clean day; on a `warning`/`critical`/`degraded` line, follow the relevant row in `docs/observability/THRESHOLDS-AND-SEVERITY.md`'s SEV mapping.

---

## 2. Weekly (~10-minute Vercel + Supabase review) — owner: Pete

A short, deliberately time-boxed manual review — not a deep audit. Run it the same day each week (owner's choice of day).

**Checklist:**
1. **Vercel dashboard** (~4 min): Observability → Errors (5xx trend), Functions (any `FUNCTION_THROTTLED` occurrences — always urgent, per R1/`THRESHOLDS-AND-SEVERITY.md`), Latency (dynamic-route p95 trend), Bandwidth/usage against plan tier.
2. **Supabase dashboard** (~4 min): Database → Reports (CPU, memory, connections, disk trend), Auth logs (failure rate), API logs (5xx trend), Query Performance Advisor (new slow-query findings).
3. **Trend recording** (~2 min): Note this week's read against last week's in a running log (a simple dated entry is sufficient — date, Vercel 5xx%, p95, Supabase CPU%, disk%, connections, any throttle occurrences). This is what makes "trend" visible over time rather than a series of disconnected snapshots.

**Owner action:** If any signal crossed into `warning` or `critical` (per the thresholds table in `docs/observability/THRESHOLDS-AND-SEVERITY.md`), follow the corresponding SEV response. Otherwise, log the trend entry and move on.

---

## 3. Pre-launch checklist — owner: Pete

Run before any major launch or invite batch (a step change in expected traffic).

1. **Run the load-test profile** — `k6 run scripts/load/run-ramp.js` (Plan 09) against the non-prod staging target, confirming the ramp completes (or correctly aborts) and the capacity report reflects current code.
2. **Review slow queries** — Supabase Query Performance Advisor, address or explicitly defer any new outliers surfaced since the last review.
3. **Confirm capacity headroom** — compare current traffic + the latest capacity report against the measured constraint (see `docs/observability/CAPACITY-REPORT.md` once Plan 09 lands); confirm headroom exists for the expected launch traffic bump.
4. **Verify alert delivery** — trigger a forced test notification (Vercel usage alert test, or a deliberate `/api/health` degrade in staging) and confirm it's received on the configured channel.
5. **Name the release + rollback owner** — for this specific launch, confirm who is watching the deploy and who executes the rollback decision (Section 3 of `docs/observability/RUNBOOK.md`) if needed. Default: Pete, unless explicitly delegated.

---

## 4. Monthly capacity report — owner: Pete

Once a month, produce a capacity report using the format demonstrated in `docs/observability/monthly-capacity-report-sample.md`: traffic, peak measured concurrency, p95, error rate, DB utilization, disk growth, cost + projection, and throttling — citing measured evidence (the k6 capacity baseline, `docs/observability/CAPACITY-REPORT.md`, and the intervening month's real traffic), never the Vercel ~30,000 Function-execution figure as a simultaneous-user capacity claim. The report closes with a 90-day capacity recommendation.

### Capacity-upgrade trigger (measurable, deterministic)

The trigger is the same combined-spend figure already defined in `lib/observability/config.ts` and documented in `docs/observability/THRESHOLDS-AND-SEVERITY.md`:

- **`INFRA_REVIEW_TRIGGER_USD` = $100/mo** (D-15) — combined Vercel + Supabase + monitoring spend. Crossing $100/mo triggers a capacity/pricing review.
- **`SUPABASE_COMPUTE_AUTO_UPGRADE_CEILING_USD` = ~$50/mo** (D-14) — the first Supabase compute-tier bump is pre-authorized by the owner up to this figure; anything above requires explicit owner approval before it is made (no code in this phase auto-triggers a compute change — this is advisory/documentation only, matching the phase's prohibition on automatic Supabase compute changes).

**Deterministic recommend/hold rule**, evaluated against the current month's total infra spend read from the same source `THRESHOLDS.monthly_spend_usd` classifies against:

| Combined monthly spend | One step below ($99) | At trigger ($100) | One step above ($101) |
|---|---|---|---|
| **Recommendation** | **Hold** — spend is below the review trigger; no action required beyond the standard monthly report. | **Recommend** — the trigger is met; the report MUST flag a capacity/pricing review this cycle (matches `classifyThreshold`'s "value exactly at the threshold resolves to the higher band" rule). | **Recommend** — same as at-trigger; the review is already overdue if this is the second consecutive month above $100. |

This mirrors the boundary-resolution rule already established for `monthly_spend_usd` in `lib/observability/config.ts`/`classifyThreshold()`: a value strictly below `$100` is `healthy`/hold, a value at or above `$100` is `critical`/recommend — non-overlapping, and a value one step either side of the threshold always resolves deterministically. If the recommendation is "recommend," the owner reviews usage against current plan tiers and decides to upgrade, optimize, or hold — this report never auto-upgrades anything.

### After every incident

Per `docs/observability/RUNBOOK.md` Section 7, the post-incident review is completed for every SEV-1/SEV-2 incident, and any detection gap identified there is either closed (a new alert/threshold added immediately) or explicitly tracked as a follow-up with an owner and due date — never left silently open.

---

*Phase: 32-production-observability-capacity-incident-readiness*
*Plan: 32-10*
