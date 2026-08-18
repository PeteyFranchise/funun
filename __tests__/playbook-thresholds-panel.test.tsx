import { renderToStaticMarkup } from 'react-dom/server'
import { ThresholdsPanel } from '@/components/playbook/ThresholdsPanel'
import { THRESHOLDS } from '@/lib/observability/config'

// ─── ThresholdsPanel (33-07 Task 3, PLAYBOOK-09) ───────────────────────
// Locks the UI-SPEC's explicit 7-row allowlist (not a blanket "all except
// spend" filter — RESEARCH Pitfall 4) and asserts real THRESHOLDS values
// render, not fabricated numbers.

describe('ThresholdsPanel', () => {
  const html = renderToStaticMarkup(<ThresholdsPanel />)

  it('renders exactly 7 threshold rows', () => {
    const rows = html.match(/data-testid="threshold-row-/g) ?? []
    expect(rows.length).toBe(7)
  })

  it('excludes monthly_spend_usd (its own Spend tile)', () => {
    expect(html).not.toContain('threshold-row-monthly_spend_usd')
  })

  it('excludes uptime_consecutive_failures (Better Stack\'s own alerting)', () => {
    expect(html).not.toContain('threshold-row-uptime_consecutive_failures')
  })

  it('shows the real THRESHOLDS warn/crit values for a spot-checked % metric (supabase_cpu_pct)', () => {
    const { warning, critical } = THRESHOLDS.supabase_cpu_pct
    expect(html).toContain(`warn ${warning}% · crit ${critical}%`)
  })

  it('shows the real THRESHOLDS warn/crit values with the ms unit for dynamic_route_p95_ms', () => {
    const { warning, critical } = THRESHOLDS.dynamic_route_p95_ms
    expect(html).toContain(`warn ${warning}ms · crit ${critical}ms`)
  })

  it('shows the real THRESHOLDS warn/crit values unitless for a count metric (db_connections)', () => {
    const { warning, critical } = THRESHOLDS.db_connections
    expect(html).toContain(`warn ${warning} · crit ${critical}`)
  })

  it('renders all 7 allowlisted rows including each key metric', () => {
    for (const metric of [
      'vercel_5xx_rate',
      'function_throttle',
      'dynamic_route_p95_ms',
      'supabase_cpu_pct',
      'db_connections',
      'disk_pct',
      'auth_api_5xx_rate',
    ]) {
      expect(html).toContain(`threshold-row-${metric}`)
    }
  })
})
