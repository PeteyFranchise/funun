import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { resolveMentionedUserIds } from '@/lib/catalogue/comments'
import {
  loadCommentProfiles,
  loadWorkParticipantIds,
} from '@/lib/catalogue/comment-participants.server'
import {
  formatTrackTimestamp,
  presentVersionComments,
  previousVersionId,
  versionDisplayMap,
  type VersionOrderRow,
} from '@/lib/catalogue/version-comments'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { createNotification } from '@/lib/notifications'
import type {
  LyricCommentParticipant,
  WorkVersionComment,
  WorkVersionCommentCarryOffer,
} from '@/types/catalogue'

type RouteContext = { params: Promise<{ workId: string; versionId: string }> }

const COMMENT_COLUMNS = 'id, work_id, version_id, parent_comment_id, author_user_id, body, timestamp_ms, mentioned_user_ids, resolved_at, resolved_by_user_id, carried_from_version_id, carried_from_comment_id, created_at'

const CommentBodySchema = z.object({
  body: z.string().trim().min(1).max(2000),
  timestampMs: z.number().int().min(0).max(86400000),
  parentCommentId: z.string().uuid().nullable().optional(),
}).strict()

async function loadVersions(supabase: Awaited<ReturnType<typeof createApiClient>>, workId: string) {
  const { data, error } = await supabase
    .from('work_versions')
    .select('id, created_at')
    .eq('work_id', workId)
  if (error) throw new Error(error.message)
  return (data ?? []) as VersionOrderRow[]
}

function identityIds(comments: WorkVersionComment[], participantIds: string[]): string[] {
  return Array.from(new Set([
    ...participantIds,
    ...comments.flatMap(comment => [
      comment.author_user_id,
      comment.resolved_by_user_id,
      ...comment.mentioned_user_ids,
    ]).filter((id): id is string => Boolean(id)),
  ]))
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { workId, versionId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  try {
    const versions = await loadVersions(supabase, workId)
    if (!versions.some(version => version.id === versionId)) {
      return NextResponse.json({ error: 'Recording version not found.' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('work_version_comments')
      .select(COMMENT_COLUMNS)
      .eq('work_id', workId)
      .eq('version_id', versionId)
      .order('timestamp_ms', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(300)
    if (error) throw new Error(error.message)

    const comments = (data ?? []) as WorkVersionComment[]
    const participantIds = await loadWorkParticipantIds(workId)
    const profiles = await loadCommentProfiles(identityIds(comments, participantIds))
    const displays = versionDisplayMap(versions)
    const participants = participantIds
      .map(id => profiles.get(id))
      .filter((participant): participant is LyricCommentParticipant => Boolean(participant))
      .sort((a, b) => a.name.localeCompare(b.name))
    const presented = presentVersionComments({
      comments,
      profiles,
      versionDisplays: displays,
      viewerUserId: user.id,
      viewerIsOwner: access.isOwner,
      viewerCanAdminister: access.tier === 'administer',
    })

    let carryOffer: WorkVersionCommentCarryOffer | null = null
    const sourceVersionId = previousVersionId(versions, versionId)
    if (sourceVersionId) {
      const { data: review, error: reviewError } = await supabase
        .from('work_version_comment_carry_reviews')
        .select('target_version_id')
        .eq('target_version_id', versionId)
        .maybeSingle()
      if (reviewError) throw new Error(reviewError.message)
      if (!review) {
        const { data: sourceRows, error: sourceError } = await supabase
          .from('work_version_comments')
          .select(COMMENT_COLUMNS)
          .eq('work_id', workId)
          .eq('version_id', sourceVersionId)
          .is('parent_comment_id', null)
          .is('resolved_at', null)
          .order('timestamp_ms', { ascending: true })
          .limit(100)
        if (sourceError) throw new Error(sourceError.message)
        const sourceComments = (sourceRows ?? []) as WorkVersionComment[]
        if (sourceComments.length > 0) {
          const sourceProfiles = await loadCommentProfiles(identityIds(sourceComments, participantIds))
          carryOffer = {
            sourceVersionId,
            sourceVersionDisplay: displays.get(sourceVersionId) ?? 'the previous version',
            comments: presentVersionComments({
              comments: sourceComments,
              profiles: sourceProfiles,
              versionDisplays: displays,
              viewerUserId: user.id,
              viewerIsOwner: access.isOwner,
              viewerCanAdminister: access.tier === 'administer',
            }),
          }
        }
      }
    }

    return NextResponse.json({ data: presented, participants, carryOffer })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load timed comments' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { workId, versionId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (await checkRateLimit(`work-version-comment:${user.id}`, { maxAttempts: 120, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many comments. Please slow down.' }, { status: 429 })
  }
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const parsed = CommentBodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'A timed comment needs a valid track position and 1-2000 characters.' }, { status: 400 })
  }

  try {
    const versions = await loadVersions(supabase, workId)
    if (!versions.some(version => version.id === versionId)) {
      return NextResponse.json({ error: 'Recording version not found.' }, { status: 404 })
    }
    const participantIds = await loadWorkParticipantIds(workId)
    const profiles = await loadCommentProfiles(participantIds)
    const participants = participantIds
      .map(id => profiles.get(id))
      .filter((participant): participant is LyricCommentParticipant => Boolean(participant))
    const mentionedUserIds = resolveMentionedUserIds(parsed.data.body, participants)

    const { data, error } = await supabase.rpc('create_work_version_comment', {
      p_work_id: workId,
      p_version_id: versionId,
      p_body: parsed.data.body,
      p_timestamp_ms: parsed.data.timestampMs,
      p_parent_comment_id: parsed.data.parentCommentId ?? null,
      p_mentioned_user_ids: mentionedUserIds,
    })
    if (error || !data) {
      const message = error?.message ?? 'Could not save timed comment'
      const status = message.includes('comment_thread_resolved') ? 409 : message.includes('timestamp') ? 400 : 500
      return NextResponse.json({ error: message }, { status })
    }

    const inserted = data as WorkVersionComment
    const actor = profiles.get(user.id)
    const versionDisplay = versionDisplayMap(versions).get(versionId) ?? 'this version'
    const notificationBody = parsed.data.body.length > 180
      ? `${parsed.data.body.slice(0, 177)}…`
      : parsed.data.body
    const service = createServiceClient()
    await Promise.allSettled(
      mentionedUserIds
        .filter(recipientId => recipientId !== user.id)
        .map(recipientId => createNotification(service, {
          userId: recipientId,
          type: 'writer_room_track_mention',
          title: `${actor?.name ?? 'A writer'} mentioned you at ${formatTrackTimestamp(inserted.timestamp_ms)} in ${versionDisplay}`,
          body: notificationBody,
          link: `/vault/works/${workId}?version=${versionId}&comment=${inserted.id}&t=${inserted.timestamp_ms}`,
          data: { workId, versionId, commentId: inserted.id, timestampMs: inserted.timestamp_ms },
          actorId: user.id,
          actorName: actor?.name ?? 'A writer',
          actorAvatarUrl: actor?.avatarUrl ?? null,
        }))
    )

    return NextResponse.json({ data: inserted }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save timed comment' },
      { status: 500 }
    )
  }
}
