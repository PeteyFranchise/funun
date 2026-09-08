import { NextResponse } from 'next/server'
import { z } from 'zod'
import { type StaffRole } from '@/lib/admin/staff-role'
import { createNotification } from '@/lib/notifications'
import { isRoomLead } from '@/lib/playbook/entries'
import { canAccessRoom, requireRoomAccess } from '@/lib/playbook/rooms'
import { canReplyToReview, isReviewSchemaMissing, REVIEW_SCHEMA_UNAVAILABLE, ReviewReplySchema } from '@/lib/playbook/reviews'
import { createServiceClient } from '@/lib/supabase/server'
import { logStaffAction } from '@/lib/staff/audit'

const idSchema = z.string().uuid()

export async function POST(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params
  if (!idSchema.safeParse(threadId).success) return NextResponse.json({ error: 'Invalid review thread id' }, { status: 400 })
  const parsed = ReviewReplySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid review reply' }, { status: 400 })
  const auth = await requireRoomAccess(parsed.data.roomKey)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const service = createServiceClient()
  const { data: room } = await service.from('playbook_rooms').select('id').eq('key', parsed.data.roomKey).maybeSingle()
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  const { data: thread, error: threadError } = await service
    .from('playbook_review_threads').select('id, entry_id, room_id, created_by').eq('id', threadId).eq('room_id', room.id).maybeSingle()
  if (isReviewSchemaMissing(threadError)) return NextResponse.json({ error: REVIEW_SCHEMA_UNAVAILABLE }, { status: 503 })
  if (threadError) return NextResponse.json({ error: threadError.message }, { status: 500 })
  if (!thread) return NextResponse.json({ error: 'Review thread not found in this room' }, { status: 404 })
  const { data: entry, error: entryError } = await service
    .from('playbook_entries').select('author_id, draft_author_id, title').eq('id', thread.entry_id).maybeSingle()
  if (entryError || !entry) return NextResponse.json({ error: entryError?.message ?? 'Entry not found' }, { status: entryError ? 500 : 404 })
  const { data: messageRows } = await service.from('playbook_review_messages').select('id').eq('thread_id', threadId)
  const messageIds = (messageRows ?? []).map(row => row.id as string)
  const { data: priorMentions } = messageIds.length
    ? await service.from('playbook_review_mentions').select('user_id').in('message_id', messageIds)
    : { data: [] }
  const isApprover = auth.staffRole === 'leadership' || await isRoomLead(service, room.id as string, auth.user.id)
  if (!canReplyToReview({
    viewerId: auth.user.id,
    isApprover,
    entryAuthorId: entry.author_id as string | null,
    draftAuthorId: entry.draft_author_id as string | null,
    threadCreatorId: thread.created_by as string,
    mentionedUserIds: (priorMentions ?? []).map(row => row.user_id as string),
  })) return NextResponse.json({ error: 'Only review participants can reply' }, { status: 403 })

  const requestedIds = Array.from(new Set(parsed.data.mentionedUserIds)).filter(id => id !== auth.user.id)
  let validIds: string[] = []
  if (requestedIds.length) {
    const [{ data: staff }, { data: grants }] = await Promise.all([
      service.from('funun_staff').select('user_id, staff_role, staff_roles').in('user_id', requestedIds),
      service.from('playbook_room_role_grants').select('role').eq('room_id', room.id),
    ])
    const granted = (grants ?? []).map(row => row.role as StaffRole)
    validIds = (staff ?? []).filter(row => {
      const roles = Array.isArray(row.staff_roles) && row.staff_roles.length ? row.staff_roles as StaffRole[] : [row.staff_role as StaffRole]
      return canAccessRoom(roles, granted)
    }).map(row => row.user_id as string)
    if (validIds.length !== requestedIds.length) {
      return NextResponse.json({ error: 'Every mentioned Team Member must have access to this Playbook room' }, { status: 400 })
    }
  }
  const { data: messageId, error } = await service.rpc('reply_to_playbook_review_thread', {
    p_thread_id: threadId,
    p_actor_id: auth.user.id,
    p_body: parsed.data.body,
    p_mentioned_user_ids: validIds,
  })
  if (isReviewSchemaMissing(error)) return NextResponse.json({ error: REVIEW_SCHEMA_UNAVAILABLE }, { status: 503 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await Promise.all(validIds.map(userId => createNotification(service, {
    userId,
    type: 'playbook_review_mention',
    title: `You were tagged in a Playbook review`,
    body: parsed.data.body.slice(0, 280),
    link: `/admin/playbook/${parsed.data.roomKey}?review=${threadId}`,
    data: { entryId: thread.entry_id, threadId, messageId },
    actorId: auth.user.id,
  })))
  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'reply_playbook_review_thread',
    targetType: 'playbook_review_thread',
    targetId: threadId,
    changes: { messageId, mentionedUserIds: validIds },
  })
  return NextResponse.json({ data: { id: messageId } })
}
