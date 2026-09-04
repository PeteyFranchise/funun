import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { BUCKET, MAX_BYTES, resolveAudioType } from '@/lib/catalogue/audio-mime'
import { resolveIdeaAccess } from '@/lib/ideas/access'
import { buildIdeaRecordingPath, ideaPermissionAllows } from '@/lib/ideas/schema'
import { checkRateLimit } from '@/lib/security/rate-limit'

type RouteCtx = { params: Promise<{ ideaId: string }> }

export async function POST(request: Request, { params }: RouteCtx) {
  const { ideaId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await checkRateLimit(`idea-recording-intent:${user.id}`, { maxAttempts: 80, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many recordings. Please slow down.' }, { status: 429 })
  }
  const access = await resolveIdeaAccess(supabase, ideaId, user.id)
  if (!access.granted || !ideaPermissionAllows(access.permission, 'contribute')) return NextResponse.json({ error: 'Idea not found.' }, { status: 404 })
  const body = (await request.json().catch(() => null)) as { fileName?: unknown; mimeType?: unknown; size?: unknown } | null
  const fileName = typeof body?.fileName === 'string' ? body.fileName.trim().slice(0, 255) : ''
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : ''
  const size = typeof body?.size === 'number' ? body.size : Number.NaN
  const audioType = resolveAudioType(mimeType, fileName)
  if (!Number.isSafeInteger(size) || size <= 0) return NextResponse.json({ error: 'The recording is empty.' }, { status: 400 })
  if (size > MAX_BYTES) return NextResponse.json({ error: `Audio exceeds the ${MAX_BYTES / (1024 * 1024)}MB limit.` }, { status: 400 })
  if (!audioType) return NextResponse.json({ error: 'Use WebM, M4A, MP3, WAV, FLAC, AAC, or OGG audio.' }, { status: 400 })
  const recordingId = randomUUID()
  const path = buildIdeaRecordingPath(ideaId, recordingId, audioType.ext)
  const { data, error } = await createServiceClient().storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false })
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not prepare the recording.' }, { status: 500 })
  return NextResponse.json({ data: { recordingId, path, token: data.token, contentType: audioType.contentType } })
}
