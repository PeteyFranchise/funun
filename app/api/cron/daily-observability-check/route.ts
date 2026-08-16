import { NextResponse } from 'next/server'
import { GET as checkHealth } from '@/app/api/health/route'
import { fanOutAlert } from '@/lib/observability/alerts'
import { THRESHOLDS, classifyThreshold, SPEND_HEADS_UP_USD, type ThresholdMetric } from '@/lib/observability/config'

// ─── GET /api/cron/daily-observability-check (32-05 Task 2, R10) ───────
// Invoked daily by Vercel Cron (vercel.json, "0 6 * * *" — within Hobby's
// once-per-day-per-expression ceiling). Vercel attaches an
// `Authorization: Bearer $CRON_SECRET` header automatically — this route
// rejects any request whose header doesn't match BEFORE any digest work
// (mirrors app/api/cron/curator-reach/route.ts's fail-closed guard
// verbatim, T-32-10: without this check first, the route is a
// quota-burning DoS vector reachable by anyone on the public internet).
//
// Digest content is a summary status only — uptime healthy/degraded plus
// each R8 threshold's warning/critical/unknown classification — never raw
// user/Supabase records (T-32-06). Metric values are not yet wired to a
// live telemetry feed (that lands via the vendor dashboards in Plan 04/R1/
// R2, or a future Observability Admin Dashboard per D-10); until then
// every THRESHOLDS entry legitimately classifies as 'unknown' via
// classifyThreshold's null/undefined -> 'unknown' rule ("no-data is never
// silently healthy") rather than being fabricated as healthy.
const DOC_PATH = 'docs/observability/VERCEL-ALERTS-RESPONSE.md'

// Self-declared tier flag (no live Vercel API integration exists in this
// codebase — Spend Management is a vendor-dashboard-only alert per R1).
// Defaults to Hobby-safe behavior (no assumed Pro-only capability) when
// unset, matching RESEARCH Pitfall #2's "don't assume Pro is reachable."
function isProTier(): boolean {
  return process.env.VERCEL_PLAN_TIER === 'pro'
}

function buildSpendLine(): string {
  if (isProTier()) {
    return `<li>monthly_spend_usd: monitored via Vercel Spend Management dashboard ($${SPEND_HEADS_UP_USD} heads-up threshold, notify-only per D-07)</li>`
  }
  return `<li>monthly_spend_usd: spend detection unavailable on Hobby tier — see ${DOC_PATH} manual check</li>`
}

async function checkHealthStatus(): Promise<'healthy' | 'degraded' | 'unknown'> {
  try {
    const res = await checkHealth()
    const body = await res.json()
    return body?.status === 'healthy' ? 'healthy' : 'degraded'
  } catch {
    // Never throw — an unreachable/failing health check is itself a
    // reportable 'unknown' state, not a crash of the digest cron.
    return 'unknown'
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  // Fail closed when CRON_SECRET isn't configured — otherwise the
  // comparison becomes `authHeader !== 'Bearer undefined'`, and any caller
  // who literally sends `Authorization: Bearer undefined` passes (WR-05,
  // copied verbatim from curator-reach).
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const healthStatus = await checkHealthStatus()

  // monthly_spend_usd is handled separately (buildSpendLine) since it
  // degrades by tier rather than by a live metric value.
  const metricLines = (Object.keys(THRESHOLDS) as ThresholdMetric[])
    .filter((metric) => metric !== 'monthly_spend_usd')
    .map((metric) => `<li>${metric}: ${classifyThreshold(metric, undefined)}</li>`)
    .join('')

  const subject = `Funūn daily observability digest — ${healthStatus}`
  const html = [
    '<h1>Daily observability digest</h1>',
    `<p>Uptime status (re-checked /api/health): <strong>${healthStatus}</strong></p>`,
    '<ul>',
    metricLines,
    buildSpendLine(),
    '</ul>',
  ].join('')

  const alert = await fanOutAlert(subject, html)

  return NextResponse.json({ ok: true, healthStatus, alert })
}
