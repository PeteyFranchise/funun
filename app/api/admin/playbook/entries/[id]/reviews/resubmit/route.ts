import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createNotification } from '@/lib/notifications'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { isReviewSchemaMissing, REVIEW_SCHEMA_UNAVAILABLE, ReviewResubmitSchema } from '@/lib/playbook/reviews'
import { createServiceClient } from '@/lib/supabase/server'
import { logStaffAction } from '@/lib/staff/audit'

const idSchema = z.string().uuid()

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })
  const parsed = ReviewResubmitSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid review resubmission' }, { status: 400 })
  const auth = await requireRoomAccess(parsed.data.roomKey)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const service = createServiceClient()
  const { data: room } = await service.from('playbook_rooms').select('id').eq('key', parsed.data.roomKey).maybeSingle()
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  const { data: entry, error: entryError } = await service
    .from('playbook_entries').select('id, room_id, title').eq('id', id).eq('room_id', room.id).maybeSingle()
  if (entryError || !entry) return NextResponse.json({ error: 'Entry not found in this room' }, { status: entryError ? 500 : 404 })
  const { data: previousRound, error: roundError } = await service
    .from('playbook_review_rounds').select('id').eq('id', parsed.data.previousRoundId).eq('entry_id', id).eq('room_id', room.id).maybeSingle()
  if (isReviewSchemaMissing(roundError)) return NextResponse.json({ error: REVIEW_SCHEMA_UNAVAILABLE }, { status: 503 })
  if (roundError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!previousRound) return NextResponse.json({ error: 'Previous review round not found in this room' }, { status: 404 })

  const { data: newRoundId, error } = await service.rpc('resubmit_playbook_review_round', {
    p_entry_id: id,
    p_actor_id: auth.user.id,
    p_previous_round_id: parsed.data.previousRoundId,
    p_expected_draft_version: parsed.data.expectedDraftVersion,
  })
  if (isReviewSchemaMissing(error)) return NextResponse.json({ error: REVIEW_SCHEMA_UNAVAILABLE }, { status: 503 })
  if (error) {
    const status = /changed|newer draft|requested change/i.test(error.message) ? 409 : /Only the draft author/i.test(error.message) ? 403 : 500
    return NextResponse.json({ error: 'Request could not be completed.' }, { status })
  }
  const { data: reviewers } = await service
    .from('playbook_review_threads').select('created_by').eq('review_round_id', parsed.data.previousRoundId)
  const recipients = Array.from(new Set((reviewers ?? []).map(row => row.created_by as string))).filter(userId => userId !== auth.user.id)
  await Promise.all(recipients.map(userId => createNotification(service, {
    userId,
    type: 'playbook_review_resubmitted',
    title: `Ready for re-review: ${entry.title as string}`,
    link: `/admin/playbook/${parsed.data.roomKey}?reviewRound=${newRoundId}`,
    data: { entryId: id, previousRoundId: parsed.data.previousRoundId, reviewRoundId: newRoundId },
    actorId: auth.user.id,
  })))
  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'resubmit_playbook_review_round',
    targetType: 'playbook_review_round',
    targetId: newRoundId as string,
    changes: { entryId: id, previousRoundId: parsed.data.previousRoundId, draftVersion: parsed.data.expectedDraftVersion },
  })
  return NextResponse.json({ data: { id: newRoundId } })
}
