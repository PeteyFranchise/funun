import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'

type RouteCtx = { params: Promise<{ workId: string; sessionId: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function PATCH(request: Request, { params }: RouteCtx) {
  const { workId, sessionId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })
  if (!UUID.test(sessionId)) return NextResponse.json({ error: 'Invalid recording session.' }, { status: 400 })

  const body = (await request.json().catch(() => null)) as {
    renderedVersionId?: unknown
    beatGain?: unknown
    vocalGain?: unknown
    timingOffsetMs?: unknown
  } | null
  const renderedVersionId = typeof body?.renderedVersionId === 'string' ? body.renderedVersionId : ''
  const beatGain = Number(body?.beatGain)
  const vocalGain = Number(body?.vocalGain)
  const timingOffsetMs = Number(body?.timingOffsetMs)
  if (!UUID.test(renderedVersionId) || !Number.isFinite(beatGain) || beatGain < 0 || beatGain > 1.5
    || !Number.isFinite(vocalGain) || vocalGain < 0 || vocalGain > 1.5
    || !Number.isInteger(timingOffsetMs) || timingOffsetMs < -2000 || timingOffsetMs > 2000) {
    return NextResponse.json({ error: 'Invalid recording settings.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('work_recording_sessions')
    .update({ rendered_version_id: renderedVersionId, beat_gain: beatGain, vocal_gain: vocalGain, timing_offset_ms: timingOffsetMs, status: 'saved' })
    .eq('id', sessionId)
    .eq('work_id', workId)
    .eq('created_by', user.id)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not finish the recording session.' }, { status: 409 })
  return NextResponse.json({ data })
}
