import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createNotification } from '@/lib/notifications'
import { type StaffRole } from '@/lib/admin/staff-role'
import { isRoomLead } from '@/lib/playbook/entries'
import { canAccessRoom, requireRoomAccess } from '@/lib/playbook/rooms'
import {
  REVIEW_SCHEMA_UNAVAILABLE,
  ReviewCreateSchema,
  isReviewSchemaMissing,
  isValidReviewAnchor,
  reviewAnchors,
  type PlaybookReviewMessage,
  type PlaybookReviewRound,
  type PlaybookReviewThread,
} from '@/lib/playbook/reviews'
import { createServiceClient } from '@/lib/supabase/server'
import { logStaffAction } from '@/lib/staff/audit'

const idSchema = z.string().uuid()

type EntryRow = {
  id: string
  room_id: string
  entry_type: 'sop' | 'topic' | 'document'
  title: string
  slug: string | null
  content: Record<string, unknown>
  draft_content: Record<string, unknown> | null
  author_id: string | null
  draft_author_id: string | null
  revision_number: number
  draft_version: number
}

async function loadEntryContext(service: ReturnType<typeof createServiceClient>, id: string, roomKey: string) {
  const { data: room, error: roomError } = await service
    .from('playbook_rooms').select('id, key').eq('key', roomKey).maybeSingle()
  if (roomError) return { error: roomError.message, status: 500 as const }
  if (!room) return { error: 'Room not found', status: 404 as const }
  const { data: entry, error: entryError } = await service
    .from('playbook_entries')
    .select('id, room_id, entry_type, title, slug, content, draft_content, author_id, draft_author_id, revision_number, draft_version')
    .eq('id', id).eq('room_id', room.id).maybeSingle()
  if (entryError) return { error: entryError.message, status: 500 as const }
  if (!entry) return { error: 'Entry not found in this room', status: 404 as const }
  return { room: room as { id: string; key: string }, entry: entry as EntryRow }
}

async function validMentionIds(
  service: ReturnType<typeof createServiceClient>,
  roomId: string,
  requested: readonly string[]
): Promise<{ ids?: string[]; error?: string }> {
  const unique = Array.from(new Set(requested))
  if (unique.length === 0) return { ids: [] }
  const [{ data: staff, error: staffError }, { data: grants, error: grantsError }] = await Promise.all([
    service.from('funun_staff').select('user_id, staff_role, staff_roles').in('user_id', unique),
    service.from('playbook_room_role_grants').select('role').eq('room_id', roomId),
  ])
  if (staffError || grantsError) return { error: staffError?.message ?? grantsError?.message }
  const granted = (grants ?? []).map(row => row.role as StaffRole)
  const allowed = (staff ?? []).filter(row => {
    const roles = Array.isArray(row.staff_roles) && row.staff_roles.length > 0
      ? row.staff_roles as StaffRole[]
      : [row.staff_role as StaffRole]
    return canAccessRoom(roles, granted)
  }).map(row => row.user_id as string)
  return allowed.length === unique.length
    ? { ids: allowed }
    : { error: 'Every mentioned Team Member must have access to this Playbook room' }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const roomKey = new URL(request.url).searchParams.get('roomKey')?.trim() ?? ''
  if (!idSchema.safeParse(id).success || !roomKey) return NextResponse.json({ error: 'Invalid review request' }, { status: 400 })
  const auth = await requireRoomAccess(roomKey)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const service = createServiceClient()
  const context = await loadEntryContext(service, id, roomKey)
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status })

  const { data: threadData, error: threadError } = await service
    .from('playbook_review_threads').select('*').eq('entry_id', id).order('created_at', { ascending: false })
  if (isReviewSchemaMissing(threadError)) {
    return NextResponse.json({ available: false, error: REVIEW_SCHEMA_UNAVAILABLE }, { status: 503 })
  }
  if (threadError) return NextResponse.json({ error: threadError.message }, { status: 500 })
  const threads = (threadData ?? []) as PlaybookReviewThread[]
  const { data: roundData, error: roundError } = await service
    .from('playbook_review_rounds').select('*').eq('entry_id', id).order('created_at', { ascending: false })
  if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })
  const rounds = (roundData ?? []) as PlaybookReviewRound[]
  const roundIds = rounds.map(round => round.id)
  const { data: summaryEvents, error: summaryError } = roundIds.length
    ? await service
        .from('playbook_review_round_events')
        .select('round_id, details, created_at')
        .in('round_id', roundIds)
        .eq('event_type', 'decision_summary')
        .order('created_at', { ascending: false })
    : { data: [], error: null }
  if (summaryError) return NextResponse.json({ error: summaryError.message }, { status: 500 })
  const summaryByRound = new Map<string, string>()
  for (const event of summaryEvents ?? []) {
    const details = event.details as { summary?: unknown } | null
    if (!summaryByRound.has(event.round_id as string) && typeof details?.summary === 'string') {
      summaryByRound.set(event.round_id as string, details.summary)
    }
  }
  const hydratedRounds = rounds.map(round => ({ ...round, decision_summary: summaryByRound.get(round.id) ?? null }))
  const roundById = new Map(hydratedRounds.map(round => [round.id, round]))
  const threadIds = threads.map(thread => thread.id)
  const { data: messageData, error: messageError } = threadIds.length
    ? await service.from('playbook_review_messages').select('*').in('thread_id', threadIds).order('created_at')
    : { data: [], error: null }
  if (messageError) return NextResponse.json({ error: messageError.message }, { status: 500 })
  const messages = (messageData ?? []) as PlaybookReviewMessage[]
  const messageIds = messages.map(message => message.id)
  const { data: mentionData, error: mentionError } = messageIds.length
    ? await service.from('playbook_review_mentions').select('message_id, user_id').in('message_id', messageIds)
    : { data: [], error: null }
  if (mentionError) return NextResponse.json({ error: mentionError.message }, { status: 500 })

  const mentionsByMessage = new Map<string, string[]>()
  for (const mention of mentionData ?? []) {
    mentionsByMessage.set(mention.message_id as string, [...(mentionsByMessage.get(mention.message_id as string) ?? []), mention.user_id as string])
  }
  const messagesByThread = new Map<string, PlaybookReviewMessage[]>()
  for (const message of messages) {
    messagesByThread.set(message.thread_id, [...(messagesByThread.get(message.thread_id) ?? []), { ...message, mentions: mentionsByMessage.get(message.id) ?? [] }])
  }
  const userIds = Array.from(new Set([
    ...threads.flatMap(thread => [thread.created_by, thread.resolved_by].filter(Boolean) as string[]),
    ...messages.map(message => message.created_by),
    ...(mentionData ?? []).map(mention => mention.user_id as string),
  ]))
  const { data: staffData } = userIds.length
    ? await service.from('funun_staff').select('user_id, display_name').in('user_id', userIds)
    : { data: [] }
  const people = Object.fromEntries((staffData ?? []).map(row => [row.user_id as string, (row.display_name as string | null)?.trim() || 'Team Member']))
  const isApprover = auth.staffRole === 'leadership' || await isRoomLead(service, context.room.id, auth.user.id)

  return NextResponse.json({
    available: true,
    viewer: {
      id: auth.user.id,
      isApprover,
      isAuthor: [context.entry.author_id, context.entry.draft_author_id].includes(auth.user.id),
    },
    people,
    rounds: hydratedRounds,
    data: threads.map(thread => {
      const round = roundById.get(thread.review_round_id)
      return {
        ...thread,
        round_status: round?.status ?? 'awaiting_review',
        content_snapshot: round?.content_snapshot ?? {},
        messages: messagesByThread.get(thread.id) ?? [],
      }
    }),
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })
  const parsed = ReviewCreateSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid Playbook review note' }, { status: 400 })
  const auth = await requireRoomAccess(parsed.data.roomKey)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const service = createServiceClient()
  const context = await loadEntryContext(service, id, parsed.data.roomKey)
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status })
  const isApprover = auth.staffRole === 'leadership' || await isRoomLead(service, context.room.id, auth.user.id)
  if (!isApprover) return NextResponse.json({ error: 'Only leadership or a room lead can begin a review thread' }, { status: 403 })

  const content = parsed.data.targetKind === 'draft' ? context.entry.draft_content : context.entry.content
  if (!content) return NextResponse.json({ error: 'That draft is no longer available' }, { status: 409 })
  const anchor = { kind: parsed.data.anchorKind, index: parsed.data.anchorIndex, label: parsed.data.anchorLabel }
  if (!isValidReviewAnchor(anchor, reviewAnchors(context.entry.entry_type, content))) {
    return NextResponse.json({ error: 'That review anchor is no longer present; refresh and choose it again' }, { status: 409 })
  }
  if (parsed.data.targetKind === 'draft' && parsed.data.expectedDraftVersion === null) {
    return NextResponse.json({ error: 'A draft version is required' }, { status: 400 })
  }
  if (parsed.data.targetKind === 'published' && parsed.data.expectedDraftVersion !== null) {
    return NextResponse.json({ error: 'A published review cannot target a draft version' }, { status: 400 })
  }
  const mentionResult = await validMentionIds(service, context.room.id, parsed.data.mentionedUserIds)
  if (mentionResult.error) return NextResponse.json({ error: mentionResult.error }, { status: 400 })

  const { data: threadId, error } = await service.rpc('create_playbook_review_thread', {
    p_entry_id: id,
    p_room_id: context.room.id,
    p_actor_id: auth.user.id,
    p_target_kind: parsed.data.targetKind,
    p_target_revision_number: parsed.data.expectedRevision,
    p_target_draft_version: parsed.data.expectedDraftVersion,
    p_anchor_kind: parsed.data.anchorKind,
    p_anchor_index: parsed.data.anchorIndex,
    p_anchor_label: parsed.data.anchorLabel,
    p_feedback_kind: parsed.data.feedbackKind,
    p_body: parsed.data.body,
    p_mentioned_user_ids: mentionResult.ids ?? [],
  })
  if (isReviewSchemaMissing(error)) return NextResponse.json({ error: REVIEW_SCHEMA_UNAVAILABLE }, { status: 503 })
  if (error) {
    const status = /changed|no longer/i.test(error.message) ? 409 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  const recipients = new Set(mentionResult.ids ?? [])
  if (parsed.data.feedbackKind === 'requested_change' && context.entry.draft_author_id) recipients.add(context.entry.draft_author_id)
  recipients.delete(auth.user.id)
  await Promise.all(Array.from(recipients).map(userId => createNotification(service, {
    userId,
    type: parsed.data.feedbackKind === 'requested_change' ? 'playbook_change_requested' : 'playbook_review_mention',
    title: parsed.data.feedbackKind === 'requested_change' ? `Changes requested: ${context.entry.title}` : `You were tagged in a Playbook review`,
    body: parsed.data.body.slice(0, 280),
    link: `/admin/playbook/${parsed.data.roomKey}?review=${threadId}`,
    data: { entryId: id, threadId, targetRevision: parsed.data.expectedRevision, targetDraftVersion: parsed.data.expectedDraftVersion },
    actorId: auth.user.id,
  })))
  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'create_playbook_review_thread',
    targetType: 'playbook_review_thread',
    targetId: threadId as string,
    changes: { entryId: id, feedbackKind: parsed.data.feedbackKind, targetKind: parsed.data.targetKind },
  })
  return NextResponse.json({ data: { id: threadId } })
}
