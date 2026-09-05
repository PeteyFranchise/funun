import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { resolveMentionedUserIds } from '@/lib/catalogue/comments'
import {
  loadCommentProfiles,
  loadWorkParticipantIds,
} from '@/lib/catalogue/comment-participants.server'
import { deriveBlockNumerals } from '@/lib/catalogue/blocks'
import { presentStudioNotes } from '@/lib/catalogue/studio-notes'
import { deriveVersionNumerals } from '@/lib/catalogue/versions'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { createNotification } from '@/lib/notifications'
import type {
  LyricBlock,
  LyricBlockComment,
  LyricCommentParticipant,
  WorkStudioNote,
  WorkNoteReaction,
  WorkVersion,
  WorkVersionComment,
} from '@/types/catalogue'

type RouteContext = { params: Promise<{ workId: string }> }

const STUDIO_NOTE_COLUMNS = 'id, work_id, parent_note_id, author_user_id, body, mentioned_user_ids, resolved_at, resolved_by_user_id, created_at'
const VERSION_COMMENT_COLUMNS = 'id, work_id, version_id, parent_comment_id, author_user_id, body, timestamp_ms, mentioned_user_ids, resolved_at, resolved_by_user_id, carried_from_version_id, carried_from_comment_id, created_at'
const LYRIC_COMMENT_COLUMNS = 'id, work_id, block_id, parent_comment_id, author_user_id, body, mentioned_user_ids, resolved_at, resolved_by_user_id, created_at'

const CreateStudioNoteSchema = z
  .object({
    source: z.enum(['song', 'audio', 'lyrics']),
    body: z.string().trim().min(1).max(2000),
    recipientUserIds: z.array(z.string().uuid()).max(25).default([]),
    parentId: z.string().uuid().nullable().optional(),
    versionId: z.string().uuid().nullable().optional(),
    timestampMs: z.number().int().min(0).max(86400000).nullable().optional(),
    blockId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.source === 'audio' && (!value.versionId || value.timestampMs == null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Audio notes require a version and time.' })
    }
    if (value.source === 'lyrics' && !value.blockId) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Lyric notes require a section.' })
    }
  })

async function loadStudioNoteData(
  supabase: Awaited<ReturnType<typeof createApiClient>>,
  workId: string
) {
  const [songRes, audioRes, lyricRes, versionsRes, blocksRes, reactionsRes] = await Promise.all([
    supabase.from('work_studio_notes').select(STUDIO_NOTE_COLUMNS).eq('work_id', workId).order('created_at').limit(500),
    supabase.from('work_version_comments').select(VERSION_COMMENT_COLUMNS).eq('work_id', workId).order('created_at').limit(500),
    supabase.from('work_lyric_block_comments').select(LYRIC_COMMENT_COLUMNS).eq('work_id', workId).order('created_at').limit(500),
    supabase.from('work_versions').select('id, source, label, created_at, audio_path, audio_ext, duration_seconds').eq('work_id', workId),
    supabase.from('lyric_blocks').select('id, block_type, custom_label, position, text, author_kind, author_user_id, repeat_of_block_id').eq('work_id', workId),
    supabase.from('work_note_reactions').select('id, work_id, source, note_id, user_id, reaction, created_at').eq('work_id', workId).order('created_at').limit(2000),
  ])
  const error = songRes.error ?? audioRes.error ?? lyricRes.error ?? versionsRes.error ?? blocksRes.error ?? reactionsRes.error
  if (error) throw new Error(error.message)
  return {
    songNotes: (songRes.data ?? []) as WorkStudioNote[],
    audioNotes: (audioRes.data ?? []) as WorkVersionComment[],
    lyricNotes: (lyricRes.data ?? []) as LyricBlockComment[],
    versions: (versionsRes.data ?? []) as WorkVersion[],
    blocks: (blocksRes.data ?? []) as LyricBlock[],
    reactions: (reactionsRes.data ?? []) as WorkNoteReaction[],
  }
}

function identityIds(input: Awaited<ReturnType<typeof loadStudioNoteData>>, participantIds: string[]) {
  return Array.from(new Set([
    ...participantIds,
    ...input.songNotes.flatMap(note => [note.author_user_id, note.resolved_by_user_id, ...note.mentioned_user_ids]),
    ...input.audioNotes.flatMap(note => [note.author_user_id, note.resolved_by_user_id, ...note.mentioned_user_ids]),
    ...input.lyricNotes.flatMap(note => [note.author_user_id, note.resolved_by_user_id, ...note.mentioned_user_ids]),
    ...input.reactions.map(reaction => reaction.user_id),
  ].filter((id): id is string => Boolean(id))))
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { workId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  try {
    const data = await loadStudioNoteData(supabase, workId)
    const participantIds = await loadWorkParticipantIds(workId)
    const profiles = await loadCommentProfiles(identityIds(data, participantIds))
    const versionLabels = new Map(deriveVersionNumerals(data.versions).map(version => [version.id, version.display]))
    const blockLabels = new Map(deriveBlockNumerals(data.blocks).map(block => [block.id, block.label]))
    const participants = participantIds
      .map(id => profiles.get(id))
      .filter((participant): participant is LyricCommentParticipant => Boolean(participant))
      .sort((left, right) => left.name.localeCompare(right.name))

    return NextResponse.json({
      data: presentStudioNotes({
        ...data,
        profiles,
        versionLabels,
        blockLabels,
        viewerUserId: user.id,
        viewerIsOwner: access.isOwner,
        viewerCanAdminister: access.tier === 'administer',
      }),
      participants,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load Studio Notes' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { workId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (await checkRateLimit(`studio-note:${user.id}`, { maxAttempts: 120, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many notes. Please slow down.' }, { status: 429 })
  }
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const parsed = CreateStudioNoteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid Studio Note.' }, { status: 400 })
  }

  try {
    const participantIds = await loadWorkParticipantIds(workId)
    const profiles = await loadCommentProfiles(participantIds)
    const participants = participantIds
      .map(id => profiles.get(id))
      .filter((participant): participant is LyricCommentParticipant => Boolean(participant))
    const participantSet = new Set(participantIds)
    if (parsed.data.recipientUserIds.some(id => !participantSet.has(id))) {
      return NextResponse.json({ error: 'Studio Notes can only notify current Writer’s Room members.' }, { status: 400 })
    }
    const mentionedUserIds = Array.from(new Set([
      ...parsed.data.recipientUserIds,
      ...resolveMentionedUserIds(parsed.data.body, participants),
    ]))
    if (mentionedUserIds.length > 25) {
      return NextResponse.json({ error: 'A Studio Note can notify up to 25 people.' }, { status: 400 })
    }

    let inserted: unknown
    let error: { message: string } | null = null
    if (parsed.data.source === 'song') {
      const result = await supabase.rpc('create_work_studio_note', {
        p_work_id: workId,
        p_body: parsed.data.body,
        p_parent_note_id: parsed.data.parentId ?? null,
        p_mentioned_user_ids: mentionedUserIds,
      })
      inserted = result.data
      error = result.error
    } else if (parsed.data.source === 'audio') {
      const result = await supabase.rpc('create_work_version_comment', {
        p_work_id: workId,
        p_version_id: parsed.data.versionId!,
        p_body: parsed.data.body,
        p_timestamp_ms: parsed.data.timestampMs!,
        p_parent_comment_id: parsed.data.parentId ?? null,
        p_mentioned_user_ids: mentionedUserIds,
      })
      inserted = result.data
      error = result.error
    } else {
      const result = await supabase.rpc('create_work_lyric_block_comment', {
        p_work_id: workId,
        p_block_id: parsed.data.blockId!,
        p_body: parsed.data.body,
        p_parent_comment_id: parsed.data.parentId ?? null,
        p_mentioned_user_ids: mentionedUserIds,
      })
      inserted = result.data
      error = result.error
    }

    if (error || !inserted) {
      const message = error?.message ?? 'Could not save Studio Note'
      const status = message.includes('resolved') ? 409 : message.includes('not_found') ? 404 : 500
      return NextResponse.json({ error: message }, { status })
    }

    const actor = profiles.get(user.id)
    const excerpt = parsed.data.body.length > 180 ? `${parsed.data.body.slice(0, 177)}…` : parsed.data.body
    const insertedId = (inserted as { id?: string }).id ?? ''
    const notificationLink = parsed.data.source === 'audio'
      ? `/vault/works/${workId}?version=${parsed.data.versionId}&comment=${insertedId}&t=${parsed.data.timestampMs}`
      : `/vault/works/${workId}?studioNote=${insertedId}`
    const service = createServiceClient()
    await Promise.allSettled(mentionedUserIds
      .filter(recipientId => recipientId !== user.id)
      .map(recipientId => createNotification(service, {
        userId: recipientId,
        type: 'writer_room_studio_note',
        title: `${actor?.name ?? 'A writer'} left you a Studio Note`,
        body: excerpt,
        link: notificationLink,
        data: { workId, source: parsed.data.source, noteId: insertedId || null },
        actorId: user.id,
        actorName: actor?.name ?? 'A writer',
        actorAvatarUrl: actor?.avatarUrl ?? null,
      })))

    return NextResponse.json({ data: inserted }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save Studio Note' },
      { status: 500 }
    )
  }
}
