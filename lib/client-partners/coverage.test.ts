import { buildCoverageSummary, groupByAe, type AeCoverage } from './coverage'
import type { ClientPartnerRow } from './columns'

// Mixed assigned/unassigned fixture — 5 rows: 2 owned by AE "Maya Chen", 1
// owned by AE "Jordan Ellis", 2 unassigned.
const rows: ClientPartnerRow[] = [
  {
    id: '1',
    name: 'Neon Sky Records',
    health: 'good',
    openDealValue: 42000,
    assignedAeId: 'ae-1',
    assignedAeName: 'Maya Chen',
  },
  {
    id: '2',
    name: 'Atlas Media',
    health: 'at_risk',
    openDealValue: 0,
    assignedAeId: 'ae-1',
    assignedAeName: 'Maya Chen',
  },
  {
    id: '3',
    name: 'Vertigo Sync',
    health: 'warning',
    openDealValue: 64000,
    assignedAeId: 'ae-2',
    assignedAeName: 'Jordan Ellis',
  },
  {
    id: '4',
    name: 'Lumen Films',
    health: 'unknown',
    openDealValue: 0,
    assignedAeId: null,
    assignedAeName: null,
  },
  {
    id: '5',
    name: 'Coda Games',
    health: 'cold',
    openDealValue: 0,
    assignedAeId: null,
    assignedAeName: null,
  },
]

describe('buildCoverageSummary', () => {
  it('aggregates totals across the whole book', () => {
    const summary = buildCoverageSummary(rows)
    expect(summary.totalClients).toBe(5)
    expect(summary.unassigned).toBe(2)
    expect(summary.aeCount).toBe(2)
    expect(summary.openPipelineValue).toBe(42000 + 64000)
  })

  it('atRiskCount counts only the at_risk health state, not cold (documented mockup choice)', () => {
    const summary = buildCoverageSummary(rows)
    expect(summary.atRiskCount).toBe(1)
  })

  it('returns all-zero totals for an empty book', () => {
    expect(buildCoverageSummary([])).toEqual({
      totalClients: 0,
      unassigned: 0,
      aeCount: 0,
      openPipelineValue: 0,
      atRiskCount: 0,
    })
  })
})

describe('groupByAe', () => {
  it('buckets rows by assigned AE id, excluding unassigned rows', () => {
    const groups = groupByAe(rows)
    expect(groups.map(g => g.aeId)).toEqual(['ae-2', 'ae-1'])
  })

  it('each AeCoverage carries aeId, aeName, load, and a health mix', () => {
    const groups = groupByAe(rows)
    const maya = groups.find(g => g.aeId === 'ae-1') as AeCoverage
    expect(maya.aeName).toBe('Maya Chen')
    expect(maya.load).toBe(2)
    expect(maya.healthMix).toEqual({
      good: 1,
      warning: 0,
      at_risk: 1,
      cold: 0,
      prospect: 0,
    })
  })

  it('healthMix keys are exactly the HealthState values from lib/client-partners/health.ts', () => {
    const groups = groupByAe(rows)
    for (const g of groups) {
      expect(Object.keys(g.healthMix).sort()).toEqual(['at_risk', 'cold', 'good', 'prospect', 'warning'])
    }
  })

  it('sorts groups deterministically by aeName then aeId', () => {
    const groups = groupByAe(rows)
    expect(groups.map(g => g.aeName)).toEqual(['Jordan Ellis', 'Maya Chen'])
  })

  it('returns an empty array when no rows are assigned', () => {
    const unassignedOnly: ClientPartnerRow[] = [{ id: '9', name: 'Riverwild Co.', assignedAeId: null }]
    expect(groupByAe(unassignedOnly)).toEqual([])
  })
})
