import type { GtmMetrics, ReadinessPassRate } from '@/lib/deals/metrics'

// ─── GtmMetricsDashboard (D-10) ────────────────────────────────────────────
// Presentational only — no client state, no interaction — so this stays a
// server component like the rest of app/(admin)/ (mirrors AdminEsignUsagePage
// rendering its stat tiles inline). Every metric renders its D-10 decision
// gate alongside it, and every rate shows its sample size so a 100% close
// rate on one deal can never be misread as a trend.

function pct(value: number | null): string {
  if (value == null) return 'Not enough data'
  return `${Math.round(value * 100)}%`
}

function hours(value: number | null): string {
  if (value == null) return 'Not enough data'
  return `${value.toFixed(1)}h`
}

function money(cents: number | null): string {
  if (cents == null) return 'Not enough data'
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

type MetricTileProps = {
  label: string
  value: string
  sampleSize?: string
  gate: string
}

function MetricTile({ label, value, sampleSize, gate }: MetricTileProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{label}</p>
      <p className="mt-2 text-3xl font-bold text-white">{value}</p>
      {sampleSize ? <p className="mt-1 text-[11px] text-white/40">{sampleSize}</p> : null}
      <p className="mt-2 text-[12px] leading-relaxed text-white/50">{gate}</p>
    </div>
  )
}

export function GtmMetricsDashboard({
  metrics,
  readiness,
}: {
  metrics: GtmMetrics
  readiness: ReadinessPassRate
}) {
  return (
    <div className="grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <MetricTile
        label="Closed deals"
        value={String(metrics.closedDeals)}
        sampleSize={`${metrics.sampleSizes.totalDeals} total requests`}
        gate="D-10 gate: 3–5 closed deals and a written playbook before the AE hire."
      />
      <MetricTile
        label="Request-to-quote time"
        value={hours(metrics.requestToQuoteHours)}
        sampleSize={`${metrics.sampleSizes.quotedDeals} quoted requests`}
        gate="Baseline captured for every beta request (GTM-02); never-quoted requests are excluded, not counted as zero."
      />
      <MetricTile
        label="Quote-to-close rate"
        value={pct(metrics.quoteToCloseRate)}
        sampleSize={`${metrics.sampleSizes.wonDeals} won / ${metrics.sampleSizes.quotedDeals} quoted`}
        gate="D-10 gate: paid acquisition waits on quote-to-close evidence, not spreadsheet confidence."
      />
      <MetricTile
        label="Average sync fee"
        value={money(metrics.averageSyncFeeCents)}
        sampleSize={`${metrics.sampleSizes.wonDeals} won deals`}
        gate="Validates the 25% commission and runway assumptions (GTM-04) — won deals only."
      />
      <MetricTile
        label="Repeat buyer orgs"
        value={String(metrics.repeatBuyerOrgs)}
        sampleSize={`of ${metrics.sampleSizes.totalDeals} total orgs' requests`}
        gate="D-10 gate: at least one repeat request or qualified referral before broad buyer outreach."
      />
      <MetricTile
        label="Admin-created share"
        value={pct(metrics.adminCreatedShare)}
        sampleSize={`${metrics.sampleSizes.totalDeals} total requests`}
        gate="Founder-touch / support-burden signal (GTM-07) — track manual touches per request before scaling volume."
      />
      <MetricTile
        label="Artist readiness pass rate"
        value={pct(readiness.passRate)}
        sampleSize={`${readiness.sampleSize} requested projects`}
        gate="Identifies whether supply is blocking demand (GTM-06). Reflects current readiness, not a historical snapshot — license_requests stores no point-in-time readiness."
      />
    </div>
  )
}
