import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { resolveMentionedUserIds } from '@/lib/catalogue/comments'
import { loadCommentProfiles, loadWorkParticipantIds } from '@/lib/catalogue/comment-participants.server'
import {
  lyricSuggestionErrorStatus,
  normalizeSuggestedText,
  normalizeSuggestionNote,
  presentLyricSuggestions,
} from '@/lib/catalogue/lyric-suggestions'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { createNotification } from '@/lib/notifications'
import type { LyricBlockSuggestion, LyricCommentParticipant } from '@/types/catalogue'

type RouteContext = { params: Promise<{ workId: string; blockId: string }> }

const SuggestionSchema = z.object({
  proposedText: z.string().min(1).max(4000),
  note: z.string().max(500).nullable().optional(),
}).strict()

const SUGGESTION_COLUMNS = 'id, work_id, block_id, author_user_id, base_text, proposed_text, note, mentioned_user_ids, status, decided_by_user_id, decided_at, created_at, updated_at'

async function loadBlock(supabase: Awaited<ReturnType<typeof createApiClient>>, workId: string, blockId: string) {
  const { data, error } = await supabase
    .from('lyric_blocks')
    .select('id, text, repeat_of_block_id')
    .eq('id', blockId)
    .eq('work_id', workId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as { id: string; text: string; repeat_of_block_id: string | null } | null
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { workId, blockId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  try {
    const block = await loadBlock(supabase, workId, blockId)
    if (!block || block.repeat_of_block_id) {
      return NextResponse.json({ error: 'Section not found.' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('work_lyric_block_suggestions')
      .select(SUGGESTION_COLUMNS)
      .eq('work_id', workId)
      .eq('block_id', blockId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const suggestions = (data ?? []) as LyricBlockSuggestion[]
    const participantIds = await loadWorkParticipantIds(workId)
    const identityIds = Array.from(new Set([
      ...participantIds,
      ...suggestions.flatMap(suggestion => [
        suggestion.author_user_id,
        suggestion.decided_by_user_id,
        ...suggestion.mentioned_user_ids,
      ].filter((id): id is string => Boolean(id))),
    ]))
    const profiles = await loadCommentProfiles(identityIds)
    const participants = participantIds
      .map(id => profiles.get(id))
      .filter((participant): participant is LyricCommentParticipant => Boolean(participant))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({
      data: presentLyricSuggestions({
        suggestions,
        profiles,
        viewerUserId: user.id,
        canAdminister: access.isOwner || access.tier === 'administer',
        currentText: block.text,
      }),
      participants,
      currentText: block.text,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load lyric suggestions.' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { workId, blockId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (await checkRateLimit(`lyric-suggestion:${user.id}`, { maxAttempts: 60, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many suggestions. Please slow down.' }, { status: 429 })
  }

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const parsed = SuggestionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Suggested lyrics must be 1-4000 characters and the note at most 500.' }, { status: 400 })
  }
  const proposedText = normalizeSuggestedText(parsed.data.proposedText)
  const note = normalizeSuggestionNote(parsed.data.note)
  if (proposedText === null || note === undefined) {
    return NextResponse.json({ error: 'Suggested lyrics or note are outside the allowed length.' }, { status: 400 })
  }

  try {
    const block = await loadBlock(supabase, workId, blockId)
    if (!block || block.repeat_of_block_id) {
      return NextResponse.json({ error: 'Section not found.' }, { status: 404 })
    }

    const participantIds = await loadWorkParticipantIds(workId)
    const profiles = await loadCommentProfiles(participantIds)
    const participants = participantIds
      .map(id => profiles.get(id))
      .filter((participant): participant is LyricCommentParticipant => Boolean(participant))
    const mentionedUserIds = resolveMentionedUserIds(note ?? '', participants)

    const { data, error } = await supabase.rpc('create_work_lyric_block_suggestion', {
      p_work_id: workId,
      p_block_id: blockId,
      p_proposed_text: proposedText,
      p_note: note,
      p_mentioned_user_ids: mentionedUserIds,
    })
    if (error || !data) {
      const message = error?.message ?? 'Could not save lyric suggestion.'
      return NextResponse.json({ error: message }, { status: lyricSuggestionErrorStatus(message) })
    }

    const inserted = data as LyricBlockSuggestion
    const actor = profiles.get(user.id)
    const notificationBody = note ?? 'Shared alternate lyrics for a section.'
    const service = createServiceClient()
    await Promise.allSettled(mentionedUserIds
      .filter(recipientId => recipientId !== user.id)
      .map(recipientId => createNotification(service, {
        userId: recipientId,
        type: 'writer_room_mention',
        title: `${actor?.name ?? 'A writer'} mentioned you in a lyric suggestion`,
        body: notificationBody,
        link: `/vault/works/${workId}`,
        data: { workId, blockId, suggestionId: inserted.id },
        actorId: user.id,
        actorName: actor?.name ?? 'A writer',
        actorAvatarUrl: actor?.avatarUrl ?? null,
      })))

    return NextResponse.json({ data: inserted }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save lyric suggestion.' },
      { status: 500 }
    )
  }
}
