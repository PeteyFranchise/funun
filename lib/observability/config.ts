// ─── D-10 central config layer ─────────────────────────────────────────
// The single owner-editable surface for every tunable alert threshold, the
// SEV-1..4 severity enum, the growable alert-recipient list, and the
// incident owners. Every downstream alerting surface (the fan-out helper,
// the daily cron, SEV routing, the thresholds doc) reads from THIS module
// so "one place to adjust as we grow" (D-10) holds, and the deferred
// Observability Admin Dashboard becomes a thin UI over it rather than a
// rebuild. Hybrid shape (RESEARCH Open Question #3): thresholds + SEV enum
// are a typed module (mostly static, benefits from type-checking); the
// recipient/owner list is service-role-only table-backed
// (observability_recipients, migration 110) so it is addable without a
// redeploy — the natural target for the deferred dashboard's CRUD UI.

import { createServiceClient } from '@/lib/supabase/server'

// ─── Severity model (SEV-1..4) ─────────────────────────────────────────
export type SeverityLevel = 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4'

export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  'SEV-1': 'Critical — production down or data at risk',
  'SEV-2': 'Major — significant degradation',
  'SEV-3': 'Minor — limited impact',
  'SEV-4': 'Cosmetic — no user impact',
}

export const SEVERITY_VALUES = Object.keys(SEVERITY_LABELS) as SeverityLevel[]

// ─── Threshold metrics ──────────────────────────────────────────────────
// Covers every signal named in SPEC R8: Vercel 5xx rate, function
// throttles, dynamic-route p95, Supabase CPU, DB connections, disk,
// Auth/API 5xx, external-uptime consecutive failures, and monthly spend.
export type ThresholdMetric =
  | 'vercel_5xx_rate'
  | 'function_throttle'
  | 'dynamic_route_p95_ms'
  | 'supabase_cpu_pct'
  | 'db_connections'
  | 'disk_pct'
  | 'auth_api_5xx_rate'
  | 'uptime_consecutive_failures'
  | 'monthly_spend_usd'

export type ThresholdBand = {
  /** Value at/above this (and below `critical`) classifies as 'warning'. */
  warning: number
  /** Value at/above this classifies as 'critical'. */
  critical: number
  /**
   * True until an observed baseline (Plan 09's k6 capacity report) has
   * validated this band. Seeded here from the SPEC's proposed values —
   * never silently treated as final/baseline-adjusted while true.
   */
  provisional: boolean
  /**
   * Documented measurement/rounding window for rate + percentile metrics
   * (e.g. "5-minute rolling window"). Omitted for point-in-time /
   * count-based metrics (connections, throttle occurrences, spend).
   */
  window?: string
}

// Seeded from the SPEC's proposed values (R8) — every entry is
// `provisional: true` until Plan 09's k6 baseline lands and Plan 08's
// thresholds doc marks the baseline-adjusted column non-provisional.
// warning < critical is asserted programmatically in config.test.ts.
export const THRESHOLDS: Record<ThresholdMetric, ThresholdBand> = {
  vercel_5xx_rate: { warning: 1, critical: 5, provisional: true, window: '5-minute rolling window, % of requests' },
  function_throttle: { warning: 1, critical: 5, provisional: true, window: '5-minute rolling window, occurrence count' },
  dynamic_route_p95_ms: { warning: 800, critical: 2000, provisional: true, window: '5-minute rolling window, p95 latency (ms)' },
  supabase_cpu_pct: { warning: 70, critical: 90, provisional: true, window: '5-minute rolling window, % CPU' },
  db_connections: { warning: 50, critical: 70, provisional: true },
  disk_pct: { warning: 70, critical: 85, provisional: true },
  auth_api_5xx_rate: { warning: 1, critical: 5, provisional: true, window: '5-minute rolling window, % of requests' },
  // Matches D-05 (Better Stack "alert after 2-3 consecutive failures").
  uptime_consecutive_failures: { warning: 2, critical: 3, provisional: true },
  // Matches D-09/D-15's $100 heads-up/infra-review trigger; warning band
  // mirrors Vercel's 75%-of-plan usage-alert tier cited in SPEC R1.
  monthly_spend_usd: { warning: 75, critical: 100, provisional: true },
}

export type ThresholdStatus = 'healthy' | 'warning' | 'critical' | 'unknown'

/**
 * Deterministic threshold classification (R8 boundary/adjacency/empty
 * edges):
 *  - null/undefined value -> 'unknown' (no-data is never silently healthy).
 *  - value < warning -> 'healthy'.
 *  - warning <= value < critical -> 'warning' (the lower band; a value
 *    exactly AT warning resolves to 'warning', matching the SPEC's
 *    "a value exactly at a threshold resolves to one documented severity").
 *  - value >= critical -> 'critical'.
 */
export function classifyThreshold(
  metric: ThresholdMetric,
  value: number | null | undefined
): ThresholdStatus {
  if (value === null || value === undefined) return 'unknown'
  const { warning, critical } = THRESHOLDS[metric]
  if (value >= critical) return 'critical'
  if (value >= warning) return 'warning'
  return 'healthy'
}

// ─── Budget constants (advisory data only — no auto-pause/auto-scale) ──
// D-09/D-15: monthly spend heads-up threshold = infra-review trigger.
export const SPEND_HEADS_UP_USD = 100
// D-14: Supabase compute auto-upgrade pre-authorized ceiling (~$50/mo);
// above this requires explicit owner approval. Advisory value only — no
// automatic compute change is ever triggered by this module.
export const SUPABASE_COMPUTE_AUTO_UPGRADE_CEILING_USD = 50
// D-15: crossing this (Vercel + Supabase + monitoring combined) flags a
// capacity/pricing review.
export const INFRA_REVIEW_TRIGGER_USD = 100

// ─── Alert recipients + incident owners ────────────────────────────────
// D-08: alert destinations MUST be extensible — a growable recipient list,
// never a hardcoded single sink. D-13: Pete is primary incident owner,
// founder-led, no dedicated backup yet.
export type RecipientRole = 'primary' | 'backup' | 'watcher'

export type Recipient = {
  email: string
  role: RecipientRole
}

// Fallback used whenever observability_recipients is empty/unreachable
// (including before migration 110 is pushed) — never throws, never blocks
// downstream alerting on the table existing.
export const DEFAULT_ALERT_RECIPIENTS: Recipient[] = [{ email: 'pete@funun.studio', role: 'primary' }]

type RecipientRow = { email: string; role: string }

/**
 * Reads the growable recipient list from observability_recipients via the
 * service-role client. Never throws — falls back to
 * DEFAULT_ALERT_RECIPIENTS whenever the table read errors or returns no
 * rows (including "table doesn't exist yet" while migration 110 awaits the
 * owner's `supabase db push`), matching lib/email/index.ts's no-op-when-
 * unconfigured philosophy.
 */
export async function getAlertRecipients(): Promise<Recipient[]> {
  try {
    const service = createServiceClient()
    const { data, error } = await service.from('observability_recipients').select('email, role')
    if (error || !data || data.length === 0) return DEFAULT_ALERT_RECIPIENTS
    return (data as RecipientRow[]).map((row) => ({
      email: row.email,
      role: (row.role as RecipientRole) ?? 'watcher',
    }))
  } catch {
    return DEFAULT_ALERT_RECIPIENTS
  }
}

/**
 * Incident owners = the primary/backup subset of the recipient list
 * (D-13). Falls back to the same Pete-only default, so SEV routing is
 * never blocked on the table existing.
 */
export async function getIncidentOwners(): Promise<Recipient[]> {
  const recipients = await getAlertRecipients()
  const owners = recipients.filter((r) => r.role === 'primary' || r.role === 'backup')
  return owners.length > 0 ? owners : DEFAULT_ALERT_RECIPIENTS
}
