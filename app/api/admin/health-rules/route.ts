import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'

// ─── GET/PATCH /api/admin/health-rules — the D-31.1-03 settings singleton ──
// Leadership-only read/write of health_rules_config (id=1, migration 128),
// the row lib/client-partners/health.ts's computeHealth() reads on every
// render. Saves apply immediately — nothing is recomputed here (D-06
// doctrine); the next render just reads this row.
//
// Mass-assignment safety mirrors lib/client-partners/contacts.ts's
// pickContactFields + app/api/admin/buyer-orgs/[id]/route.ts's allowlist
// discipline (T-31.1-mass-assign): unknown fields are silently dropped by
// the allowlist BEFORE the zod .strict() schema ever sees them, so an
// unlisted key never even trips a 400 — it is simply never written.
// Threshold ordering (good_within < warning_after < at_risk_after <
// cold_after, D-31.1-03) is validated against the CURRENT row merged with
// the incoming partial patch, so a single-field PATCH cannot slip a
// misordered value past a value it isn't itself changing.

export const CONFIG_ROW_ID = 1

export const HEALTH_RULES_EDITABLE_FIELDS = [
  'good_within_days',
  'warning_after_days',
  'at_risk_after_days',
  'cold_after_days',
  'keep_warm_open_brief',
  'keep_warm_open_deal',
  'keep_warm_recent_selects',
  'recent_selects_days',
  'keep_warm_recent_contact',
  'recent_contact_days',
] as const

export type HealthRulesEditableField = (typeof HEALTH_RULES_EDITABLE_FIELDS)[number]

const HealthRulesPatchSchema = z
  .object({
    good_within_days: z.number().int().positive(),
    warning_after_days: z.number().int().positive(),
    at_risk_after_days: z.number().int().positive(),
    cold_after_days: z.number().int().positive(),
    keep_warm_open_brief: z.boolean(),
    keep_warm_open_deal: z.boolean(),
    keep_warm_recent_selects: z.boolean(),
    recent_selects_days: z.number().int().positive(),
    keep_warm_recent_contact: z.boolean(),
    recent_contact_days: z.number().int().positive(),
  })
  .partial()
  .strict()

// Pure allowlist filter — the mass-assignment backstop independent of the
// zod schema above, mirrors lib/client-partners/contacts.ts's
// pickContactFields exactly.
function pickHealthRulesFields(body: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const key of HEALTH_RULES_EDITABLE_FIELDS) {
    if (!(key in body)) continue
    picked[key] = body[key]
  }
  return picked
}

const CONFIG_COLUMNS =
  'id, good_within_days, warning_after_days, at_risk_after_days, cold_after_days, keep_warm_open_brief, keep_warm_open_deal, keep_warm_recent_selects, recent_selects_days, keep_warm_recent_contact, recent_contact_days, prospect_image_url, updated_by, updated_at'

type ThresholdCandidate = {
  good_within_days: number
  warning_after_days: number
  at_risk_after_days: number
  cold_after_days: number
}

// Strict ordering per D-31.1-03's must_haves truth — overlapping/misordered
// thresholds are rejected (400), never silently coerced.
function thresholdsAreOrdered(candidate: ThresholdCandidate): boolean {
  return (
    candidate.good_within_days < candidate.warning_after_days &&
    candidate.warning_after_days < candidate.at_risk_after_days &&
    candidate.at_risk_after_days < candidate.cold_after_days
  )
}

export async function GET() {
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const { data, error } = await service
    .from('health_rules_config')
    .select(CONFIG_COLUMNS)
    .eq('id', CONFIG_ROW_ID)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Health rules config not found' }, { status: 404 })

  return NextResponse.json({ data })
}

export async function PATCH(request: Request) {
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = HealthRulesPatchSchema.safeParse(pickHealthRulesFields(body))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid health rules payload' }, { status: 400 })
  }

  const fields = parsed.data
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: current, error: readError } = await service
    .from('health_rules_config')
    .select('good_within_days, warning_after_days, at_risk_after_days, cold_after_days')
    .eq('id', CONFIG_ROW_ID)
    .maybeSingle()

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  if (!current) return NextResponse.json({ error: 'Health rules config not found' }, { status: 404 })

  const candidate: ThresholdCandidate = {
    good_within_days: fields.good_within_days ?? current.good_within_days,
    warning_after_days: fields.warning_after_days ?? current.warning_after_days,
    at_risk_after_days: fields.at_risk_after_days ?? current.at_risk_after_days,
    cold_after_days: fields.cold_after_days ?? current.cold_after_days,
  }

  if (!thresholdsAreOrdered(candidate)) {
    return NextResponse.json(
      { error: 'Thresholds must be strictly increasing: good < warning < at-risk < cold.' },
      { status: 400 }
    )
  }

  const { data, error } = await service
    .from('health_rules_config')
    .update({ ...fields, updated_by: auth.user.id })
    .eq('id', CONFIG_ROW_ID)
    .select(CONFIG_COLUMNS)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Unconditional — mirrors grantOrRevokeVerification's "log even
  // idempotent actions" discipline (D-04).
  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'update_health_rules_config',
    targetType: 'health_rules_config',
    targetId: String(CONFIG_ROW_ID),
    changes: fields,
  })

  return NextResponse.json({ data })
}
