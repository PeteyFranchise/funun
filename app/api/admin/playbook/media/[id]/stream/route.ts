import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ALL_STAFF_ROLES, getStaffRoles, requireStaff } from '@/lib/admin/gate'
import { canAccessRoom } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = z.string().uuid().safeParse((await context.params).id)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid media asset' }, { status: 400 })
  const auth = await requireStaff(ALL_STAFF_ROLES)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const service = createServiceClient()
  const asset = await service.from('playbook_media_assets').select('room_id, storage_path, status').eq('id', parsed.data).maybeSingle()
  if (asset.error) return NextResponse.json({ error: asset.error.message }, { status: 500 })
  if (!asset.data || asset.data.status !== 'ready') return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  const grants = await service.from('playbook_room_role_grants').select('role').eq('room_id', asset.data.room_id)
  if (!canAccessRoom(getStaffRoles(auth.user), (grants.data ?? []).map(row => row.role))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const signed = await service.storage.from('playbook-media').createSignedUrl(asset.data.storage_path, 300)
  if (signed.error || !signed.data) return NextResponse.json({ error: signed.error?.message ?? 'Playback unavailable' }, { status: 500 })
  return NextResponse.redirect(signed.data.signedUrl, 302)
}
