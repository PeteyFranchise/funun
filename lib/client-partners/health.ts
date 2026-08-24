// ─── Client Partners — relationship-health engine (R3, D-06) ───────────────
// The compute-on-read spine of R3: a pure, unit-testable function mirroring
// lib/client-partners/columns.ts / lib/crate-requests/ranking.ts. No I/O, no
// @/lib/supabase import — signals are already-fetched plain values, and the
// RSC page (plan 04) / Health Rules screen (plan 05) own all reads/writes of
// health_rules_config (migration 128). Config save recomputes nothing; the
// next render just reads the new config row (D-06 doctrine).
//
// The health-color clock is the EXECUTED/SIGNED license date, not deal-stage
// closed_won and not last contact (D-31.1-09 owner decision, 2026-08-23,
// supersedes the RESEARCH draft's closed_won_at sketch). A client with no
// executed license is 'prospect' — off the buying-recency axis entirely,
// never good/warning via any signal combination (D-31.1-02).

export type HealthState = 'good' | 'warning' | 'at_risk' | 'cold' | 'prospect'

// Mirrors migration 128's health_rules_config columns (singleton row,
// leadership-configurable via the Health Rules screen — plan 05).
export type HealthRulesConfig = {
  good_within_days: number
  warning_after_days: number
  at_risk_after_days: number
  cold_after_days: number
  keep_warm_open_brief: boolean
  keep_warm_open_deal: boolean
  keep_warm_recent_selects: boolean
  recent_selects_days: number
  keep_warm_recent_contact: boolean
  recent_contact_days: number
}

// Already-fetched, already-normalized per-client signals. The caller (RSC
// page) resolves these from license_requests/buyer_briefs/client_relationship_log
// before calling computeHealth — this module performs no lookups of its own.
export type HealthSignals = {
  /** ISO timestamp of the client's most recent EXECUTED/SIGNED license, or null if never licensed (D-31.1-09). */
  lastExecutedLicenseAt: string | null
  /** Any open (non-terminal) buyer brief / Crate request exists for this client. */
  hasOpenBrief: boolean
  /** Any open (non-terminal) license_requests deal exists for this client. */
  hasOpenDeal: boolean
  /** ISO timestamp of the most recent Selects sent to this client, or null. */
  lastSelectsSentAt: string | null
  /** ISO timestamp of the most recent relationship-log contact, or null. Tracked/shown but never sets the color directly — only the explicit keep_warm_recent_contact hold can lift a band. */
  lastContactAt: string | null
  /** Clock override for deterministic tests; defaults to Date.now(). */
  now?: number
}

/** Whole days elapsed between an ISO timestamp and `nowMs` (floor — a timestamp exactly N*24h ago is N days). */
export function daysBetween(iso: string, nowMs: number): number {
  const then = new Date(iso).getTime()
  const elapsedMs = nowMs - then
  return Math.floor(elapsedMs / (24 * 60 * 60 * 1000))
}

/** True when `iso` is non-null and within `days` of `nowMs` (inclusive). */
export function within(iso: string | null | undefined, days: number, nowMs: number): boolean {
  if (!iso) return false
  return daysBetween(iso, nowMs) <= days
}

/**
 * Pure resolver for R3's 5-state relationship health. Color is driven ONLY
 * by executed-license recency against the configurable thresholds
 * (D-31.1-02) — last-contact never sets the color except through the
 * explicit keep_warm_recent_contact hold when its toggle is on.
 *
 * Band ladder (inclusive good_within upper bound, each *_after is the
 * exclusive lower bound of the next band — RESEARCH Open Q3):
 *   days <= good_within_days   -> good
 *   days <= warning_after_days -> warning
 *   days <= cold_after_days    -> at_risk   (covers at_risk_after_days..cold_after_days)
 *   days >  cold_after_days    -> cold
 *
 * Keeps-warm holds (D-31.1-03): an active-work signal, when its toggle is
 * on, lifts an at_risk/cold client up to warning — never higher, and never
 * applied to an already good/warning client (nothing to lift).
 */
export function computeHealth(signals: HealthSignals, rules: HealthRulesConfig): HealthState {
  if (!signals.lastExecutedLicenseAt) return 'prospect'

  const now = signals.now ?? Date.now()
  const days = daysBetween(signals.lastExecutedLicenseAt, now)

  let base: HealthState
  if (days <= rules.good_within_days) {
    base = 'good'
  } else if (days <= rules.warning_after_days) {
    base = 'warning'
  } else if (days <= rules.cold_after_days) {
    base = 'at_risk'
  } else {
    base = 'cold'
  }

  if (base !== 'at_risk' && base !== 'cold') return base

  const warm =
    (rules.keep_warm_open_brief && signals.hasOpenBrief) ||
    (rules.keep_warm_open_deal && signals.hasOpenDeal) ||
    (rules.keep_warm_recent_selects && within(signals.lastSelectsSentAt, rules.recent_selects_days, now)) ||
    (rules.keep_warm_recent_contact && within(signals.lastContactAt, rules.recent_contact_days, now))

  return warm ? 'warning' : base
}
