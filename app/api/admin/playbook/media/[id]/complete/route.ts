import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ALL_STAFF_ROLES, getStaffRoles, requireStaff } from '@/lib/admin/gate'
import { canAccessRoom } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'

const Params = z.object({ id: z.string().uuid() })

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = Params.safeParse(await context.params)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid media asset' }, { status: 400 })
  const auth = await requireStaff(ALL_STAFF_ROLES)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const service = createServiceClient()
  const asset = await service.from('playbook_media_assets').select('id, room_id, storage_path, status').eq('id', parsed.data.id).maybeSingle()
  if (asset.error) return NextResponse.json({ error: asset.error.message }, { status: 500 })
  if (!asset.data) return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  const grants = await service.from('playbook_room_role_grants').select('role').eq('room_id', asset.data.room_id)
  if (!canAccessRoom(getStaffRoles(auth.user), (grants.data ?? []).map(row => row.role))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const slash = asset.data.storage_path.lastIndexOf('/')
  const folder = asset.data.storage_path.slice(0, slash)
  const filename = asset.data.storage_path.slice(slash + 1)
  const listed = await service.storage.from('playbook-media').list(folder, { search: filename, limit: 1 })
  if (listed.error || !listed.data?.some(item => item.name === filename)) return NextResponse.json({ error: 'Upload has not reached private storage yet' }, { status: 409 })
  const update = await service.from('playbook_media_assets').update({ status: 'ready', ready_at: new Date().toISOString() }).eq('id', parsed.data.id).eq('status', 'pending')
  if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 })
  return NextResponse.json({ data: { streamUrl: `/api/admin/playbook/media/${parsed.data.id}/stream` } })
}
