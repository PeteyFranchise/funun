import type { DealStage } from './schema'
import { CATALOG_READINESS_THRESHOLD } from './catalog'

// ─── GTM beta metrics (D-10) ──────────────────────────────────────────────
// Pure aggregation over already-fetched license_requests rows — no
// Supabase client, no I/O — so every metric definition is unit-testable
// and unambiguous (lib/deals/metrics.test.ts). Callers (the admin metrics
// API route and the /admin/deals/metrics server page) do all the I/O and
// map raw rows into GtmDealInput before calling computeGtmMetrics.
//
// Null-versus-zero discipline: a rate with no denominator returns null so
// the dashboard can render "not enough data" instead of a number the
// founder might misread as a trend (0% and "no data yet" are different
// facts). Counts (closedDeals, repeatBuyerOrgs) are always a number, never
// null, because an empty list of zero closed deals is itself a real fact.
//
// requestToQuoteHours limitation (documented, not hidden): migration 081
// has no dedicated "first quoted at" timestamp column — license_requests
// only carries created_at/updated_at. Callers derive `quotedAt` as
// `gross_fee_cents != null ? updated_at : null`, which is exact for a deal
// quoted once and left alone, but will OVERSTATE elapsed time for a deal
// that kept moving (negotiated further, then closed) after its fee was
// first set, since updated_at reflects the LAST write, not the first
// quote. Accepted at beta volume — a stage_history table is the correct
// fix if this metric needs to be precise later.

export type GtmDealInput = {
  stage: DealStage
  /** ISO timestamp — when the request was submitted. */
  createdAt: string
  /** ISO timestamp of the first quote, or null if never quoted. */
  quotedAt: string | null
  /** Gross fee in cents, or null if never set. */
  grossFeeCents: number | null
  buyerOrgId: string
  /** True when created via the admin manual-intake fallback (D-03). */
  isAdminCreated: boolean
}

export type GtmMetrics = {
  /** GTM-01: deals in the closed_won terminal stage. */
  closedDeals: number
  /** GTM-02: average hours from submission to first quote, quoted deals only. */
  requestToQuoteHours: number | null
  /** GTM-03: won / quoted, null with zero quoted deals. */
  quoteToCloseRate: number | null
  /** GTM-04: average gross fee across won deals only. */
  averageSyncFeeCents: number | null
  /** GTM-05: buyer orgs with more than one submitted request. */
  repeatBuyerOrgs: number
  /** GTM-07: fraction of requests created through manual intake. */
  adminCreatedShare: number | null
  sampleSizes: {
    totalDeals: number
    quotedDeals: number
    wonDeals: number
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export function computeGtmMetrics(deals: GtmDealInput[]): GtmMetrics {
  const wonDeals = deals.filter(d => d.stage === 'closed_won')
  const quotedDeals = deals.filter(d => d.quotedAt != null)

  const requestToQuoteHours = average(
    quotedDeals.map(d => (new Date(d.quotedAt as string).getTime() - new Date(d.createdAt).getTime()) / 3_600_000)
  )

  const quoteToCloseRate = quotedDeals.length === 0 ? null : wonDeals.length / quotedDeals.length

  const averageSyncFeeCents =
    wonDeals.length === 0
      ? null
      : average(wonDeals.map(d => d.grossFeeCents).filter((v): v is number => v != null))

  const orgCounts = new Map<string, number>()
  for (const d of deals) {
    orgCounts.set(d.buyerOrgId, (orgCounts.get(d.buyerOrgId) ?? 0) + 1)
  }
  const repeatBuyerOrgs = Array.from(orgCounts.values()).filter(count => count > 1).length

  const adminCreatedShare =
    deals.length === 0 ? null : deals.filter(d => d.isAdminCreated).length / deals.length

  return {
    closedDeals: wonDeals.length,
    requestToQuoteHours,
    quoteToCloseRate,
    averageSyncFeeCents,
    repeatBuyerOrgs,
    adminCreatedShare,
    sampleSizes: {
      totalDeals: deals.length,
      quotedDeals: quotedDeals.length,
      wonDeals: wonDeals.length,
    },
  }
}

// ─── Artist readiness pass rate (GTM-06) ──────────────────────────────────
// Separate exported function over requested PROJECTS (deduplicated by the
// caller, one entry per distinct vault_project_id referenced by any
// request) — the signal for whether supply is blocking demand. Reuses
// CATALOG_READINESS_THRESHOLD (lib/deals/catalog.ts) rather than
// duplicating the number, so raising/lowering the beta rights-ready bar in
// one place moves this metric too. This is a simplified proxy of
// isRightsReady() — public AND readiness-at-or-above-threshold — and
// deliberately omits the full computeStage3().canContinue check, since
// license_requests stores no point-in-time readiness snapshot: only the
// PROJECT'S CURRENT is_public/vault_readiness_score are available, so
// "at request time" is necessarily read as "as of now" rather than a true
// historical snapshot. Documented limitation, not a silent approximation.

export type ReadinessProjectLike = {
  isPublic: boolean | null
  readinessScore: number | null
}

export type ReadinessPassRate = {
  passRate: number | null
  sampleSize: number
}

export function computeArtistReadinessPassRate(projects: ReadinessProjectLike[]): ReadinessPassRate {
  if (projects.length === 0) return { passRate: null, sampleSize: 0 }

  const passCount = projects.filter(
    p => p.isPublic === true && p.readinessScore != null && p.readinessScore >= CATALOG_READINESS_THRESHOLD
  ).length

  return { passRate: passCount / projects.length, sampleSize: projects.length }
}

// ─── Raw-row mapping (shared, still pure) ─────────────────────────────────
// Both the admin API route and the admin server page query license_requests
// independently (mirrors the existing GET /api/admin/deals vs.
// /admin/deals/page.tsx precedent — see app/api/admin/deals/route.ts).
// Extracting the raw-row -> GtmDealInput mapping here (Rule 2: a duplicated
// "what counts as admin-created" check is a correctness risk, not just
// style) keeps the manual-intake marker convention
// (buildManualIntakeNote in app/api/admin/deals/route.ts) defined in
// exactly one place on the read side too.
export type GtmRawDealRow = {
  stage: DealStage
  created_at: string
  updated_at: string
  gross_fee_cents: number | null
  buyer_org_id: string
  admin_notes: string | null
}

export function mapRawDealRow(row: GtmRawDealRow): GtmDealInput {
  return {
    stage: row.stage,
    createdAt: row.created_at,
    quotedAt: row.gross_fee_cents != null ? row.updated_at : null,
    grossFeeCents: row.gross_fee_cents,
    buyerOrgId: row.buyer_org_id,
    isAdminCreated: row.admin_notes?.startsWith('[Admin-created via manual intake') ?? false,
  }
}
