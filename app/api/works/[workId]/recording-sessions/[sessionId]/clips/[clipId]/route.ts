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
  const body = (await request.json().catch(() => null)) as { removed?: unknown } | null
  if (typeof body?.removed !== 'boolean') return NextResponse.json({ error: 'Invalid clip update.' }, { status: 400 })

  const { data: session } = await supabase.from('work_recording_sessions').select('id').eq('id', sessionId).eq('work_id', workId).eq('created_by', user.id).maybeSingle()
  if (!session) return NextResponse.json({ error: 'Recording session not found.' }, { status: 404 })
  const update = body.removed
    ? { removed_at: new Date().toISOString(), removed_by: user.id }
    : { removed_at: null, removed_by: null }
  const { data, error } = await supabase.from('work_recording_clips').update(update).eq('id', clipId).eq('session_id', sessionId).select('id').maybeSingle()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not update the vocal section.' }, { status: 409 })
  return NextResponse.json({ data })
}
