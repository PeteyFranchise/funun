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
  const asset = await service.from('playbook_media_assets').select('id, room_id, storage_path, status, mime_type, size_bytes, created_by').eq('id', parsed.data.id).maybeSingle()
  if (asset.error) return NextResponse.json({ error: 'Media could not be loaded.' }, { status: 500 })
  if (!asset.data) return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  if (asset.data.created_by !== auth.user.id) {
    return NextResponse.json({ error: 'Only the uploader can complete this media upload.' }, { status: 403 })
  }
  const grants = await service.from('playbook_room_role_grants').select('role').eq('room_id', asset.data.room_id)
  if (!canAccessRoom(getStaffRoles(auth.user), (grants.data ?? []).map(row => row.role))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const stored = await service.storage.from('playbook-media').info(asset.data.storage_path)
  if (stored.error || !stored.data) {
    return NextResponse.json({ error: 'Upload has not reached private storage yet' }, { status: 409 })
  }
  if (
    stored.data.size !== asset.data.size_bytes ||
    stored.data.contentType !== asset.data.mime_type
  ) {
    await service.storage.from('playbook-media').remove([asset.data.storage_path])
    await service.from('playbook_media_assets').update({ status: 'failed' }).eq('id', parsed.data.id)
    return NextResponse.json({ error: 'Stored media does not match the upload intent.' }, { status: 400 })
  }

  const signed = await service.storage.from('playbook-media').createSignedUrl(asset.data.storage_path, 60)
  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ error: 'Media verification is temporarily unavailable.' }, { status: 503 })
  }
  const sampleResponse = await fetch(signed.data.signedUrl, { headers: { Range: 'bytes=0-15' } }).catch(() => null)
  const sample = sampleResponse?.ok ? new Uint8Array(await sampleResponse.arrayBuffer()) : null
  const isMp4 = sample && sample.length >= 8 && String.fromCharCode(...sample.slice(4, 8)) === 'ftyp'
  const isWebm = sample && sample.length >= 4 && sample[0] === 0x1a && sample[1] === 0x45 && sample[2] === 0xdf && sample[3] === 0xa3
  if ((asset.data.mime_type === 'video/mp4' && !isMp4) || (asset.data.mime_type === 'video/webm' && !isWebm)) {
    await service.storage.from('playbook-media').remove([asset.data.storage_path])
    await service.from('playbook_media_assets').update({ status: 'failed' }).eq('id', parsed.data.id)
    return NextResponse.json({ error: 'The uploaded file is not a valid training video.' }, { status: 400 })
  }
  const update = await service.from('playbook_media_assets').update({ status: 'ready', ready_at: new Date().toISOString() }).eq('id', parsed.data.id).eq('status', 'pending')
  if (update.error) return NextResponse.json({ error: 'Media status could not be saved.' }, { status: 500 })
  return NextResponse.json({ data: { streamUrl: `/api/admin/playbook/media/${parsed.data.id}/stream` } })
}
