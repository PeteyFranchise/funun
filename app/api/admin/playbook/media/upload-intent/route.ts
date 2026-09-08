import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isPlaybookEnablementSchemaMissing } from '@/lib/playbook/enablement'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/security/rate-limit'

const BUCKET = 'playbook-media'
const Schema = z.object({
  roomKey: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(180),
  caption: z.string().trim().max(1000).nullable().optional(),
  transcript: z.string().trim().max(50000).nullable().optional(),
  mimeType: z.enum(['video/mp4', 'video/webm']),
  sizeBytes: z.number().int().min(1).max(524288000),
}).strict()

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid training video' }, { status: 400 })
  const auth = await requireRoomAccess(parsed.data.roomKey)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (await checkRateLimit(`playbook-media:${auth.user.id}`, { maxAttempts: 20, windowMs: 24 * 60 * 60 * 1000 })) return NextResponse.json({ error: 'Daily training-media upload limit reached.' }, { status: 429 })
  const service = createServiceClient()
  const { data: room, error: roomError } = await service.from('playbook_rooms').select('id').eq('key', parsed.data.roomKey).maybeSingle()
  if (roomError) return NextResponse.json({ error: roomError.message }, { status: 500 })
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  const extension = parsed.data.mimeType === 'video/mp4' ? 'mp4' : 'webm'
  const assetId = randomUUID()
  const storagePath = `${room.id}/${auth.user.id}/${assetId}.${extension}`
  const { error: assetError } = await service.from('playbook_media_assets').insert({ id: assetId, room_id: room.id, storage_path: storagePath, title: parsed.data.title, caption: parsed.data.caption || null, transcript: parsed.data.transcript || null, mime_type: parsed.data.mimeType, size_bytes: parsed.data.sizeBytes, created_by: auth.user.id })
  if (assetError) {
    if (isPlaybookEnablementSchemaMissing(assetError)) return NextResponse.json({ error: 'Private Playbook media is built but not activated yet.' }, { status: 503 })
    return NextResponse.json({ error: assetError.message }, { status: 500 })
  }
  const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(storagePath, { upsert: false })
  if (error || !data) {
    await service.from('playbook_media_assets').update({ status: 'failed' }).eq('id', assetId)
    return NextResponse.json({ error: error?.message ?? 'Could not prepare upload' }, { status: 500 })
  }
  return NextResponse.json({ data: { assetId, path: storagePath, token: data.token, contentType: parsed.data.mimeType } })
}
