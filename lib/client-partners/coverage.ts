// ─── Client Partners — coverage strip + By-AE grouping (D-31.1-04) ─────────
// Pure aggregation transforms the leadership tower's coverage strip and
// By-AE view render. No I/O — the room's server loader (plan 04) fetches
// the whole-book rows (leadership branch only, per this plan's threat
// register) and passes them in.

import type { ClientPartnerRow } from './columns'
import type { HealthState } from './health'

export type CoverageSummary = {
  totalClients: number
  unassigned: number
  aeCount: number
  /** Sum of openDealValue across the book — same dollar unit as ClientPartnerRow.openDealValue (not cents). */
  openPipelineValue: number
  atRiskCount: number
}

export type AeCoverage = {
  aeId: string
  aeName: string
  load: number
  healthMix: Record<HealthState, number>
}

const HEALTH_STATES: HealthState[] = ['good', 'warning', 'at_risk', 'cold', 'prospect']

function emptyHealthMix(): Record<HealthState, number> {
  return { good: 0, warning: 0, at_risk: 0, cold: 0, prospect: 0 }
}

function isHealthState(value: unknown): value is HealthState {
  return typeof value === 'string' && (HEALTH_STATES as string[]).includes(value)
}

/**
 * Whole-book coverage totals for the leadership tower's coverage strip.
 * atRiskCount counts only the 'at_risk' health state — the mockup's strip
 * shows a single "At risk" stat with no cold grouping (documented choice;
 * 'cold' is tracked separately in the By-AE health mix and the book table).
 */
export function buildCoverageSummary(rows: ClientPartnerRow[]): CoverageSummary {
  let unassigned = 0
  let openPipelineValue = 0
  let atRiskCount = 0
  const aeIds = new Set<string>()

  for (const row of rows) {
    if (row.assignedAeId) {
      aeIds.add(row.assignedAeId)
    } else {
      unassigned += 1
    }
    openPipelineValue += row.openDealValue ?? 0
    if (row.health === 'at_risk') atRiskCount += 1
  }

  return {
    totalClients: rows.length,
    unassigned,
    aeCount: aeIds.size,
    openPipelineValue,
    atRiskCount,
  }
}

/**
 * Groups rows by assigned AE for the By-AE coverage view — each AE's load
 * (assigned count) and a health mix (count per HealthState). Unassigned
 * rows are excluded from the buckets (they're counted in the summary's
 * unassigned total instead); a row whose health isn't a resolved
 * HealthState (e.g. 'unknown'/absent) still counts toward load but not
 * toward any healthMix bucket. Sorted deterministically by aeName then
 * aeId so equal names never reorder run-to-run.
 */
export function groupByAe(rows: ClientPartnerRow[]): AeCoverage[] {
  const buckets = new Map<string, AeCoverage>()

  for (const row of rows) {
    if (!row.assignedAeId) continue

    let bucket = buckets.get(row.assignedAeId)
    if (!bucket) {
      bucket = {
        aeId: row.assignedAeId,
        aeName: row.assignedAeName ?? '',
        load: 0,
        healthMix: emptyHealthMix(),
      }
      buckets.set(row.assignedAeId, bucket)
    }

    bucket.load += 1
    if (isHealthState(row.health)) {
      bucket.healthMix[row.health] += 1
    }
  }

  return [...buckets.values()].sort((a, b) => {
    const an = a.aeName.toLowerCase()
    const bn = b.aeName.toLowerCase()
    if (an < bn) return -1
    if (an > bn) return 1
    if (a.aeId < b.aeId) return -1
    if (a.aeId > b.aeId) return 1
    return 0
  })
}
