import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { normalizeHandoffNote, PRODUCER_HANDOFF_NOTE_MAX } from '@/lib/catalogue/producer-handoff'
import { createNotification } from '@/lib/notifications'
import { checkRateLimit } from '@/lib/security/rate-limit'

type RouteCtx = { params: Promise<{ handoffId: string }> }

const ReturnSchema = z.object({
  versionId: z.string().uuid(),
  note: z.string().max(PRODUCER_HANDOFF_NOTE_MAX).nullable(),
}).strict()

export async function POST(request: Request, { params }: RouteCtx) {
  const { handoffId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await checkRateLimit(`producer-handoff-return:${user.id}`, { maxAttempts: 30, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many returned mixes. Please slow down.' }, { status: 429 })
  }

  const parsed = ReturnSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid returned mix.' }, { status: 400 })

  const service = createServiceClient()
  const { data: handoff } = await service
    .from('work_recording_handoffs')
    .select('id, work_id, created_by, recipient_user_id, created_at')
    .eq('id', handoffId)
    .eq('recipient_user_id', user.id)
    .maybeSingle()
  if (!handoff) return NextResponse.json({ error: 'Producer handoff not found.' }, { status: 404 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), handoff.work_id, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const input = parsed.data
  const { data: existing } = await service
    .from('work_recording_handoff_returns')
    .select('id, handoff_id, version_id')
    .eq('version_id', input.versionId)
    .maybeSingle()
  if (existing) {
    if (existing.handoff_id !== handoffId) {
      return NextResponse.json({ error: 'That take is already linked to another producer handoff.' }, { status: 409 })
    }
    return NextResponse.json({ data: { id: existing.id, version_id: existing.version_id } })
  }

  const { data: version } = await service
    .from('work_versions')
    .select('id, work_id, user_id, source, archived_at, created_at')
    .eq('id', input.versionId)
    .eq('work_id', handoff.work_id)
    .eq('user_id', user.id)
    .maybeSingle()
  const versionTime = version ? Date.parse(version.created_at) : Number.NaN
  const handoffTime = Date.parse(handoff.created_at)
  if (!version || version.source !== 'upload' || version.archived_at || !Number.isFinite(versionTime) || !Number.isFinite(handoffTime) || versionTime < handoffTime) {
    return NextResponse.json({ error: 'Return a new active mix you uploaded for this handoff.' }, { status: 409 })
  }

  const note = input.note === null ? null : normalizeHandoffNote(input.note)
  const { error: receiptError } = await service
    .from('work_recording_handoff_receipts')
    .upsert(
      { handoff_id: handoffId, work_id: handoff.work_id, recipient_user_id: user.id },
      { onConflict: 'handoff_id', ignoreDuplicates: true }
    )
  if (receiptError) return NextResponse.json({ error: receiptError.message }, { status: 409 })

  const { data, error } = await service
    .from('work_recording_handoff_returns')
    .insert({ handoff_id: handoffId, work_id: handoff.work_id, version_id: input.versionId, created_by: user.id, note })
    .select('id, version_id')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'The mix saved, but could not be linked to the handoff.' }, { status: 409 })

  const [{ data: actor }, { data: work }] = await Promise.all([
    service.from('user_profiles').select('artist_name, handle, avatar_url').eq('id', user.id).maybeSingle(),
    service.from('works').select('title').eq('id', handoff.work_id).maybeSingle(),
  ])
  const actorName = actor?.artist_name || actor?.handle || 'Your producer'
  await createNotification(service, {
    userId: handoff.created_by,
    type: 'writer_room_producer_mix_returned',
    title: `${actorName} returned a new mix`,
    body: `${work?.title ?? 'Your song'}: the mix is back in the Writer’s Room as a new take.`,
    link: `/vault/works/${handoff.work_id}?version=${input.versionId}`,
    data: { workId: handoff.work_id, handoffId, versionId: input.versionId },
    actorId: user.id,
    actorName,
    actorAvatarUrl: actor?.avatar_url ?? null,
  })

  return NextResponse.json({ data }, { status: 201 })
}
