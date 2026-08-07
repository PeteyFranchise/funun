import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { createNotification } from '@/lib/notifications'
import { buildAeAssignedNotification } from '@/lib/staff/notifications'

// Canonical RFC-4122 UUID shape, mirrors lib/social/dm.ts's isUuid — the
// body value is interpolated into a service-role update, so any non-UUID
// value must be rejected before it reaches the write.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── PATCH /api/admin/buyer-orgs/[id]/ae ───────────────────────────────────
// Leadership-only AE (re)assignment (D-03 — an AE can never self-assign; the
// edit allowlist in ../route.ts deliberately never includes ae_user_id).
// Accepts either a UUID (assign) or null (unassign). Every write is audited
// (D-04); a fresh assignment also notifies the newly-assigned AE via the
// existing notifications table (best-effort — never blocks the response,
// mirrors lib/social/activity-emit.ts's convention).
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

  if (aeUserId) {
    await createNotification(
      service,
      buildAeAssignedNotification({
        recipientId: aeUserId,
        orgId: id,
        orgName: (data as { name?: string } | null)?.name ?? 'this Client Partner',
        actorId: auth.user.id,
      })
    ).catch(() => {})
  }

  return NextResponse.json({ data })
}
