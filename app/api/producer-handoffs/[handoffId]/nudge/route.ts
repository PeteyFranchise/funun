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
  if (await checkRateLimit(`producer-handoff-nudge:${user.id}`, { maxAttempts: 20, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many reminders. Please slow down.' }, { status: 429 })
  }

  const { data: handoff } = await supabase
    .from('work_recording_handoffs')
    .select('id, work_id, created_by, recipient_user_id')
    .eq('id', handoffId)
    .eq('created_by', user.id)
    .maybeSingle()
  if (!handoff?.recipient_user_id) return NextResponse.json({ error: 'Producer handoff not found.' }, { status: 404 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), handoff.work_id, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const service = createServiceClient()
  const { data, error } = await service.rpc('nudge_producer_handoff', {
    p_handoff_id: handoffId,
    p_sender: user.id,
  })
  const nudge = Array.isArray(data) ? data[0] : data
  if (error || !nudge) {
    const cooldown = error?.message?.includes('cooldown')
    return NextResponse.json({ error: cooldown ? 'A reminder was already sent in the last 24 hours.' : error?.message ?? 'Could not send that reminder.' }, { status: cooldown ? 429 : 409 })
  }

  const [{ data: actor }, { data: work }] = await Promise.all([
    service.from('user_profiles').select('artist_name, handle, avatar_url').eq('id', user.id).maybeSingle(),
    service.from('works').select('title').eq('id', handoff.work_id).maybeSingle(),
  ])
  const actorName = actor?.artist_name || actor?.handle || 'A collaborator'
  await createNotification(service, {
    userId: handoff.recipient_user_id,
    type: 'writer_room_producer_nudge',
    title: `${actorName} checked in on a producer handoff`,
    body: `${work?.title ?? 'Your song'}: a gentle reminder to open the producer pack when you are ready.`,
    link: `/vault/producer-inbox?handoff=${handoffId}`,
    data: { workId: handoff.work_id, handoffId, nudgeId: nudge.nudge_id },
    actorId: user.id,
    actorName,
    actorAvatarUrl: actor?.avatar_url ?? null,
  })

  return NextResponse.json({ data: nudge }, { status: 201 })
}
