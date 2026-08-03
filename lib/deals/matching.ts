import type { ProjectLicenseTerms, Territory, UsageType } from './schema'

// ─── Pre-cleared-terms matching (D-15/D-15a) ─────────────────────────────
// Pure function — accepts already-fetched request and terms shapes, no
// Supabase client, so it is unit-testable and can run server-side before a
// request is ever shown to a buyer or artist (RESEARCH Architectural
// Responsibility Map). Accumulates every failing dimension rather than
// short-circuiting on the first, so the admin negotiation queue can show
// exactly which dimensions are out of band.

export type MatchRequestInput = {
  usage_types: UsageType[]
  territories: Territory[]
  term_months: number | null
  exclusivity: boolean
  budget_cents: number | null
}

export type MatchResult = {
  matched: boolean
  reasons: string[]
}

export function matchesPreclearedTerms(
  request: MatchRequestInput,
  terms: ProjectLicenseTerms | null | undefined
): MatchResult {
  if (!terms) {
    return {
      matched: false,
      reasons: ['This project has no pre-cleared terms set — routing to admin negotiation.'],
    }
  }

  const reasons: string[] = []

  // Fee dimension.
  if (
    terms.min_fee_cents != null &&
    request.budget_cents != null &&
    request.budget_cents < terms.min_fee_cents
  ) {
    reasons.push(
      `Budget ($${(request.budget_cents / 100).toFixed(2)}) is below the pre-cleared minimum fee ($${(terms.min_fee_cents / 100).toFixed(2)}).`
    )
  }

  // Usage-type dimension.
  const disallowedUsage = request.usage_types.filter(
    u => !terms.allowed_usage_types.includes(u)
  )
  if (disallowedUsage.length > 0) {
    reasons.push(`Requested usage type(s) not pre-cleared: ${disallowedUsage.join(', ')}.`)
  }

  // Territory dimension.
  const disallowedTerritories = request.territories.filter(
    t => !terms.territories.includes(t)
  )
  if (disallowedTerritories.length > 0) {
    reasons.push(`Requested territor${disallowedTerritories.length === 1 ? 'y' : 'ies'} not pre-cleared: ${disallowedTerritories.join(', ')}.`)
  }

  // Exclusivity dimension — only a violation when the request WANTS
  // exclusivity and terms disallow it.
  if (request.exclusivity && terms.exclusivity_allowed === false) {
    reasons.push('Requested exclusivity is not allowed under this project\'s pre-cleared terms.')
  }

  // Term-length dimension.
  if (
    terms.max_term_months != null &&
    request.term_months != null &&
    request.term_months > terms.max_term_months
  ) {
    reasons.push(
      `Requested term (${request.term_months} months) exceeds the pre-cleared maximum (${terms.max_term_months} months).`
    )
  }

  return { matched: reasons.length === 0, reasons }
}
