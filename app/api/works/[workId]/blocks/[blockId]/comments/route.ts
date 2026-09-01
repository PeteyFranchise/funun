import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { lyricCommentSectionLabel, resolveMentionedUserIds } from '@/lib/catalogue/comments'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { createNotification } from '@/lib/notifications'
import type {
  LyricBlockComment,
  LyricBlockCommentView,
  LyricBlockType,
  LyricCommentParticipant,
} from '@/types/catalogue'

type RouteContext = { params: Promise<{ workId: string; blockId: string }> }
type ProfileRow = {
  id: string
  artist_name: string | null
  handle: string | null
  avatar_url: string | null
}

const CommentBodySchema = z
  .object({
    body: z.string().trim().min(1).max(2000),
    parentCommentId: z.string().uuid().nullable().optional(),
  })
  .strict()

function participantFromProfile(profile: ProfileRow): LyricCommentParticipant {
  return {
    userId: profile.id,
    name: profile.artist_name?.trim() || (profile.handle ? `@${profile.handle}` : 'A writer'),
    handle: profile.handle,
    avatarUrl: profile.avatar_url,
  }
}

async function loadParticipantIds(workId: string): Promise<string[]> {
  const service = createServiceClient()
  const [{ data: work, error: workError }, { data: members, error: membersError }] = await Promise.all([
    service.from('works').select('user_id').eq('id', workId).maybeSingle(),
    service.from('work_members').select('user_id').eq('work_id', workId).not('user_id', 'is', null),
  ])
  if (workError || membersError || !work) {
    throw new Error(workError?.message ?? membersError?.message ?? 'Work not found')
  }
  return Array.from(new Set([work.user_id, ...(members ?? []).map(member => member.user_id as string)]))
}

async function loadProfiles(userIds: string[]): Promise<Map<string, LyricCommentParticipant>> {
  if (userIds.length === 0) return new Map()
  const service = createServiceClient()
  const { data, error } = await service
    .from('user_profiles')
    .select('id, artist_name, handle, avatar_url')
    .in('id', userIds)
  if (error) throw new Error(error.message)
  return new Map(
    ((data ?? []) as ProfileRow[]).map(profile => {
      const participant = participantFromProfile(profile)
      return [participant.userId, participant] as const
    })
  )
}

async function loadBlock(workId: string, blockId: string) {
  const service = createServiceClient()
  const { data, error } = await service
    .from('lyric_blocks')
    .select('id, block_type, custom_label')
    .eq('id', blockId)
    .eq('work_id', workId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as { id: string; block_type: LyricBlockType; custom_label: string | null } | null
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { workId, blockId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  try {
    const block = await loadBlock(workId, blockId)
    if (!block) return NextResponse.json({ error: 'Block not found.' }, { status: 404 })

    const { data, error } = await supabase
      .from('work_lyric_block_comments')
      .select('id, work_id, block_id, parent_comment_id, author_user_id, body, mentioned_user_ids, resolved_at, resolved_by_user_id, created_at')
      .eq('work_id', workId)
      .eq('block_id', blockId)
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const comments = (data ?? []) as LyricBlockComment[]
    const participantIds = await loadParticipantIds(workId)
    const identityIds = Array.from(
      new Set([
        ...participantIds,
        ...comments.flatMap(comment => [
          comment.author_user_id,
          comment.resolved_by_user_id,
          ...comment.mentioned_user_ids,
        ]).filter((id): id is string => Boolean(id)),
      ])
    )
    const profiles = await loadProfiles(identityIds)
    const participants = participantIds
      .map(id => profiles.get(id))
      .filter((participant): participant is LyricCommentParticipant => Boolean(participant))
      .sort((a, b) => a.name.localeCompare(b.name))

    const presented: LyricBlockCommentView[] = comments.map(comment => ({
      id: comment.id,
      blockId: comment.block_id,
      parentCommentId: comment.parent_comment_id,
      body: comment.body,
      author: comment.author_user_id
        ? (profiles.get(comment.author_user_id) ?? {
            userId: comment.author_user_id,
            name: 'A writer',
            handle: null,
            avatarUrl: null,
          })
        : null,
      mentioned: comment.mentioned_user_ids
        .map(id => profiles.get(id))
        .filter((participant): participant is LyricCommentParticipant => Boolean(participant)),
      resolvedAt: comment.resolved_at,
      resolvedByName: comment.resolved_by_user_id
        ? (profiles.get(comment.resolved_by_user_id)?.name ?? 'A writer')
        : null,
      createdAt: comment.created_at,
      canResolve:
        comment.parent_comment_id === null &&
        (access.isOwner || access.tier === 'administer' || comment.author_user_id === user.id),
    }))

    return NextResponse.json({ data: presented, participants })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load comments' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { workId, blockId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (await checkRateLimit(`work-comment:${user.id}`, { maxAttempts: 120, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many comments. Please slow down.' }, { status: 429 })
  }

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const parsed = CommentBodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'A comment must be 1-2000 characters.' }, { status: 400 })
  }

  try {
    const block = await loadBlock(workId, blockId)
    if (!block) return NextResponse.json({ error: 'Block not found.' }, { status: 404 })

    const participantIds = await loadParticipantIds(workId)
    const profiles = await loadProfiles(participantIds)
    const participants = participantIds
      .map(id => profiles.get(id))
      .filter((participant): participant is LyricCommentParticipant => Boolean(participant))
    const mentionedUserIds = resolveMentionedUserIds(parsed.data.body, participants)

    const { data, error } = await supabase.rpc('create_work_lyric_block_comment', {
      p_work_id: workId,
      p_block_id: blockId,
      p_body: parsed.data.body,
      p_parent_comment_id: parsed.data.parentCommentId ?? null,
      p_mentioned_user_ids: mentionedUserIds,
    })
    if (error || !data) {
      const message = error?.message ?? 'Could not save comment'
      const status = message.includes('comment_thread_resolved') ? 409 : 500
      return NextResponse.json({ error: message }, { status })
    }

    const inserted = data as LyricBlockComment
    const actor = profiles.get(user.id)
    const sectionLabel = lyricCommentSectionLabel(block.block_type, block.custom_label)
    const notificationBody = parsed.data.body.length > 180
      ? `${parsed.data.body.slice(0, 177)}…`
      : parsed.data.body
    const service = createServiceClient()
    await Promise.allSettled(
      mentionedUserIds
        .filter(recipientId => recipientId !== user.id)
        .map(recipientId =>
          createNotification(service, {
            userId: recipientId,
            type: 'writer_room_mention',
            title: `${actor?.name ?? 'A writer'} mentioned you in ${sectionLabel}`,
            body: notificationBody,
            link: `/vault/works/${workId}`,
            data: { workId, blockId, commentId: inserted.id },
            actorId: user.id,
            actorName: actor?.name ?? 'A writer',
            actorAvatarUrl: actor?.avatarUrl ?? null,
          })
        )
    )

    return NextResponse.json({ data: inserted }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save comment' },
      { status: 500 }
    )
  }
}
