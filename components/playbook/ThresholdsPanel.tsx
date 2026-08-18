import { THRESHOLDS, type ThresholdMetric } from '@/lib/observability/config'

// ─── Thresholds panel (33-07 Task 3, PLAYBOOK-09, D-07/D-09) ───────────
// Renders the real config values — never fabricated numbers. The 7-row
// allowlist below is deliberately narrower than "every THRESHOLDS key
// except monthly_spend_usd" (the cron's own filter): it also drops
// uptime_consecutive_failures, which belongs to Better Stack's own
// alerting / the Uptime tile, not this table (UI-SPEC "Thresholds panel",
// RESEARCH Pitfall 4). Do not derive this list from Object.keys(THRESHOLDS)
// — the UI-SPEC's explicit allowlist is the source of truth for what this
// panel shows, not a blanket filter.

const ROWS: { metric: ThresholdMetric; label: string }[] = [
  { metric: 'vercel_5xx_rate', label: 'Vercel 5xx rate' },
  { metric: 'function_throttle', label: 'Function throttles' },
  { metric: 'dynamic_route_p95_ms', label: 'Route p95 latency' },
  { metric: 'supabase_cpu_pct', label: 'Supabase CPU' },
  { metric: 'db_connections', label: 'DB connections' },
  { metric: 'disk_pct', label: 'Disk usage' },
  { metric: 'auth_api_5xx_rate', label: 'Auth/API 5xx rate' },
]

const PERCENT_METRICS: ThresholdMetric[] = ['vercel_5xx_rate', 'supabase_cpu_pct', 'disk_pct', 'auth_api_5xx_rate']

function unitFor(metric: ThresholdMetric): string {
  if (metric === 'dynamic_route_p95_ms') return 'ms'
  if (PERCENT_METRICS.includes(metric)) return '%'
  return '' // function_throttle, db_connections — unitless occurrence/connection counts
}

function bandLabel(metric: ThresholdMetric): string {
  const { warning, critical } = THRESHOLDS[metric]
  const unit = unitFor(metric)
  return `warn ${warning}${unit} · crit ${critical}${unit}`
}

export function ThresholdsPanel() {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[13.5px] font-bold text-[color:var(--ink)]">Thresholds &amp; severity</h2>
        <span className="rounded-full border border-[rgba(217,70,239,.32)] bg-[rgba(217,70,239,.10)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] text-[color:var(--fuchsia)]">
          Live values · v2
        </span>
      </div>
      <div className="mt-3 flex flex-col">
        {ROWS.map((row) => (
          <div
            key={row.metric}
            data-testid={`threshold-row-${row.metric}`}
            className="flex items-center justify-between border-t border-[color:var(--border)] py-2.5 first:border-t-0"
          >
            <span className="text-[13px] text-[color:var(--ink-2)]">{row.label}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[12px] text-[color:var(--ink-2)]">{bandLabel(row.metric)}</span>
              <span className="rounded-full border border-[rgba(217,70,239,.32)] bg-[rgba(217,70,239,.10)] px-2 py-0.5 text-[9px] uppercase tracking-[.1em] text-[color:var(--fuchsia)]">
                awaiting feed
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 border-t border-[color:var(--border)] pt-3 text-[11px] text-[color:var(--ink-3)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#F43F5E]" /> SEV-1/2 critical
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#F59E0B]" /> SEV-3 warning
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#34D399]" /> healthy
        </span>
      </div>
    </div>
  )
}
