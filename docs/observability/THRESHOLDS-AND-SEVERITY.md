# Thresholds & Severity Model

**Source of truth:** `lib/observability/config.ts` — `THRESHOLDS`, `classifyThreshold()`, `SEVERITY_LABELS`, and the budget constants (`SPEND_HEADS_UP_USD`, `SUPABASE_COMPUTE_AUTO_UPGRADE_CEILING_USD`, `INFRA_REVIEW_TRIGGER_USD`). Every number in this document is a human-readable projection of that module. **Do not invent parallel numbers here** — if a value needs to change, change it in `config.ts` first and update this doc to match.

This doc satisfies SPEC R8: a written threshold + owner for every monitored signal, and a complete SEV-1..SEV-4 severity model. It is consumed by the incident runbook (Plan 10) and the daily/weekly/monthly operating rhythm (Plan 10).

---

## 1. Thresholds table

All bands below are seeded from the SPEC's proposed values and currently carry `provisional: true` in `config.ts`. The **baseline-adjusted** column stays "provisional — pending Plan 09 k6 baseline" until Plan 09's non-production load test produces measured latency/error/resource data; at that point the owner reviews each row, updates `config.ts`, flips `provisional` to `false`, and this doc's baseline-adjusted column is filled in with the validated number (or "confirmed as proposed" if the load test doesn't move it).

| Signal | Proposed warning | Proposed critical | Baseline-adjusted | Window / rounding | Read location |
|---|---|---|---|---|---|
| Vercel 5xx rate | 1% | 5% | provisional — pending Plan 09 k6 baseline | 5-minute rolling window, % of requests | Vercel dashboard → Observability → Errors |
| Function throttles (`FUNCTION_THROTTLED`) | 1 occurrence | 5 occurrences | provisional — pending Plan 09 k6 baseline | 5-minute rolling window, occurrence count | Vercel dashboard → Observability → Functions (and the daily digest cron, Plan 05) |
| Dynamic-route p95 latency | 800ms | 2000ms | provisional — pending Plan 09 k6 baseline | 5-minute rolling window, p95 latency (ms) | Vercel dashboard → Observability → Latency |
| Supabase CPU | 70% | 90% | provisional — pending Plan 09 k6 baseline | 5-minute rolling window, % CPU | Supabase dashboard → Project → Database → Reports |
| DB connections | 50 | 70 | provisional — pending Plan 09 k6 baseline | Point-in-time count (no window) | Supabase dashboard → Project → Database → Reports |
| Disk utilization | 70% | 85% | provisional — pending Plan 09 k6 baseline | Point-in-time (no window) | Supabase dashboard → Project → Database → Reports |
| Auth/API 5xx rate | 1% | 5% | provisional — pending Plan 09 k6 baseline | 5-minute rolling window, % of requests | Supabase dashboard → Project → Auth / API Logs |
| External-uptime consecutive failures | 2 consecutive | 3 consecutive | provisional — pending Plan 09 k6 baseline | Point-in-time count per check interval (no rolling window; matches D-05, "alert after 2-3 consecutive failures") | Uptime provider dashboard (Better Stack or equivalent, R3) |
| Monthly spend (USD) | $75 | $100 | provisional — pending Plan 09 k6 baseline | Point-in-time (no window); mirrors D-09/D-15's $100 infra-review trigger and Vercel's own 75%-of-plan usage-alert tier | Vercel Spend Management dashboard + Supabase billing page |

### Resolution rules (must be read alongside the table above)

These rules are the human-readable statement of `classifyThreshold()` in `lib/observability/config.ts`. Bands are **non-overlapping** — every value maps to exactly one status, never two, never zero:

- **No data → `unknown`.** A metric with a `null`/`undefined`/unreadable value is reported as **unknown**, never silently reported as `healthy`. A monitoring gap is not the same thing as a clean bill of health.
- **Value below `warning` → `healthy`.**
- **Value exactly at `warning`, or between `warning` and `critical` → `warning`.** A value exactly at the warning threshold resolves to `warning`, not `healthy` — the boundary belongs to the higher band. This is the "value exactly at a threshold resolves to one documented severity" rule from SPEC R8.
- **Value exactly at `critical`, or above `critical` → `critical`.** Same boundary rule: the critical threshold itself is already critical, not still warning.
- **One step either side of any threshold** therefore always resolves deterministically: `warning − 1` is `healthy`, `warning` is `warning`, `critical − 1` is `warning`, `critical` is `critical`. No value falls into a gap or an overlap.

For rate/percentile metrics (5xx rate, p95 latency, CPU%) the stated **window** is the measurement basis for the value being classified — e.g. "1% Vercel 5xx rate" means 1% measured over the trailing 5-minute rolling window, not a single-request spike. Point-in-time metrics (connections, disk%, throttle occurrence count, spend, uptime consecutive-failure count) have no rolling window; the raw current reading is classified directly.

`FUNCTION_THROTTLED` is documented as **urgent** (cross-ref R1): a single throttle occurrence already meets the `warning` band, and repeated throttling within the 5-minute window is a `critical`-band signal that the app is being rate-limited by the platform — treat any throttle occurrence as worth same-day attention even before it reaches 5 occurrences.

---

## 2. SEV-1..SEV-4 severity model

Severity labels and definitions are defined once in `lib/observability/config.ts` (`SEVERITY_LABELS`). The table below adds the operational fields (channel, owners, ack, escalation, resolution) that `config.ts` does not encode, because those are process, not code.

| Field | SEV-1 — Critical (production down or data at risk) | SEV-2 — Major (significant degradation) | SEV-3 — Minor (limited impact) | SEV-4 — Cosmetic (no user impact) |
|---|---|---|---|---|
| **Notification channel** | Email to the full config recipient list (`getAlertRecipients()`, currently `pete@funun.studio`); Slack fan-out added later once the workspace exists (D-08) | Email to the full config recipient list; Slack fan-out later (D-08) | Email to the full config recipient list | Logged/noted in the weekly operating-rhythm review only — no immediate page |
| **Primary owner** | Pete (pete@funun.studio) — D-13 | Pete (pete@funun.studio) — D-13 | Pete (pete@funun.studio) — D-13 | Pete (pete@funun.studio) — D-13 |
| **Backup owner** | TBD — no dedicated backup yet; single-owner risk noted per D-13. Added later via the `observability_recipients` table (D-10 config layer) without a redeploy. | TBD — same as SEV-1 | TBD — same as SEV-1 | TBD — same as SEV-1 |
| **Acknowledgement expectation** | Immediate — as soon as the alert is seen (founder-scale single-owner system; no formal on-call rotation exists yet) | Same business day | Within 2-3 business days (next planned check-in) | No ack required; batched into the weekly review |
| **Escalation rule** | No backup owner exists yet, so there is no automated escalation path — this is the single-owner risk this doc and D-13 explicitly flag. If Pete is unreachable, the recipient list (extensible per D-08) is the only fallback until a backup owner is added. | Same as SEV-1 (no backup path yet) | N/A — handled at next normal check-in, no escalation | N/A |
| **Resolution criteria** | Root cause identified and mitigated, or the affected system is confirmed back to `healthy`/normal status per the thresholds table above; post-incident note added per the runbook (Plan 10), which references (not duplicates) `docs/BREAK-GLASS.md` | Metric confirmed back below the `warning` threshold, or a documented mitigation plan is in place with an owner and a target date | Noted, triaged, and either fixed or explicitly deferred with a reason | Noted; no formal close-out required |

### SEV mapping — representative threshold breaches

- **SEV-1** — Production down (site unreachable, `/api/health` failing hard, DB unreachable), sustained `FUNCTION_THROTTLED` (platform actively rate-limiting the app), or any event that puts user/business data at risk (e.g. a data-integrity or security incident).
- **SEV-2** — Any signal in the table above crossing into its **critical** band (5xx rate ≥5%, p95 ≥2000ms, Supabase CPU ≥90%, DB connections ≥70, disk ≥85%, Auth/API 5xx ≥5%, 3+ consecutive uptime failures) without full production outage.
- **SEV-3** — Any signal crossing into its **warning** band (the boundary value itself included, per the resolution rules above) without reaching critical — early signal, worth a look at the next check-in, not an immediate page.
- **SEV-4** — Cosmetic issues with no functional or user-facing impact (e.g. a stale label in a dashboard, a non-blocking lint warning surfaced by a monitoring tool) — logged, not alerted.

### Budget decision points (D-14 / D-15)

These are documented, measurable decision points that sit alongside the severity model — not SEV levels themselves, but owner-facing triggers that ride on the same monthly-spend signal:

- **$100/mo — Infra-review trigger (D-15).** Crossing $100/mo combined Vercel + Supabase + monitoring spend flags a capacity/pricing review. This is the same figure as `SPEND_HEADS_UP_USD`/`INFRA_REVIEW_TRIGGER_USD` in `config.ts` and matches the `monthly_spend_usd` critical band above. Owner reviews usage against plan tiers and decides whether to upgrade, optimize, or hold.
- **~$50/mo — Supabase compute auto-upgrade pre-authorized ceiling (D-14).** The first Supabase compute-tier bump is pre-authorized by the owner up to this figure (`SUPABASE_COMPUTE_AUTO_UPGRADE_CEILING_USD` in `config.ts`); any change above this ceiling requires explicit owner approval before it is made. This value is advisory/documentation only — no code in this phase automatically triggers a compute change; the phase's Prohibitions explicitly forbid automatic Supabase compute changes without an explicit owner decision.

---

## Non-overlap and drift guarantees

- **Non-overlapping bands:** `config.test.ts` (Plan 01) programmatically asserts `warning < critical` for every entry in `THRESHOLDS`, so this table can never describe an overlapping or inverted band.
- **No parallel numbers:** if these figures and `lib/observability/config.ts` ever disagree, `config.ts` wins — this doc is a projection, not an independent source. Update `config.ts` first, then this doc, in the same change.
- **Provisional flag:** every row's baseline-adjusted column stays "provisional — pending Plan 09 k6 baseline" until Plan 09 lands and the owner explicitly updates both `config.ts` (`provisional: false`) and this doc together.

---
*Phase: 32-production-observability-capacity-incident-readiness*
*Plan: 32-08*
