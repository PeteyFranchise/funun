import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { BUCKET, MAX_BYTES, resolveAudioType } from '@/lib/catalogue/audio'

type RouteCtx = { params: Promise<{ workId: string; sessionId: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request, { params }: RouteCtx) {
  const { workId, sessionId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  const body = (await request.json().catch(() => null)) as {
    clipId?: unknown; path?: unknown; startMs?: unknown; durationMs?: unknown; position?: unknown
  } | null
  const clipId = typeof body?.clipId === 'string' ? body.clipId : ''
  const path = typeof body?.path === 'string' ? body.path : ''
  const startMs = Number(body?.startMs)
  const durationMs = Number(body?.durationMs)
  const position = Number(body?.position)
  const expectedPrefix = `${workId}/recording-sessions/${sessionId}/${clipId}.`
  const audioType = resolveAudioType('', path)
  if (!UUID.test(clipId) || !path.startsWith(expectedPrefix) || !audioType
    || !Number.isInteger(startMs) || startMs < 0 || startMs > 86400000
    || !Number.isInteger(durationMs) || durationMs < 1 || durationMs > 86400000
    || !Number.isInteger(position) || position < 0) {
    return NextResponse.json({ error: 'Invalid vocal clip reference.' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: stored, error: infoError } = await service.storage.from(BUCKET).info(path)
  const size = stored?.size ?? 0
  if (infoError || !stored || size <= 0 || size > MAX_BYTES || resolveAudioType(stored.contentType ?? '', path)?.ext !== audioType.ext) {
    if (stored) await service.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: 'The vocal clip upload is incomplete or invalid.' }, { status: 409 })
  }

  const { data, error } = await supabase.from('work_recording_clips').insert({
    id: clipId,
    session_id: sessionId,
    created_by: user.id,
    audio_path: path,
    audio_ext: audioType.ext,
    audio_size: size,
    start_ms: startMs,
    duration_ms: durationMs,
    position,
  }).select('id').single()
  if (error || !data) {
    await service.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: error?.message ?? 'Could not retain the vocal clip.' }, { status: 500 })
  }
  return NextResponse.json({ data }, { status: 201 })
}
