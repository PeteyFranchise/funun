import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'

type RouteCtx = { params: Promise<{ workId: string; sessionId: string; clipId: string }> }

export async function PATCH(request: Request, { params }: RouteCtx) {
  const { workId, sessionId, clipId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })
  const body = (await request.json().catch(() => null)) as {
    removed?: unknown
    muted?: unknown
    startMs?: unknown
    trimStartMs?: unknown
    trimEndMs?: unknown
  } | null

  const { data: session } = await supabase.from('work_recording_sessions').select('id').eq('id', sessionId).eq('work_id', workId).eq('created_by', user.id).maybeSingle()
  if (!session) return NextResponse.json({ error: 'Recording session not found.' }, { status: 404 })
  const { data: clip } = await supabase.from('work_recording_clips').select('id, duration_ms, trim_start_ms, trim_end_ms').eq('id', clipId).eq('session_id', sessionId).maybeSingle()
  if (!clip) return NextResponse.json({ error: 'Vocal section not found.' }, { status: 404 })

  const update: Record<string, unknown> = {}
  if (typeof body?.removed === 'boolean') {
    update.removed_at = body.removed ? new Date().toISOString() : null
    update.removed_by = body.removed ? user.id : null
  }
  if (typeof body?.muted === 'boolean') update.muted = body.muted
  if (body?.startMs !== undefined) {
    const value = Number(body.startMs)
    if (!Number.isInteger(value) || value < 0 || value > 86400000) return NextResponse.json({ error: 'Invalid clip position.' }, { status: 400 })
    update.start_ms = value
  }
  const trimStartMs = body?.trimStartMs === undefined ? undefined : Number(body.trimStartMs)
  const trimEndMs = body?.trimEndMs === undefined ? undefined : Number(body.trimEndMs)
  if ((trimStartMs !== undefined && (!Number.isInteger(trimStartMs) || trimStartMs < 0))
    || (trimEndMs !== undefined && (!Number.isInteger(trimEndMs) || trimEndMs < 0))) {
    return NextResponse.json({ error: 'Invalid clip trim.' }, { status: 400 })
  }
  if (trimStartMs !== undefined) update.trim_start_ms = trimStartMs
  if (trimEndMs !== undefined) update.trim_end_ms = trimEndMs
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'No clip changes supplied.' }, { status: 400 })

  const nextTrimStart = trimStartMs ?? clip.trim_start_ms
  const nextTrimEnd = trimEndMs ?? clip.trim_end_ms
  if (nextTrimStart + nextTrimEnd >= clip.duration_ms) return NextResponse.json({ error: 'Trim must leave some audible vocal.' }, { status: 400 })
  const { data, error } = await supabase.from('work_recording_clips').update(update).eq('id', clipId).eq('session_id', sessionId).select('id').maybeSingle()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not update the vocal section.' }, { status: 409 })
  return NextResponse.json({ data })
}
