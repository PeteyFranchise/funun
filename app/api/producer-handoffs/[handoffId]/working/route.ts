import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { createNotification } from '@/lib/notifications'
import { checkRateLimit } from '@/lib/security/rate-limit'

type RouteCtx = { params: Promise<{ handoffId: string }> }

export async function POST(_request: Request, { params }: RouteCtx) {
  const { handoffId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await checkRateLimit(`producer-handoff-working:${user.id}`, { maxAttempts: 30, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many progress updates. Please slow down.' }, { status: 429 })
  }

  const { data: handoff } = await supabase
    .from('work_recording_handoffs')
    .select('id, work_id, created_by, recipient_user_id')
    .eq('id', handoffId)
    .eq('recipient_user_id', user.id)
    .maybeSingle()
  if (!handoff) return NextResponse.json({ error: 'Producer handoff not found.' }, { status: 404 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), handoff.work_id, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const service = createServiceClient()
  const { data, error } = await service.rpc('mark_producer_handoff_working', {
    p_handoff_id: handoffId,
    p_producer: user.id,
  })
  const progress = Array.isArray(data) ? data[0] : data
  if (error || !progress) return NextResponse.json({ error: error?.message ?? 'Could not save that progress update.' }, { status: 409 })

  if (progress.inserted) {
    const [{ data: actor }, { data: work }] = await Promise.all([
      service.from('user_profiles').select('artist_name, handle, avatar_url').eq('id', user.id).maybeSingle(),
      service.from('works').select('title').eq('id', handoff.work_id).maybeSingle(),
    ])
    const actorName = actor?.artist_name || actor?.handle || 'Your producer'
    await createNotification(service, {
      userId: handoff.created_by,
      type: 'writer_room_producer_working',
      title: `${actorName} is working on your song`,
      body: `${work?.title ?? 'Your song'}: the producer pack is in motion. No deadline or approval was created.`,
      link: `/vault/works/${handoff.work_id}?handoff=${handoffId}`,
      data: { workId: handoff.work_id, handoffId },
      actorId: user.id,
      actorName,
      actorAvatarUrl: actor?.avatar_url ?? null,
    })
  }

  return NextResponse.json({ data: progress })
}
