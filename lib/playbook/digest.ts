import { GET as checkHealth } from '@/app/api/health/route'
import { THRESHOLDS, classifyThreshold, type ThresholdMetric, type ThresholdStatus } from '@/lib/observability/config'

// ─── Dashboard live-signal core (33-07 Task 1, PLAYBOOK-07/08) ─────────
// Reuses the daily cron's own health re-check shape
// (app/api/cron/daily-observability-check/route.ts, checkHealthStatus(),
// lines 40-50) and its metric classification loop (lines 62-69) so the
// Monitoring Dashboard's status banner + digest "today" row never diverge
// from what the cron already computes and emails. Critically, this module
// reuses ONLY that classification logic — it never imports the alert
// fan-out helper, so a dashboard page view can never trigger a second
// daily digest email (T-33-08, D-08).

export type DashboardHealthStatus = 'healthy' | 'degraded' | 'unknown'

/**
 * In-process re-check of /api/health — imports the route's own GET handler
 * directly (never a self-HTTP call, per RESEARCH's explicit anti-pattern
 * and T-33-07) and mirrors the cron's exact try/catch shape. Never throws:
 * an unreachable/failing health check or an unparseable body classifies as
 * 'unknown', matching the UI-SPEC's "Unreachable/exception" banner state.
 */
export async function getDashboardHealth(): Promise<DashboardHealthStatus> {
  try {
    const res = await checkHealth()
    const body = (await res.json()) as { status?: string }
    return body?.status === 'healthy' ? 'healthy' : 'degraded'
  } catch {
    return 'unknown'
  }
}

export type DigestDotColor = 'emerald' | 'rose' | 'lavdim'

export type DigestTodayRow = {
  dot: DigestDotColor
  text: string
  date: string
}

const STATUS_LABELS: Record<DashboardHealthStatus, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  unknown: 'Unknown',
}

const STATUS_DOTS: Record<DashboardHealthStatus, DigestDotColor> = {
  healthy: 'emerald',
  degraded: 'rose',
  unknown: 'lavdim',
}

/**
 * PURE — builds the digest "today" row (D-08). Renders the same tri-state
 * the cron's own `checkHealthStatus()` produces, using the UI-SPEC's locked
 * copy verbatim. Metric-agnostic prose (no per-metric list) per RESEARCH
 * Pitfall 4 — per-metric detail belongs to the Thresholds panel's own
 * 7-row allowlist, not this row's text. No side effects: does not send
 * email, does not read env/network — safe to call on every render.
 */
export function buildDigestTodayRow(status: DashboardHealthStatus): DigestTodayRow {
  const label = STATUS_LABELS[status]
  return {
    dot: STATUS_DOTS[status],
    text: `**${label}.** /api/health re-check: ${status}. All threshold metrics: no live telemetry yet (v2 wires the feed).`,
    date: new Date().toISOString().slice(0, 10),
  }
}

export type ThresholdClassification = { metric: ThresholdMetric; status: ThresholdStatus }

/**
 * Mirrors the cron's own metric classification loop
 * (app/api/cron/daily-observability-check/route.ts lines 66-69) verbatim
 * for parity: every non-spend threshold metric classifies via
 * classifyThreshold(metric, undefined), which always resolves 'unknown'
 * until v2 wires live telemetry (no-data is never silently healthy).
 * Exposed for the parity test below and future digest-detail use — the
 * digest row's own rendered text stays the metric-agnostic locked copy
 * above, not a per-metric list (RESEARCH Pitfall 4: this is a DIFFERENT,
 * looser exclusion than the Thresholds panel's stricter 7-row allowlist,
 * which additionally excludes uptime_consecutive_failures).
 */
export function classifyAllThresholds(): ThresholdClassification[] {
  return (Object.keys(THRESHOLDS) as ThresholdMetric[])
    .filter((metric) => metric !== 'monthly_spend_usd')
    .map((metric) => ({ metric, status: classifyThreshold(metric, undefined) }))
}
