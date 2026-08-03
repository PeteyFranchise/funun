import { matchesPreclearedTerms, type MatchRequestInput } from './matching'
import type { ProjectLicenseTerms } from './schema'

const baseRequest: MatchRequestInput = {
  usage_types: ['film'],
  territories: ['worldwide'],
  term_months: 12,
  exclusivity: false,
  budget_cents: 500_000,
}

const baseTerms: ProjectLicenseTerms = {
  vault_project_id: 'project-1',
  min_fee_cents: 250_000,
  allowed_usage_types: ['film', 'tv'],
  territories: ['worldwide', 'north_america'],
  exclusivity_allowed: true,
  max_term_months: 24,
  updated_at: '2026-01-01T00:00:00.000Z',
}

describe('matchesPreclearedTerms', () => {
  it('routes to admin negotiation when the project has no pre-cleared terms (D-15a)', () => {
    const result = matchesPreclearedTerms(baseRequest, null)
    expect(result.matched).toBe(false)
    expect(result.reasons.length).toBeGreaterThan(0)
    expect(result.reasons.some(r => /no pre-cleared terms/i.test(r))).toBe(true)
  })

  it('also routes to admin negotiation when terms is undefined', () => {
    const result = matchesPreclearedTerms(baseRequest, undefined)
    expect(result.matched).toBe(false)
    expect(result.reasons.some(r => /no pre-cleared terms/i.test(r))).toBe(true)
  })

  it('matches true with empty reasons when all five dimensions are satisfied', () => {
    const result = matchesPreclearedTerms(baseRequest, baseTerms)
    expect(result.matched).toBe(true)
    expect(result.reasons).toEqual([])
  })

  it('fails on budget below the pre-cleared minimum fee', () => {
    const result = matchesPreclearedTerms({ ...baseRequest, budget_cents: 100_000 }, baseTerms)
    expect(result.matched).toBe(false)
    expect(result.reasons.some(r => /fee|budget/i.test(r))).toBe(true)
  })

  it('fails on a requested usage type not in allowed_usage_types', () => {
    const result = matchesPreclearedTerms({ ...baseRequest, usage_types: ['advertising'] }, baseTerms)
    expect(result.matched).toBe(false)
    expect(result.reasons.some(r => /usage/i.test(r))).toBe(true)
  })

  it('fails on a requested territory not in terms.territories', () => {
    const result = matchesPreclearedTerms({ ...baseRequest, territories: ['europe'] }, baseTerms)
    expect(result.matched).toBe(false)
    expect(result.reasons.some(r => /territor/i.test(r))).toBe(true)
  })

  it('fails when the request wants exclusivity but terms disallow it', () => {
    const terms = { ...baseTerms, exclusivity_allowed: false }
    const result = matchesPreclearedTerms({ ...baseRequest, exclusivity: true }, terms)
    expect(result.matched).toBe(false)
    expect(result.reasons.some(r => /exclusiv/i.test(r))).toBe(true)
  })

  it('does not fail on exclusivity when the request does not want it, even if terms disallow it', () => {
    const terms = { ...baseTerms, exclusivity_allowed: false }
    const result = matchesPreclearedTerms({ ...baseRequest, exclusivity: false }, terms)
    expect(result.reasons.some(r => /exclusiv/i.test(r))).toBe(false)
  })

  it('fails when the requested term exceeds max_term_months', () => {
    const result = matchesPreclearedTerms({ ...baseRequest, term_months: 36 }, baseTerms)
    expect(result.matched).toBe(false)
    expect(result.reasons.some(r => /term/i.test(r))).toBe(true)
  })

  it('accumulates multiple violation reasons rather than short-circuiting on the first', () => {
    const result = matchesPreclearedTerms(
      {
        usage_types: ['advertising'],
        territories: ['europe'],
        term_months: 36,
        exclusivity: true,
        budget_cents: 1,
      },
      { ...baseTerms, exclusivity_allowed: false }
    )
    expect(result.matched).toBe(false)
    // fee, usage, territory, exclusivity, term — all five dimensions violated.
    expect(result.reasons.length).toBe(5)
  })

  it('a request with no term_months set never fails the term dimension', () => {
    const result = matchesPreclearedTerms({ ...baseRequest, term_months: null }, baseTerms)
    expect(result.reasons.some(r => /term/i.test(r))).toBe(false)
  })
})
