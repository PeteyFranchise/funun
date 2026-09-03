import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { BUCKET, MAX_BYTES, resolveAudioType } from '@/lib/catalogue/audio'
import { checkRateLimit } from '@/lib/security/rate-limit'

type RouteCtx = { params: Promise<{ workId: string; sessionId: string }> }

export async function POST(request: Request, { params }: RouteCtx) {
  const { workId, sessionId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await checkRateLimit(`recording-clip:${user.id}`, { maxAttempts: 120, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many vocal uploads. Please slow down.' }, { status: 429 })
  }
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const { data: session } = await supabase
    .from('work_recording_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('work_id', workId)
    .eq('created_by', user.id)
    .eq('status', 'draft')
    .maybeSingle()
  if (!session) return NextResponse.json({ error: 'Recording session not found.' }, { status: 404 })

  const body = (await request.json().catch(() => null)) as { fileName?: unknown; mimeType?: unknown; size?: unknown } | null
  const fileName = typeof body?.fileName === 'string' ? body.fileName.slice(0, 255) : ''
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : ''
  const size = Number(body?.size)
  const audioType = resolveAudioType(mimeType, fileName)
  if (!audioType || !Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: 'The vocal clip is empty, too large, or uses an unsupported format.' }, { status: 400 })
  }

  const clipId = randomUUID()
  const path = `${workId}/recording-sessions/${sessionId}/${clipId}.${audioType.ext}`
  const service = createServiceClient()
  const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false })
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not prepare the vocal upload.' }, { status: 500 })
  return NextResponse.json({ data: { clipId, path, token: data.token, contentType: audioType.contentType } })
}
