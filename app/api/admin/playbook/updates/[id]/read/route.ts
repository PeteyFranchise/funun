import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ALL_STAFF_ROLES, getStaffRoles, type StaffRole } from '@/lib/admin/staff-role'
import { requireStaff } from '@/lib/admin/gate'
import { changeBroadcastAppliesToViewer, isChangeBroadcastSchemaMissing, type ChangeBroadcastRow } from '@/lib/playbook/change-broadcasts'
import { canAccessRoom } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'

const IdSchema = z.string().uuid()

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!IdSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid update id' }, { status: 400 })
  const auth = await requireStaff(ALL_STAFF_ROLES)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const service = createServiceClient()

  const broadcastResult = await service.from('playbook_change_broadcasts').select('*').eq('id', id).maybeSingle()
  if (broadcastResult.error) {
    if (isChangeBroadcastSchemaMissing(broadcastResult.error)) return NextResponse.json({ error: 'Playbook updates are not activated yet' }, { status: 503 })
    return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  }
  if (!broadcastResult.data) return NextResponse.json({ error: 'Playbook update not found' }, { status: 404 })
  const broadcast = broadcastResult.data as ChangeBroadcastRow
  const roles = getStaffRoles(auth.user)
  if (!changeBroadcastAppliesToViewer(broadcast, auth.user.id, roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const grants = await service.from('playbook_room_role_grants').select('role').eq('room_id', broadcast.room_id)
  if (grants.error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!canAccessRoom(roles, (grants.data ?? []).map(row => row.role as StaffRole))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const write = await service.from('playbook_change_broadcast_reads').upsert({ broadcast_id: id, user_id: auth.user.id }, { onConflict: 'broadcast_id,user_id' })
  if (write.error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  return NextResponse.json({ data: { id, isRead: true } })
}
