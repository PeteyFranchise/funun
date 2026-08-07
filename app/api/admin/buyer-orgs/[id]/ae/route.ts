import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff, getStaffRole } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { createNotification } from '@/lib/notifications'
import { buildAeAssignedNotification, buildAeUnassignedNotification } from '@/lib/staff/notifications'

// Canonical RFC-4122 UUID shape, mirrors lib/social/dm.ts's isUuid — the
// body value is interpolated into a service-role update, so any non-UUID
// value must be rejected before it reaches the write.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── PATCH /api/admin/buyer-orgs/[id]/ae ───────────────────────────────────
// Leadership-only AE (re)assignment (D-03 — an AE can never self-assign; the
// edit allowlist in ../route.ts deliberately never includes ae_user_id).
// Accepts either a UUID (assign) or null (unassign). Every write is audited
// (D-04). Reassignment-aware (25-09): the prior ae_user_id is read BEFORE
// the update, in the same handler, so both the newly-assigned AE (gained)
// and the previous AE (lost) can be notified when the assignment actually
// changes hands — not only the new one. Both notifications are best-effort
// (never block the response), mirrors lib/social/activity-emit.ts's
// convention.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  if (!('ae_user_id' in body)) {
    return NextResponse.json({ error: 'ae_user_id is required' }, { status: 400 })
  }
  const rawAeUserId = body.ae_user_id
  const aeUserId: string | null =
    rawAeUserId === null ? null : typeof rawAeUserId === 'string' ? rawAeUserId : ''
  if (aeUserId !== null && !UUID_RE.test(aeUserId)) {
    return NextResponse.json({ error: 'ae_user_id must be a UUID or null' }, { status: 400 })
  }

  const service = createServiceClient()

  // Verify the assignment target is a real, ACTIVE staff member who can hold a
  // Client Partner — an AE or BD (review #8). The UUID-shape check alone let
  // leadership assign a Client Partner to an artist / buyer / stale auth UUID
  // (the auth.users FK accepts any user), producing an unreachable assignment
  // and a misdirected notification. getStaffRole reads the authoritative
  // app_metadata.staff_role, so a deactivated account (staff_role cleared) is
  // rejected too.
  if (aeUserId !== null) {
    const { data: target } = await service.auth.admin.getUserById(aeUserId)
    const targetRole = target?.user ? getStaffRole(target.user) : null
    if (targetRole !== 'ae' && targetRole !== 'bd') {
      return NextResponse.json(
        { error: 'ae_user_id must be an active Account Executive or BD team member.' },
        { status: 400 }
      )
    }
  }

  // Read the PRIOR assignment before writing — required to know whether
  // this is a fresh assignment, a no-op re-assignment, an unassign, or a
  // genuine reassignment away from a different AE (25-09).
  const { data: priorRow } = await service
    .from('buyer_orgs')
    .select('ae_user_id')
    .eq('id', id)
    .maybeSingle()
  const prevAeUserId = (priorRow as { ae_user_id?: string | null } | null)?.ae_user_id ?? null

  const { data, error } = await service
    .from('buyer_orgs')
    .update({ ae_user_id: aeUserId })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'assign_ae',
    targetType: 'buyer_org',
    targetId: id,
    changes: { ae_user_id: aeUserId },
  })

  const orgName = (data as { name?: string } | null)?.name ?? 'this Client Partner'

  if (aeUserId) {
    await createNotification(
      service,
      buildAeAssignedNotification({
        recipientId: aeUserId,
        orgId: id,
        orgName,
        actorId: auth.user.id,
      })
    ).catch(() => {})
  }

  // The assignment changed away from a previous, different AE — notify
  // them too, whether the new value is a different AE or unassigned.
  const changedAwayFromPrevAe = prevAeUserId !== null && prevAeUserId !== aeUserId
  if (changedAwayFromPrevAe) {
    await createNotification(
      service,
      buildAeUnassignedNotification({
        recipientId: prevAeUserId as string,
        orgId: id,
        orgName,
        actorId: auth.user.id,
      })
    ).catch(() => {})
  }

  return NextResponse.json({ data })
}
