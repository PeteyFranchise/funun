import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { signVersionUrls } from '@/lib/catalogue/audio'

type RouteCtx = { params: Promise<{ workId: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: Request, { params }: RouteCtx) {
  const { workId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const versionId = new URL(request.url).searchParams.get('versionId') ?? ''
  if (!UUID.test(versionId)) return NextResponse.json({ data: null })

  const columns = 'id, base_version_id, rendered_version_id, status, beat_gain, vocal_gain, timing_offset_ms'
  let { data: session } = await supabase
    .from('work_recording_sessions')
    .select(columns)
    .eq('work_id', workId)
    .eq('created_by', user.id)
    .eq('rendered_version_id', versionId)
    .maybeSingle()
  if (!session) {
    const result = await supabase
      .from('work_recording_sessions')
      .select(columns)
      .eq('work_id', workId)
      .eq('created_by', user.id)
      .eq('base_version_id', versionId)
      .eq('status', 'draft')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    session = result.data
  }
  if (!session) return NextResponse.json({ data: null })

  const [{ data: base }, { data: clips }] = await Promise.all([
    supabase.from('work_versions').select('id, label, source, audio_path, duration_seconds').eq('id', session.base_version_id).eq('work_id', workId).maybeSingle(),
    supabase.from('work_recording_clips').select('id, audio_path, start_ms, duration_ms, position, trim_start_ms, trim_end_ms, muted, removed_at').eq('session_id', session.id).order('position'),
  ])
  if (!base) return NextResponse.json({ data: null })
  const paths = [base.audio_path, ...(clips ?? []).map(clip => clip.audio_path)]
  const urls = await signVersionUrls(paths)
  return NextResponse.json({
    data: {
      id: session.id,
      status: session.status,
      renderedVersionId: session.rendered_version_id,
      beatGain: Number(session.beat_gain),
      vocalGain: Number(session.vocal_gain),
      timingOffsetMs: session.timing_offset_ms,
      base: { id: base.id, label: base.label, source: base.source, playbackUrl: urls[base.audio_path], durationSeconds: base.duration_seconds },
      clips: (clips ?? []).flatMap(clip => urls[clip.audio_path] ? [{
        id: clip.id, playbackUrl: urls[clip.audio_path], startMs: clip.start_ms,
        durationMs: clip.duration_ms, position: clip.position,
        trimStartMs: clip.trim_start_ms, trimEndMs: clip.trim_end_ms,
        muted: clip.muted, removed: clip.removed_at !== null,
      }] : []),
    },
  })
}

export async function POST(request: Request, { params }: RouteCtx) {
  const { workId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await checkRateLimit(`recording-session:${user.id}`, { maxAttempts: 30, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many recording sessions. Please slow down.' }, { status: 429 })
  }

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const body = (await request.json().catch(() => null)) as { baseVersionId?: unknown } | null
  const baseVersionId = typeof body?.baseVersionId === 'string' ? body.baseVersionId : ''
  if (!UUID.test(baseVersionId)) return NextResponse.json({ error: 'Choose a valid backing take.' }, { status: 400 })

  const { data: version } = await supabase
    .from('work_versions')
    .select('id')
    .eq('id', baseVersionId)
    .eq('work_id', workId)
    .maybeSingle()
  if (!version) return NextResponse.json({ error: 'Backing take not found.' }, { status: 404 })

  const { data, error } = await supabase
    .from('work_recording_sessions')
    .insert({ work_id: workId, base_version_id: baseVersionId, created_by: user.id })
    .select('id')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not start the recording session.' }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
