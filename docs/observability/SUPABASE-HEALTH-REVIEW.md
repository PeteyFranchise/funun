# Supabase Health & Capacity Review Checklist

**Source of truth for numeric thresholds:** `lib/observability/config.ts` (`THRESHOLDS`, `SUPABASE_COMPUTE_AUTO_UPGRADE_CEILING_USD`) and its human-readable projection `docs/observability/THRESHOLDS-AND-SEVERITY.md`. Where a metric below has an app-level threshold entry, the value is cited from `config.ts` by metric name; do not invent parallel numbers here — if a value needs to change, change `config.ts` first.

**Nature of this document (RESEARCH Pitfall 5):** Supabase's Reports and Query Performance Advisor pages are **read-only observability dashboards, not a native alert-configuration system** — there is no equivalent to Vercel's "enable usage notification" toggle for CPU/disk/connections at the free/Pro tiers this project targets. Programmatic alerting would require Supabase's separate Metrics API piped into an external Prometheus-compatible stack, which is explicitly out of this phase's minimal-footprint scope. This checklist is therefore written as a **documented human review procedure** — go here, look at this, act if the value crosses this line — not as a dashboard-alert-configuration task.

**Re-check instruction for the executor/owner:** Supabase ships features quickly. If a native alert-configuration surface for any metric below is found live in the dashboard at review time, that is a pleasant surprise this document did not assume — note it here and treat it as an upgrade to the manual-review posture, not a requirement this phase failed to meet.

**Owner (all metrics, D-13):** Pete — `pete@funun.studio`. Reviewed on the weekly operating-rhythm cadence (R10, ~10 minutes/week) plus daily via the automated digest cron (`app/api/cron/daily-observability-check/route.ts`) for the subset of signals it can classify.

---

## 0. Pooler-utilization scope note (SPEC R2 acceptance requirement)

Whether this project generates direct-Postgres (Supavisor pooler) traffic, as opposed to HTTP/Data-API-only traffic through PostgREST, is **unconfirmed** (SPEC's own "NEEDS HUMAN/EXTERNAL" item; RESEARCH Assumption A2). The Supabase-side portion of `32-04-PLAN.md`'s `user_setup` block names a checkpoint task to confirm this in the dashboard (Database → Connection pooling / Reports); that checkpoint is **deferred** in this draft-first pass (see `32-04-DRAFT.md`).

Per the SPEC's own design and this phase's Prohibitions, pooler-utilization rows are therefore marked **N/A** below, with reason: **"HTTP/Data-API-only; no direct-Postgres traffic confirmed."** If direct-Postgres traffic is later confirmed, replace the N/A rows with a populated pooler-connections entry (read location: Supabase Dashboard → Database → Connection pooling; trigger: align with the `db_connections` band in `config.ts` unless pooler-specific guidance differs) and remove this scope note's "unconfirmed" framing.

---

## 1. Metric → read-location → trigger checklist

| Metric | Where to read it (exact Supabase dashboard path) | Warning/critical trigger | Compute-upgrade decision point |
|---|---|---|---|
| DB CPU | Supabase Dashboard → Project → Database → Reports | `supabase_cpu_pct` warning = 70%, critical = 90% (5-min rolling window; `config.ts`) | Sustained critical-band CPU is the primary trigger to evaluate a compute-tier bump; the first bump is pre-authorized up to `SUPABASE_COMPUTE_AUTO_UPGRADE_CEILING_USD` (~$50/mo, D-14) — anything above that ceiling requires explicit owner approval before it is made. No compute change happens automatically. |
| DB memory | Supabase Dashboard → Project → Database → Reports | No dedicated `config.ts` entry; reviewed alongside CPU as a correlated resource-pressure signal — treat sustained near-ceiling memory as warning-equivalent even without a hard numeric band | Same D-14 ceiling and owner-approval gate as DB CPU; memory pressure that persists after a CPU-driven upgrade is itself grounds for a follow-up review. |
| Active connections | Supabase Dashboard → Project → Database → Reports | `db_connections` warning = 50, critical = 70 (point-in-time count; `config.ts`) | Persistent critical-band connection counts are evaluated for a compute-tier bump (more connections available at higher tiers) under the same D-14 ceiling/owner-approval gate; also check for a connection-leak bug in application code before assuming the fix is purely infrastructure. |
| Service connection distribution (PostgREST / Auth / Storage) | Supabase Dashboard → Project → Database → Reports (per-service breakdown) | No dedicated `config.ts` band; reviewed to identify which service is driving a connections warning/critical (above) before deciding whether the fix is a compute upgrade or an application-side connection-pooling/query-pattern fix | Not itself a compute-upgrade trigger; informs whether the `db_connections` trigger above should lead to a compute upgrade (infra-side) or a code fix (app-side). |
| Disk utilization + growth | Supabase Dashboard → Project → Database → Reports (Disk) | `disk_pct` warning = 70%, critical = 85% (point-in-time; `config.ts`); growth rate reviewed weekly to project time-to-critical | Sustained critical-band disk utilization, or a growth trend projecting critical-band within the next review cycle, is a compute/storage-tier upgrade trigger under the same D-14 ceiling/owner-approval gate. |
| IOPS | Supabase Dashboard → Project → Database → Reports | No dedicated `config.ts` band; reviewed as a correlated signal alongside CPU/disk — an IOPS spike with no corresponding CPU/disk warning is itself worth a note in the weekly review | Same D-14 ceiling and owner-approval gate as CPU/disk if IOPS pressure is sustained and correlates with user-visible slowness. |
| API errors + latency (PostgREST/Data API) | Supabase Dashboard → Project → API → API Logs / Reports | `auth_api_5xx_rate` warning = 1%, critical = 5% (5-min rolling window; `config.ts`) — applies to combined Auth/API 5xx traffic | Not a compute-upgrade trigger on its own; cross-reference with CPU/connections above to determine whether elevated API errors are resource-pressure-driven (infra fix) or an application bug (code fix). |
| Auth failures / anomalies | Supabase Dashboard → Project → Authentication → Logs | Same `auth_api_5xx_rate` band as API errors above (5-min rolling window; `config.ts`) applies to Auth-specific 5xx; a spike in failed-login volume with no corresponding legitimate-traffic explanation is reviewed as a possible credential-stuffing/abuse signal even below the 5xx-rate threshold | Not a compute-upgrade trigger; an abuse-pattern finding is escalated as a security review item, not an infra-capacity one. |
| Slow / outlier queries | Supabase Dashboard → Project → Database → Query Performance (Advisor) | No dedicated `config.ts` band (query-level, not a single numeric threshold); reviewed weekly — any query newly appearing in the "slowest queries" list, or an existing entry whose duration has meaningfully worsened since the last review, is investigated | A recurring pattern of slow queries that persists after query/index optimization is evaluated for a compute upgrade under the D-14 ceiling/owner-approval gate; optimization is tried first. |
| Lock contention | Supabase Dashboard → Project → Database → Query Performance (Advisor) / Reports | No dedicated `config.ts` band; reviewed weekly — any lock-wait event flagged by the Advisor is investigated for the offending query/transaction pattern | Not a compute-upgrade trigger by itself; typically a query/transaction-pattern fix (e.g. shortening a transaction, adding an index) rather than an infra change. |
| Long-running queries | Supabase Dashboard → Project → Database → Query Performance (Advisor) | No dedicated `config.ts` band; reviewed weekly alongside slow/outlier queries — any query exceeding a multi-second duration with no clear justification (e.g. an intentional batch job) is investigated | Same as slow/outlier queries: optimize first; a persistent pattern after optimization is a D-14-gated compute-upgrade candidate. |
| Query Performance Advisor findings (general) | Supabase Dashboard → Project → Database → Query Performance → Advisor / Advisors tab | No dedicated `config.ts` band; reviewed weekly as a whole — any new Advisor recommendation (missing index, unused index, RLS-performance suggestion, etc.) is triaged and either actioned or explicitly deferred with a reason, matching the SEV-3 resolution criteria in `THRESHOLDS-AND-SEVERITY.md` | Advisor findings inform whether observed resource pressure is a query/schema problem (fix first) before a compute upgrade is considered. |
| Pooler utilization (Supavisor) | **N/A** — see §0 | **N/A** — reason: "HTTP/Data-API-only; no direct-Postgres traffic confirmed." | **N/A** — same reason; revisit if direct-Postgres traffic is later confirmed. |

---

## 2. No-auto-compute-change posture

Per this phase's Prohibitions (mirrored from D-07's Vercel-side posture): **no code in this repository automatically changes Supabase compute tier, and no automated action in this phase pauses or scales the database in response to any signal above.** `SUPABASE_COMPUTE_AUTO_UPGRADE_CEILING_USD` in `lib/observability/config.ts` is an **advisory documentation value only** — it records the amount the owner has pre-authorized for the *first* compute-tier bump (D-14), not a value any code path reads to trigger an automatic change. Every compute-upgrade decision point in §1 above ends in owner review and owner action, never an automated trigger. Any change to this posture requires a separate, explicit owner decision.

---

## 3. Configuration status

This checklist is a documentation deliverable and does not itself require dashboard configuration — Reports/Advisor are already live and readable for this project without setup. The one open item is the §0 pooler-traffic confirmation, which is deferred pending the owner (see `32-04-DRAFT.md`). No blocking dependency exists between that confirmation and the rest of this checklist being usable today.

---
*Phase: 32-production-observability-capacity-incident-readiness*
*Plan: 32-04*
