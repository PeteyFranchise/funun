import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isRoomLead } from '@/lib/playbook/entries'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { canAddressReview, isReviewSchemaMissing, REVIEW_SCHEMA_UNAVAILABLE } from '@/lib/playbook/reviews'
import { createServiceClient } from '@/lib/supabase/server'
import { logStaffAction } from '@/lib/staff/audit'
import { createNotification } from '@/lib/notifications'

const idSchema = z.string().uuid()
const TransitionSchema = z.object({
  roomKey: z.string().trim().min(1).max(80),
  expectedStatus: z.enum(['open', 'addressed', 'resolved']),
  status: z.enum(['open', 'addressed', 'resolved']),
}).strict().refine(value => value.expectedStatus !== value.status)

export async function PATCH(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params
  if (!idSchema.safeParse(threadId).success) return NextResponse.json({ error: 'Invalid review thread id' }, { status: 400 })
  const parsed = TransitionSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid review status transition' }, { status: 400 })
  const auth = await requireRoomAccess(parsed.data.roomKey)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const service = createServiceClient()
  const { data: room } = await service.from('playbook_rooms').select('id').eq('key', parsed.data.roomKey).maybeSingle()
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  const { data: thread, error: threadError } = await service
    .from('playbook_review_threads')
    .select('id, entry_id, created_by, feedback_kind, status')
    .eq('id', threadId).eq('room_id', room.id).maybeSingle()
  if (isReviewSchemaMissing(threadError)) return NextResponse.json({ error: REVIEW_SCHEMA_UNAVAILABLE }, { status: 503 })
  if (threadError) return NextResponse.json({ error: threadError.message }, { status: 500 })
  if (!thread) return NextResponse.json({ error: 'Review thread not found in this room' }, { status: 404 })
  const { data: entry, error: entryError } = await service
    .from('playbook_entries').select('author_id, draft_author_id, title').eq('id', thread.entry_id).maybeSingle()
  if (entryError || !entry) return NextResponse.json({ error: entryError?.message ?? 'Entry not found' }, { status: entryError ? 500 : 404 })
  const isApprover = auth.staffRole === 'leadership' || await isRoomLead(service, room.id as string, auth.user.id)
  const isAddressAction = parsed.data.status === 'addressed'
  if (isAddressAction) {
    if (!canAddressReview({
      viewerId: auth.user.id,
      entryAuthorId: entry.author_id as string | null,
      draftAuthorId: entry.draft_author_id as string | null,
      feedbackKind: thread.feedback_kind,
      status: thread.status,
    })) return NextResponse.json({ error: 'Only the draft author can mark an open requested change addressed' }, { status: 403 })
  } else if (!isApprover) {
    return NextResponse.json({ error: 'Only leadership or a room lead can resolve or reopen review threads' }, { status: 403 })
  }
  const { data, error } = await service.rpc('transition_playbook_review_thread', {
    p_thread_id: threadId,
    p_actor_id: auth.user.id,
    p_expected_status: parsed.data.expectedStatus,
    p_new_status: parsed.data.status,
  })
  if (isReviewSchemaMissing(error)) return NextResponse.json({ error: REVIEW_SCHEMA_UNAVAILABLE }, { status: 503 })
  if (error) return NextResponse.json({ error: error.message }, { status: /changed/i.test(error.message) ? 409 : 500 })
  await logStaffAction(service, {
    actorId: auth.user.id,
    action: parsed.data.status === 'resolved'
      ? 'resolve_playbook_review_thread'
      : parsed.data.status === 'addressed'
        ? 'address_playbook_review_thread'
        : 'reopen_playbook_review_thread',
    targetType: 'playbook_review_thread',
    targetId: threadId,
    changes: { from: parsed.data.expectedStatus, to: parsed.data.status },
  })
  if (parsed.data.status === 'addressed' && thread.created_by !== auth.user.id) {
    await createNotification(service, {
      userId: thread.created_by as string,
      type: 'playbook_change_addressed',
      title: `Requested change addressed: ${entry.title as string}`,
      link: `/admin/playbook/${parsed.data.roomKey}?review=${threadId}`,
      data: { entryId: thread.entry_id, threadId },
      actorId: auth.user.id,
    })
  }
  return NextResponse.json({ data })
}
