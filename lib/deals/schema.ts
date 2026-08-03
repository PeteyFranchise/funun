// ─── Deal substrate — shared schema ──────────────────────────────────
// Types and label/value pairs mirroring migration 081's license_requests,
// license_request_tracks, and project_license_terms tables. Safe to import
// on the client (no Node-only deps live here) — the buyer request composer,
// the artist Deals room, the admin negotiation queue, and the pre-cleared
// terms form all read this module rather than re-declaring the shape.

// ─── D-16a deal-stage pipeline ───────────────────────────────────────────
// Order matters — this tuple is the canonical stage order for pipeline UI
// (org dashboard columns, admin queue) as well as the CHECK constraint
// migration 081 ships. Every stage/commission mutation is server-owned
// (RESEARCH Pitfall 3); this module never writes, only describes.
export const DEAL_STAGE_VALUES = [
  'submitted',
  'in_negotiation',
  'terms_agreed',
  'contract',
  'closed_won',
  'closed_lost',
] as const

export type DealStage = (typeof DEAL_STAGE_VALUES)[number]

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  submitted: 'Submitted',
  in_negotiation: 'In negotiation',
  terms_agreed: 'Terms agreed',
  contract: 'Contract',
  closed_won: 'Closed — won',
  closed_lost: 'Closed — lost',
}

// ─── Usage-type vocabulary ────────────────────────────────────────────────
// Controlled vocabulary for what a license covers (D-07/D-15's "allowed
// usage/media types" dimension). No parallel taxonomy exists elsewhere in
// the codebase to reuse (checked lib/genres.ts and lib/metadata/schema.ts's
// MOOD_VALUES — both are supply-side descriptors, not licensing-usage
// terms), so this is a new, narrow, controlled list modeled on the
// Musicbed/Marmoset media-type dimension referenced in 16-CONTEXT.md.
export const USAGE_TYPE_VALUES = [
  'film',
  'tv',
  'advertising',
  'video_game',
  'trailer_promo',
  'corporate_branded',
  'social_content',
  'podcast',
  'other',
] as const

export type UsageType = (typeof USAGE_TYPE_VALUES)[number]

export const USAGE_TYPE_LABELS: Record<UsageType, string> = {
  film: 'Film',
  tv: 'TV',
  advertising: 'Advertising / commercial',
  video_game: 'Video game',
  trailer_promo: 'Trailer / promo',
  corporate_branded: 'Corporate / branded content',
  social_content: 'Social media / creator content',
  podcast: 'Podcast',
  other: 'Other',
}

// ─── Territory vocabulary ─────────────────────────────────────────────────
// Controlled vocabulary for the "territories" dimension. Region-level, not
// country-level, to keep the pre-clearance form and matching logic simple
// at beta volume — a later phase can granularize to country lists if
// buyer/artist feedback demands it.
export const TERRITORY_VALUES = [
  'worldwide',
  'north_america',
  'europe',
  'asia_pacific',
  'latin_america',
  'africa_middle_east',
  'us_only',
  'other',
] as const

export type Territory = (typeof TERRITORY_VALUES)[number]

export const TERRITORY_LABELS: Record<Territory, string> = {
  worldwide: 'Worldwide',
  north_america: 'North America',
  europe: 'Europe',
  asia_pacific: 'Asia-Pacific',
  latin_america: 'Latin America',
  africa_middle_east: 'Africa / Middle East',
  us_only: 'US only',
  other: 'Other',
}

// ─── LicenseRequest — mirrors migration 081's license_requests columns ───
// Client-readable shape only (matches the column-level GRANT allowlist):
// admin_notes, owner_id, commission_pct, and artist_net_cents are
// deliberately absent — a buyer session never receives them from the API,
// so they have no home in the shared client-safe type. Server-side admin
// routes/queue components define their own wider row type locally.
export type LicenseRequest = {
  id: string
  buyer_org_id: string
  created_by: string
  vault_project_id: string
  usage_types: UsageType[]
  territories: Territory[]
  term_months: number | null
  exclusivity: boolean
  budget_cents: number | null
  need_by: string | null
  buyer_notes: string | null
  stage: DealStage
  matched_precleared: boolean
  gross_fee_cents: number | null
  contract_document_id: string | null
  created_at: string
  updated_at: string
}

// Wider shape for admin-only surfaces (the negotiation queue), which read
// through the service role and therefore see every column migration 081
// defines, including the ones excluded from the client-safe GRANT above.
export type LicenseRequestAdmin = LicenseRequest & {
  owner_id: string | null
  admin_notes: string | null
  commission_pct: number | null
  artist_net_cents: number | null
}

export type LicenseRequestTrack = {
  id: string
  license_request_id: string
  track_id: string
}

// project_license_terms is a 1:1 table on vault_projects — its primary key
// IS vault_project_id (no separate id column, per migration 081).
export type ProjectLicenseTerms = {
  vault_project_id: string
  min_fee_cents: number | null
  allowed_usage_types: UsageType[]
  territories: Territory[]
  exclusivity_allowed: boolean | null
  max_term_months: number | null
  updated_at: string
}
