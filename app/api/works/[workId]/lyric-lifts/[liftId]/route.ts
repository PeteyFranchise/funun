import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { loadLyricLiftView } from '@/lib/catalogue/lyric-lift-service'

type RouteContext = { params: Promise<{ workId: string; liftId: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const { workId, liftId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })
  const view = await loadLyricLiftView(createServiceClient(), { workId, liftId })
  if (!view) return NextResponse.json({ error: 'Lyric Lift not found.' }, { status: 404 })
  return NextResponse.json({ data: view })
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { workId, liftId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const service = createServiceClient()
  const { data: discarded, error } = await service
    .from('work_lyric_lifts')
    .update({
      status: 'discarded',
      discarded_at: new Date().toISOString(),
      discarded_by: user.id,
      error_message: null,
    })
    .eq('id', liftId)
    .eq('work_id', workId)
    .in('status', ['queued', 'processing', 'review', 'failed'])
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!discarded) {
    return NextResponse.json({ error: 'This lyric draft is no longer open.' }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}
