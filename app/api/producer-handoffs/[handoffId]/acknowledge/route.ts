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
  if (await checkRateLimit(`producer-handoff-acknowledge:${user.id}`, { maxAttempts: 30, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many acknowledgement attempts. Please slow down.' }, { status: 429 })
  }

  const service = createServiceClient()
  const { data: handoff } = await service
    .from('work_recording_handoffs')
    .select('id, work_id, created_by, recipient_user_id')
    .eq('id', handoffId)
    .eq('recipient_user_id', user.id)
    .maybeSingle()
  if (!handoff) return NextResponse.json({ error: 'Producer handoff not found.' }, { status: 404 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), handoff.work_id, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const { data: inserted, error } = await service
    .from('work_recording_handoff_receipts')
    .upsert(
      { handoff_id: handoffId, work_id: handoff.work_id, recipient_user_id: user.id },
      { onConflict: 'handoff_id', ignoreDuplicates: true }
    )
    .select('handoff_id, acknowledged_at')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  const data = inserted ?? (await service
    .from('work_recording_handoff_receipts')
    .select('handoff_id, acknowledged_at')
    .eq('handoff_id', handoffId)
    .single()).data
  if (!data) return NextResponse.json({ error: 'Could not load the handoff acknowledgement.' }, { status: 500 })

  if (inserted) {
    const [{ data: actor }, { data: work }] = await Promise.all([
      service.from('user_profiles').select('artist_name, handle, avatar_url').eq('id', user.id).maybeSingle(),
      service.from('works').select('title').eq('id', handoff.work_id).maybeSingle(),
    ])
    const actorName = actor?.artist_name || actor?.handle || 'Your collaborator'
    await createNotification(service, {
      userId: handoff.created_by,
      type: 'writer_room_producer_handoff_received',
      title: `${actorName} received your producer handoff`,
      body: `${work?.title ?? 'Your song'}: they have the rough mix and aligned dry vocal.`,
      link: `/vault/works/${handoff.work_id}`,
      data: { workId: handoff.work_id, handoffId },
      actorId: user.id,
      actorName,
      actorAvatarUrl: actor?.avatar_url ?? null,
    })
  }

  return NextResponse.json({ data })
}
