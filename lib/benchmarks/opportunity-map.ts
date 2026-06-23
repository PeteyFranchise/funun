// ─── Benchmarks → Antenna mapping ────────────────────────────────────
// The connective tissue between the two rooms: it reads an artist's
// BenchmarkResult and decides, per opportunity TYPE, whether their growth
// metrics clear the bar that type indexes on. This is what turns "you're
// behind on saves" into "editorial playlists are still locked" — the same
// number, read as an opportunity gate. Pure + client-safe so both the
// Benchmarks unlock card and the Antenna badges share one source of truth.

import type { BenchmarkResult, BenchmarkMetric } from './engine'
import type { OpportunityType } from '@/types'

export type GateState = 'qualifies' | 'almost' | 'locked'

export type OpportunityGate = {
  state: GateState
  /** Badge text. */
  label: string
  /** One-line read on why, in Pete's voice. */
  reason: string
  /** The benchmark metric (if any) to deep-link back to. */
  metricKey?: BenchmarkMetric['key']
}

// Audience-gated types compare against monthly listeners.
const LISTENER_GATE: Partial<Record<OpportunityType, number>> = {
  venue: 5_000,
  festival: 25_000,
  sync: 50_000,
}

// Metric-gated types index on a specific benchmark metric.
const METRIC_GATE: Partial<Record<OpportunityType, BenchmarkMetric['key']>> = {
  playlist: 'savesToStreamsPct',
  brand: 'engagementRatePct',
  label: 'followerGrowthPctMonthly',
  press: 'followerGrowthPctMonthly',
}

// Short, human metric names for the reason strings.
const SHORT: Record<BenchmarkMetric['key'], string> = {
  savesToStreamsPct: 'save rate',
  engagementRatePct: 'engagement',
  followerGrowthPctMonthly: 'follower growth',
  playlistAddsPerMonth: 'playlist adds',
}

const LABEL: Record<GateState, string> = {
  qualifies: 'Qualifies',
  almost: 'Almost',
  locked: 'Locked',
}

const STATUS_TO_GATE: Record<BenchmarkMetric['status'], GateState> = {
  ahead: 'qualifies',
  on_track: 'almost',
  behind: 'locked',
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`
  if (n >= 1_000) return `${Math.round(n / 100) / 10}K`
  return `${n}`
}

function gateFromRatio(value: number, target: number): GateState {
  if (value >= target) return 'qualifies'
  if (value >= target * 0.8) return 'almost'
  return 'locked'
}

function listenerReason(state: GateState, value: number, target: number): string {
  const have = `${fmt(value)} listeners`
  if (state === 'qualifies') return `Your ${have} clear the ~${fmt(target)} this type looks for.`
  if (state === 'almost') return `Almost — needs ~${fmt(target)} listeners (you're at ${fmt(value)}).`
  return `Needs ~${fmt(target)} listeners — you're at ${fmt(value)}.`
}

function metricReason(state: GateState, m: BenchmarkMetric): string {
  const v = `${m.value}${m.unit}`
  const t = `${m.target}${m.unit}`
  const name = SHORT[m.key]
  if (state === 'qualifies') return `Your ${name} ${v} clears the ${t} bar.`
  if (state === 'almost') return `Almost — lift ${name} to ${t} (you're at ${v}).`
  return `Needs a ${t} ${name} — you're at ${v}.`
}

/**
 * Read the gate for one opportunity type against an artist's benchmarks.
 *
 * Returns `null` when there's no signal to show — i.e. a metric-gated type
 * when the artist hasn't entered their metrics yet (`metricsKnown: false`).
 * Audience-gated types always resolve, since monthly listeners come from the
 * profile regardless.
 */
export function gateForOpportunity(
  type: OpportunityType,
  result: BenchmarkResult,
  opts: { metricsKnown?: boolean } = {}
): OpportunityGate | null {
  const { metricsKnown = true } = opts

  const threshold = LISTENER_GATE[type]
  if (threshold != null) {
    const state = gateFromRatio(result.monthlyListeners, threshold)
    return { state, label: LABEL[state], reason: listenerReason(state, result.monthlyListeners, threshold) }
  }

  const key = METRIC_GATE[type]
  if (key) {
    if (!metricsKnown) return null
    const m = result.metrics.find(x => x.key === key)
    if (!m) return null
    const state = STATUS_TO_GATE[m.status]
    return { state, label: LABEL[state], reason: metricReason(state, m), metricKey: key }
  }

  return null
}

// ─── Unlock summary (Benchmarks room) ────────────────────────────────
// The curated set of opportunity types the Benchmarks unlock card speaks to,
// with artist-facing names. Ordered by how directly benchmarks drive them.
export const UNLOCK_TYPES: { type: OpportunityType; label: string }[] = [
  { type: 'playlist', label: 'Editorial playlists' },
  { type: 'brand', label: 'Brand campaigns' },
  { type: 'sync', label: 'Sync placements' },
  { type: 'label', label: 'Label interest' },
]

export type UnlockEntry = { type: OpportunityType; label: string; gate: OpportunityGate }

const GATE_RANK: Record<GateState, number> = { qualifies: 0, almost: 1, locked: 2 }

/** Resolve the unlock card's curated types, sorted qualifies → almost → locked. */
export function unlockSummary(result: BenchmarkResult): UnlockEntry[] {
  return UNLOCK_TYPES.map(({ type, label }) => {
    const gate = gateForOpportunity(type, result)!
    return { type, label, gate }
  }).sort((a, b) => GATE_RANK[a.gate.state] - GATE_RANK[b.gate.state])
}
