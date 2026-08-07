import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import {
  USAGE_TYPE_VALUES,
  TERRITORY_VALUES,
  type UsageType,
  type Territory,
  type ProjectLicenseTerms,
} from '@/lib/deals/schema'

// ─── Pre-cleared terms API (Marmoset five, D-15) ─────────────────────────
// GET/PATCH project_license_terms — the per-project pre-clearance an artist
// sets so a matching buyer request can skip straight past admin negotiation
// (D-15a). Ownership is the authority decision (session client, explicit
// column list, before any write); the service-role client is only the
// mechanism used to perform the write itself, since migration 081 revoked
// client INSERT/UPDATE on project_license_terms entirely (server-owned
// writes doctrine). Non-owned or nonexistent projects return 404 (never
// 403) so the route leaks no existence information — mirrors the
// app/api/connections PATCH 404-on-zero-rows precedent (10-03).

const EDITABLE_FIELDS = [
  'min_fee_cents',
  'allowed_usage_types',
  'territories',
  'exclusivity_allowed',
  'max_term_months',
] as const

const MAX_FEE_CENTS = 100_000_000 // $1,000,000 — a sane ceiling, not a real product limit
const MAX_TERM_MONTHS = 1200 // 100 years — a sane ceiling, not a real product limit

type TermsUpdate = {
  min_fee_cents?: number | null
  allowed_usage_types?: UsageType[]
  territories?: Territory[]
  exclusivity_allowed?: boolean | null
  max_term_months?: number | null
}

const TERMS_COLUMNS =
  'vault_project_id, min_fee_cents, allowed_usage_types, territories, exclusivity_allowed, max_term_months, updated_at'

function sanitize(body: Record<string, unknown>): TermsUpdate | { error: string } {
  const update: TermsUpdate = {}

  for (const key of EDITABLE_FIELDS) {
    if (!(key in body)) continue
    const value = body[key]

    if (key === 'min_fee_cents') {
      if (value === null || value === '') {
        update.min_fee_cents = null
        continue
      }
      const n = Number(value)
      if (!Number.isFinite(n) || n < 0) {
        return { error: 'Minimum fee cannot be negative.' }
      }
      if (n > MAX_FEE_CENTS) {
        return { error: 'Minimum fee is too large.' }
      }
      update.min_fee_cents = Math.round(n)
      continue
    }

    if (key === 'max_term_months') {
      if (value === null || value === '') {
        update.max_term_months = null
        continue
      }
      const n = Number(value)
      if (!Number.isFinite(n) || n < 0) {
        return { error: 'Term length cannot be negative.' }
      }
      if (n > MAX_TERM_MONTHS) {
        return { error: 'Term length is too large.' }
      }
      update.max_term_months = Math.round(n)
      continue
    }

    if (key === 'exclusivity_allowed') {
      if (value === null) {
        update.exclusivity_allowed = null
        continue
      }
      if (typeof value !== 'boolean') {
        return { error: 'Exclusivity must be true, false, or unset.' }
      }
      update.exclusivity_allowed = value
      continue
    }

    if (key === 'allowed_usage_types') {
      if (!Array.isArray(value)) {
        return { error: 'Allowed usage types must be a list.' }
      }
      update.allowed_usage_types = (value as unknown[]).filter(
        (v): v is UsageType => typeof v === 'string' && USAGE_TYPE_VALUES.includes(v as UsageType)
      )
      continue
    }

    if (key === 'territories') {
      if (!Array.isArray(value)) {
        return { error: 'Territories must be a list.' }
      }
      update.territories = (value as unknown[]).filter(
        (v): v is Territory => typeof v === 'string' && TERRITORY_VALUES.includes(v as Territory)
      )
      continue
    }
    // Unknown keys are silently dropped — the loop only ever reads keys
    // enumerated in EDITABLE_FIELDS above.
  }

  return update
}

// Verifies the caller owns projectId via an explicit column-list read on
// the session client. Returns the project row on success, or null when the
// project does not exist or is not owned — callers must respond 404 either
// way (no existence leak).
async function verifyOwnership(
  supabase: Awaited<ReturnType<typeof createApiClient>>,
  projectId: string,
  userId: string
) {
  const { data } = await supabase
    .from('vault_projects')
    .select('id, user_id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  return data
}

// GET /api/vault/[projectId]/licensing — current pre-cleared terms, or a
// null-terms response when no row exists. Absence is meaningful (D-15a: it
// routes future requests to admin negotiation) and must stay distinguishable
// from "set to empty" — never coerced to a default-shaped object here.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const project = await verifyOwnership(supabase, projectId, user.id)
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const service = createServiceClient()
  const { data: terms, error } = await service
    .from('project_license_terms')
    .select(TERMS_COLUMNS)
    .eq('vault_project_id', projectId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: (terms as ProjectLicenseTerms | null) ?? null })
}

// PATCH /api/vault/[projectId]/licensing — upsert the five pre-clearable
// dimensions (allowlisted above). Keyed on the unique vault_project_id
// (1:1 per migration 081); stamps updated_by/updated_at.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const project = await verifyOwnership(supabase, projectId, user.id)
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const result = sanitize(body)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  if (Object.keys(result).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Ownership check above is the authority decision; migration 081 revoked
  // client INSERT/UPDATE on project_license_terms entirely, so the write
  // itself must run on the service-role client.
  const service = createServiceClient()
  const { data, error } = await service
    .from('project_license_terms')
    .upsert(
      { vault_project_id: projectId, ...result, updated_by: user.id },
      { onConflict: 'vault_project_id' }
    )
    .select(TERMS_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
