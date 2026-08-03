import {
  computeGtmMetrics,
  computeArtistReadinessPassRate,
  mapRawDealRow,
  type GtmDealInput,
} from './metrics'

// Minimal fixture builder — every field defaults to a "submitted, never
// quoted, not admin-created" deal so each test only overrides what it cares
// about (mirrors lib/deals/stage-machine.test.ts's terse fixture style).
function deal(overrides: Partial<GtmDealInput> = {}): GtmDealInput {
  return {
    stage: 'submitted',
    createdAt: '2026-07-01T00:00:00.000Z',
    quotedAt: null,
    grossFeeCents: null,
    buyerOrgId: 'org-1',
    isAdminCreated: false,
    ...overrides,
  }
}

describe('computeGtmMetrics', () => {
  it('returns zeroed counts and null rates for an empty deal list without throwing', () => {
    const result = computeGtmMetrics([])
    expect(result.closedDeals).toBe(0)
    expect(result.repeatBuyerOrgs).toBe(0)
    expect(result.requestToQuoteHours).toBeNull()
    expect(result.quoteToCloseRate).toBeNull()
    expect(result.averageSyncFeeCents).toBeNull()
    expect(result.adminCreatedShare).toBeNull()
    expect(result.sampleSizes).toEqual({ totalDeals: 0, quotedDeals: 0, wonDeals: 0 })
  })

  it('counts only closed_won deals toward closedDeals (GTM-01)', () => {
    const deals = [
      deal({ stage: 'closed_won' }),
      deal({ stage: 'closed_won' }),
      deal({ stage: 'closed_lost' }),
      deal({ stage: 'in_negotiation' }),
    ]
    expect(computeGtmMetrics(deals).closedDeals).toBe(2)
  })

  it('averages request-to-quote hours only across quoted deals, excluding never-quoted deals (GTM-02)', () => {
    const deals = [
      deal({ createdAt: '2026-07-01T00:00:00.000Z', quotedAt: '2026-07-02T00:00:00.000Z' }), // 24h
      deal({ createdAt: '2026-07-01T00:00:00.000Z', quotedAt: '2026-07-03T00:00:00.000Z' }), // 48h
      deal({ createdAt: '2026-07-01T00:00:00.000Z', quotedAt: null }), // excluded, not zero
    ]
    expect(computeGtmMetrics(deals).requestToQuoteHours).toBe(36)
  })

  it('returns null request-to-quote hours when no deal has ever been quoted', () => {
    const deals = [deal({ quotedAt: null }), deal({ quotedAt: null })]
    expect(computeGtmMetrics(deals).requestToQuoteHours).toBeNull()
  })

  it('computes quote-to-close rate as won divided by quoted, never a misleading zero (GTM-03)', () => {
    const deals = [
      deal({ stage: 'closed_won', quotedAt: '2026-07-02T00:00:00.000Z', grossFeeCents: 100000 }),
      deal({ stage: 'closed_lost', quotedAt: '2026-07-02T00:00:00.000Z' }),
      deal({ stage: 'in_negotiation', quotedAt: '2026-07-02T00:00:00.000Z' }),
    ]
    expect(computeGtmMetrics(deals).quoteToCloseRate).toBeCloseTo(1 / 3)
  })

  it('returns null quote-to-close rate with zero quoted deals rather than dividing by zero', () => {
    const deals = [deal({ stage: 'submitted', quotedAt: null })]
    expect(computeGtmMetrics(deals).quoteToCloseRate).toBeNull()
  })

  it('averages the gross fee across won deals only (GTM-04)', () => {
    const deals = [
      deal({ stage: 'closed_won', grossFeeCents: 100000 }),
      deal({ stage: 'closed_won', grossFeeCents: 300000 }),
      deal({ stage: 'in_negotiation', grossFeeCents: 999999 }), // excluded — not won
    ]
    expect(computeGtmMetrics(deals).averageSyncFeeCents).toBe(200000)
  })

  it('returns null average sync fee when no deal has closed won', () => {
    const deals = [deal({ stage: 'in_negotiation', grossFeeCents: 100000 })]
    expect(computeGtmMetrics(deals).averageSyncFeeCents).toBeNull()
  })

  it('counts orgs with more than one submitted request as repeat buyer orgs (GTM-05)', () => {
    const deals = [
      deal({ buyerOrgId: 'org-1' }),
      deal({ buyerOrgId: 'org-1' }),
      deal({ buyerOrgId: 'org-2' }),
      deal({ buyerOrgId: 'org-3' }),
      deal({ buyerOrgId: 'org-3' }),
      deal({ buyerOrgId: 'org-3' }),
    ]
    expect(computeGtmMetrics(deals).repeatBuyerOrgs).toBe(2)
  })

  it('reports the admin-created share as a fraction of all requests (GTM-07)', () => {
    const deals = [
      deal({ isAdminCreated: true }),
      deal({ isAdminCreated: true }),
      deal({ isAdminCreated: false }),
      deal({ isAdminCreated: false }),
    ]
    expect(computeGtmMetrics(deals).adminCreatedShare).toBe(0.5)
  })

  it('reports sample sizes alongside every rate', () => {
    const deals = [
      deal({ stage: 'closed_won', quotedAt: '2026-07-02T00:00:00.000Z', grossFeeCents: 100000 }),
      deal({ stage: 'submitted', quotedAt: null }),
    ]
    const result = computeGtmMetrics(deals)
    expect(result.sampleSizes).toEqual({ totalDeals: 2, quotedDeals: 1, wonDeals: 1 })
  })
})

describe('computeArtistReadinessPassRate', () => {
  it('returns null pass rate and zero sample size for an empty project list', () => {
    expect(computeArtistReadinessPassRate([])).toEqual({ passRate: null, sampleSize: 0 })
  })

  it('counts a project as passing only when public and at/above the readiness threshold', () => {
    const projects = [
      { isPublic: true, readinessScore: 90 },
      { isPublic: true, readinessScore: 60 }, // at threshold — passes
      { isPublic: true, readinessScore: 59 }, // below threshold — fails
      { isPublic: false, readinessScore: 95 }, // not public — fails closed
      { isPublic: true, readinessScore: null }, // missing readiness — fails closed
    ]
    const result = computeArtistReadinessPassRate(projects)
    expect(result.sampleSize).toBe(5)
    expect(result.passRate).toBeCloseTo(2 / 5)
  })
})

describe('mapRawDealRow', () => {
  it('derives quotedAt from updated_at only when gross_fee_cents is set', () => {
    const quoted = mapRawDealRow({
      stage: 'contract',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-02T00:00:00.000Z',
      gross_fee_cents: 50000,
      buyer_org_id: 'org-1',
      admin_notes: null,
    })
    expect(quoted.quotedAt).toBe('2026-07-02T00:00:00.000Z')

    const neverQuoted = mapRawDealRow({
      stage: 'submitted',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
      gross_fee_cents: null,
      buyer_org_id: 'org-1',
      admin_notes: null,
    })
    expect(neverQuoted.quotedAt).toBeNull()
  })

  it('detects admin-created requests via the manual-intake admin_notes marker', () => {
    const adminCreated = mapRawDealRow({
      stage: 'submitted',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
      gross_fee_cents: null,
      buyer_org_id: 'org-1',
      admin_notes: '[Admin-created via manual intake by admin@funun.com]',
    })
    expect(adminCreated.isAdminCreated).toBe(true)

    const buyerCreated = mapRawDealRow({
      stage: 'submitted',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
      gross_fee_cents: null,
      buyer_org_id: 'org-1',
      admin_notes: null,
    })
    expect(buyerCreated.isAdminCreated).toBe(false)
  })
})
