import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { isAssignedToOrg } from '@/lib/staff/scope'
import { logStaffAction } from '@/lib/staff/audit'
import { BUYER_ORG_STATUS_VALUES } from '@/lib/buyers/schema'

// Mass-assignment allowlist (D-03, mirrors app/api/profile/route.ts's
// EDITABLE_FIELDS convention). Deliberately EXCLUDES `verified`/
// `verified_at`/`created_by` (admin-audit fields), `is_personal` (system
// flag), and `ae_user_id` (assignment is a separate leadership-only route,
// app/api/admin/buyer-orgs/[id]/ae/route.ts — never mass-assignable here).
// Phase 23 (23-06) extends v1's `name`-only list with `status` (the
// pending_onboarding -> active onboarding-completion transition, validated
// against BUYER_ORG_STATUS_VALUES below) and `use_case` (a staff-editable
// correction of the qualifying answer captured at register). The other
// migration-095 lead/CRM fields (contact_name/contact_email/contact_phone/
// contact_role/source) stay out of this allowlist for v1 — no edit surface
// for them yet. 31.1 plan 04 adds `pipeline_stage_id` (D-10) — the org's
// current stage in the leadership-configurable pipeline model (migration
// 128); moving it also stamps `stage_entered_at` (below), never mass-
// assignable directly.
const STAFF_EDITABLE_BUYER_ORG_FIELDS = ['name', 'status', 'use_case', 'pipeline_stage_id'] as const

// Canonical RFC-4122 UUID shape, mirrors the AE-assignment route's UUID_RE
// (app/api/admin/buyer-orgs/[id]/ae/route.ts) — pipeline_stage_id is a
// service-role FK reference, so any non-UUID value must be rejected before
// it reaches the write.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── PATCH /api/admin/buyer-orgs/[id] ──────────────────────────────────────
// Assignment-scoped, field-allowlisted, audited buyer-org edit (D-03/D-04).
// Leadership may edit any org; AE/BD may edit only an org they are assigned
// to (isAssignedToOrg gates the write — Pitfall 4 also requires the
// list/GET path to be scoped identically, handled in
// app/api/admin/buyer-orgs/route.ts). Scope denial returns 404, not 403, to
// avoid leaking org existence to a staff caller who isn't assigned to it.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(['leadership', 'ae', 'bd'])
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params
  const service = createServiceClient()

  // Always load the current row now (D-10): a pipeline_stage_id change
  // needs the CURRENT stage to decide whether to stamp stage_entered_at
  // (below), and non-leadership callers need the same row for the scope
  // check — one fetch serves both, regardless of role.
  const { data: orgRow } = await service
    .from('buyer_orgs')
    .select('id, ae_user_id, pipeline_stage_id')
    .eq('id', id)
    .maybeSingle()

  if (auth.staffRole !== 'leadership' && !isAssignedToOrg(orgRow, auth.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  for (const key of STAFF_EDITABLE_BUYER_ORG_FIELDS) {
    if (!(key in body)) continue
    const value = body[key]
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    // T-23-19: validate status against the CHECK-constraint enum BEFORE any
    // DB write is attempted — an invalid status must never reach the
    // update() call below, mirroring the string-trim loop's own discipline.
    if (
      key === 'status' &&
      !BUYER_ORG_STATUS_VALUES.includes(trimmed as (typeof BUYER_ORG_STATUS_VALUES)[number])
    ) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${BUYER_ORG_STATUS_VALUES.join(', ')}` },
        { status: 400 }
      )
    }
    if (key === 'pipeline_stage_id' && !UUID_RE.test(trimmed)) {
      return NextResponse.json({ error: 'pipeline_stage_id must be a UUID' }, { status: 400 })
    }
    update[key] = trimmed
  }

  // D-10: stamp stage_entered_at = now() only when the stage actually
  // changes — never on a same-value PATCH (a no-op resubmit must not reset
  // the "days in stage" clock).
  if (typeof update.pipeline_stage_id === 'string') {
    const currentStageId = (orgRow as { pipeline_stage_id?: string | null } | null)?.pipeline_stage_id ?? null
    if (update.pipeline_stage_id !== currentStageId) {
      update.stage_entered_at = new Date().toISOString()
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Scope-safe write (review #8): for non-leadership the UPDATE itself carries the
  // assignment predicate, so the mutation cannot slip through a TOCTOU window
  // between the scope-check read above and this write (e.g. a concurrent
  // reassignment). If nothing matches the scope, no row is returned → 404 (not
  // 403), matching the existence-hiding behaviour of the pre-check above.
  let writeQuery = service.from('buyer_orgs').update(update).eq('id', id)
  if (auth.staffRole !== 'leadership') {
    writeQuery = writeQuery.eq('ae_user_id', auth.user.id)
  }
  const { data, error } = await writeQuery.select().maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Unconditional — mirrors grantOrRevokeVerification's "log even
  // idempotent actions" discipline (D-04).
  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'edit_buyer_org',
    targetType: 'buyer_org',
    targetId: id,
    changes: update,
  })

  return NextResponse.json({ data })
}
