# Monthly Capacity Report — SAMPLE (format demonstration)

> **⚠️ ILLUSTRATIVE / PLACEHOLDER DATA — NOT REAL MEASUREMENTS.**
> This report demonstrates the required monthly-report **format** only. Plan 09 (the k6
> non-production load harness) has not yet been executed against a staging target — no
> `docs/observability/CAPACITY-REPORT.md` measured baseline exists yet. Every numeric
> value below is a clearly-marked placeholder standing in for what a real run would
> produce. **Do not use any figure on this page for a real capacity decision.** Once
> Plan 09's checkpoint (owner runs k6 against staging + rehearses the abort) is
> complete and `docs/observability/CAPACITY-REPORT.md` exists, this sample should be
> replaced by (or clearly superseded by) the first real monthly report built from that
> measured baseline plus a month of real production traffic.

**Report month:** [PLACEHOLDER — e.g. "2026-09"]
**Prepared by:** Pete (pete@funun.studio) — D-13
**Baseline source:** [PLACEHOLDER — cites `docs/observability/CAPACITY-REPORT.md`'s measured k6 ramp once it exists, plus this month's real Vercel/Supabase dashboard reads]

---

## 1. Traffic

| Metric | Value (PLACEHOLDER) |
|---|---|
| Total requests this month | 1,240,000 *(illustrative)* |
| Unique visitors (approx.) | 8,400 *(illustrative)* |
| Peak day requests | 62,000 *(illustrative)* |

## 2. Peak measured concurrency

| Metric | Value (PLACEHOLDER) |
|---|---|
| Peak measured concurrent VUs (from the k6 ramp, `CAPACITY-REPORT.md`) | 250 *(illustrative — pending real Plan 09 run)* |
| Peak observed production concurrency (approximated from Vercel invocation rate) | ~40 *(illustrative)* |
| Headroom vs. measured constraint | Not yet knowable — depends on the real measured constraint from Plan 09 |

## 3. Latency (p95)

| Route class | p95 (ms, PLACEHOLDER) |
|---|---|
| Public catalogue browse (`/sync/catalog`) | 410 *(illustrative)* |
| Sign-in page load | 280 *(illustrative)* |
| Authenticated dashboard | 650 *(illustrative)* |
| `/api/health` | 90 *(illustrative)* |

Threshold reference: `dynamic_route_p95_ms` warning = 800ms, critical = 2000ms (`lib/observability/config.ts`, `docs/observability/THRESHOLDS-AND-SEVERITY.md`). All placeholder values above are below the warning band — replace with real measured data before drawing any conclusion.

## 4. Error rate

| Metric | Value (PLACEHOLDER) |
|---|---|
| Vercel 5xx rate (monthly average) | 0.2% *(illustrative)* |
| Auth/API 5xx rate | 0.1% *(illustrative)* |
| `FUNCTION_THROTTLED` occurrences this month | 0 *(illustrative)* |

## 5. DB utilization

| Metric | Value (PLACEHOLDER) |
|---|---|
| Supabase CPU (peak) | 35% *(illustrative)* |
| Supabase CPU (average) | 12% *(illustrative)* |
| DB connections (peak) | 18 *(illustrative)* |

## 6. Disk growth

| Metric | Value (PLACEHOLDER) |
|---|---|
| Disk utilization (current) | 22% *(illustrative)* |
| Month-over-month growth | +1.5% *(illustrative)* |
| Projected months to 70% warning band at current growth rate | ~32 months *(illustrative — arithmetic placeholder, not a real projection)* |

## 7. Cost + projection

| Metric | Value (PLACEHOLDER) |
|---|---|
| Vercel spend this month | $0 *(illustrative — Hobby tier per STATE.md as of last confirmed check)* |
| Supabase spend this month | $0 *(illustrative — free tier)* |
| Monitoring spend (Sentry + Better Stack) | $0 *(illustrative — free tiers)* |
| **Combined total** | **$0** *(illustrative)* |
| 90-day projection at current trend | $0–$25/mo *(illustrative — wide placeholder band)* |

## 8. Throttling

| Metric | Value (PLACEHOLDER) |
|---|---|
| Function throttle occurrences | 0 *(illustrative)* |
| Nearest approach to a throttle-triggering rate | Not observed *(illustrative)* |

---

## Capacity-upgrade trigger evaluation (real logic, illustrative inputs)

Per `docs/observability/OPERATING-RHYTHM.md`'s deterministic recommend/hold rule (citing `INFRA_REVIEW_TRIGGER_USD` = $100/mo, D-15, and `SUPABASE_COMPUTE_AUTO_UPGRADE_CEILING_USD` = ~$50/mo, D-14, both from `lib/observability/config.ts`):

- **Combined monthly spend this month (placeholder):** $0
- **Trigger threshold:** $100/mo
- **Recommendation:** **Hold** — placeholder spend ($0) is below the $100 trigger. *(This is the correct application of the real rule to a placeholder number — the rule itself is not illustrative, only the input is.)*

This section demonstrates that the rule is deterministic and boundary-safe (a value one step below $100 holds, at/above $100 recommends a review) — see `docs/observability/OPERATING-RHYTHM.md` for the full boundary table.

## 90-day capacity recommendation

**[PLACEHOLDER — do not act on this]:** Based on illustrative data only, no capacity action is indicated this cycle. A real recommendation requires: (1) Plan 09's k6 harness run against staging producing `docs/observability/CAPACITY-REPORT.md`'s measured constraint, and (2) at least one month of real production traffic/cost data replacing every placeholder value above.

---

*Phase: 32-production-observability-capacity-incident-readiness*
*Plan: 32-10*
*Status: SAMPLE / FORMAT DEMONSTRATION ONLY — see warning banner above*
