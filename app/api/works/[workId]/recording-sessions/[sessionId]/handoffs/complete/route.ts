import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { BUCKET, MAX_BYTES, resolveAudioType } from '@/lib/catalogue/audio-mime'
import {
  buildProducerVocalPath,
  normalizeHandoffNote,
  normalizeHandoffRoundLabel,
  normalizeMusicalKey,
  normalizeProducerBpm,
  normalizeReferenceUrl,
  PRODUCER_HANDOFF_KEY_MAX,
  PRODUCER_HANDOFF_NOTE_MAX,
  PRODUCER_HANDOFF_REFERENCE_MAX,
  PRODUCER_HANDOFF_ROUND_LABEL_MAX,
  type ProducerFeedbackSnapshot,
} from '@/lib/catalogue/producer-handoff'
import { createNotification } from '@/lib/notifications'
import { checkRateLimit } from '@/lib/security/rate-limit'

type RouteCtx = { params: Promise<{ workId: string; sessionId: string }> }

const CompleteHandoffSchema = z.object({
  handoffId: z.string().uuid(),
  path: z.string().min(1).max(500),
  roughVersionId: z.string().uuid(),
  recipientUserId: z.string().uuid(),
  note: z.string().max(PRODUCER_HANDOFF_NOTE_MAX).nullable(),
  roundLabel: z.string().max(PRODUCER_HANDOFF_ROUND_LABEL_MAX).nullable().optional(),
  bpm: z.number().int().min(20).max(300).nullable().optional(),
  musicalKey: z.string().max(PRODUCER_HANDOFF_KEY_MAX).nullable().optional(),
  referenceUrl: z.string().max(PRODUCER_HANDOFF_REFERENCE_MAX).nullable().optional(),
  feedbackIds: z.array(z.string().uuid()).max(25).default([]),
}).strict()

export async function POST(request: Request, { params }: RouteCtx) {
  const { workId, sessionId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })
  if (await checkRateLimit(`producer-handoff-complete:${user.id}`, { maxAttempts: 20, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many producer handoffs. Please slow down.' }, { status: 429 })
  }

  const parsed = CompleteHandoffSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid producer handoff.' }, { status: 400 })
  const input = parsed.data
  let expectedPath: string
  try {
    expectedPath = buildProducerVocalPath(workId, sessionId, input.handoffId)
  } catch {
    return NextResponse.json({ error: 'Invalid producer handoff reference.' }, { status: 400 })
  }
  if (input.path !== expectedPath || input.recipientUserId === user.id) {
    return NextResponse.json({ error: 'Invalid producer handoff reference.' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: existing } = await service
    .from('work_recording_handoffs')
    .select('id, session_id, rough_version_id, recipient_user_id, vocal_path')
    .eq('id', input.handoffId)
    .eq('work_id', workId)
    .maybeSingle()
  if (existing) {
    const isSameHandoff = existing.session_id === sessionId
      && existing.rough_version_id === input.roughVersionId
      && existing.recipient_user_id === input.recipientUserId
      && existing.vocal_path === input.path
    if (!isSameHandoff) {
      return NextResponse.json({ error: 'That producer handoff reference is already in use.' }, { status: 409 })
    }
    return NextResponse.json({ data: { id: existing.id } })
  }

  const [{ data: session }, { data: version }, { data: work }, { data: recipientMember }] = await Promise.all([
    service.from('work_recording_sessions').select('id, rendered_version_id, status').eq('id', sessionId).eq('work_id', workId).eq('created_by', user.id).maybeSingle(),
    service.from('work_versions').select('id, source, archived_at').eq('id', input.roughVersionId).eq('work_id', workId).maybeSingle(),
    service.from('works').select('title, user_id').eq('id', workId).maybeSingle(),
    service.from('work_members').select('id').eq('work_id', workId).eq('user_id', input.recipientUserId).maybeSingle(),
  ])
  if (!session || session.status !== 'saved' || session.rendered_version_id !== input.roughVersionId) {
    await service.storage.from(BUCKET).remove([input.path])
    return NextResponse.json({ error: 'Save the rough take before sending its producer handoff.' }, { status: 409 })
  }
  if (!version || version.source !== 'recording' || version.archived_at) {
    await service.storage.from(BUCKET).remove([input.path])
    return NextResponse.json({ error: 'The producer handoff must use an active recorded rough take.' }, { status: 409 })
  }
  if (!work || (work.user_id !== input.recipientUserId && !recipientMember)) {
    await service.storage.from(BUCKET).remove([input.path])
    return NextResponse.json({ error: 'Choose another claimed member of this Writer’s Room.' }, { status: 400 })
  }

  const { data: stored, error: infoError } = await service.storage.from(BUCKET).info(input.path)
  const storedSize = stored?.size ?? 0
  const storedType = stored ? resolveAudioType(stored.contentType ?? '', input.path) : null
  if (infoError || !stored || storedSize <= 0 || storedSize > MAX_BYTES || storedType?.ext !== 'wav') {
    if (stored) await service.storage.from(BUCKET).remove([input.path])
    return NextResponse.json({ error: 'The uploaded dry vocal file is invalid.' }, { status: 400 })
  }

  let referenceUrl: string | null
  let bpm: number | null
  try {
    referenceUrl = normalizeReferenceUrl(input.referenceUrl ?? '')
    bpm = normalizeProducerBpm(input.bpm)
  } catch (cause) {
    await service.storage.from(BUCKET).remove([input.path])
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Invalid production brief.' }, { status: 400 })
  }
  const note = input.note === null ? null : normalizeHandoffNote(input.note)
  const roundLabel = normalizeHandoffRoundLabel(input.roundLabel ?? '')
  const musicalKey = normalizeMusicalKey(input.musicalKey ?? '')
  const feedbackIds = Array.from(new Set(input.feedbackIds))
  let feedbackSnapshot: ProducerFeedbackSnapshot[] = []
  if (feedbackIds.length > 0) {
    const { data: commentRows } = await service
      .from('work_version_comments')
      .select('id, version_id, body, timestamp_ms, author_user_id')
      .eq('work_id', workId)
      .is('parent_comment_id', null)
      .is('resolved_at', null)
      .in('id', feedbackIds)
    const comments = (commentRows ?? []) as {
      id: string; version_id: string; body: string; timestamp_ms: number; author_user_id: string | null
    }[]
    if (comments.length !== feedbackIds.length) {
      await service.storage.from(BUCKET).remove([input.path])
      return NextResponse.json({ error: 'One of the selected production notes is no longer available.' }, { status: 409 })
    }
    const authorIds = Array.from(new Set(comments.map(comment => comment.author_user_id).filter((id): id is string => Boolean(id))))
    const [{ data: versionRows }, { data: authorRows }] = await Promise.all([
      service
        .from('work_versions')
        .select('id, created_at')
        .eq('work_id', workId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
      authorIds.length ? service.from('user_profiles').select('id, artist_name, handle').in('id', authorIds) : Promise.resolve({ data: [] }),
    ])
    const displays = new Map(((versionRows ?? []) as { id: string; created_at: string }[]).map((row, index) => [row.id, `v${index + 1}`]))
    const authors = new Map(((authorRows ?? []) as { id: string; artist_name: string | null; handle: string | null }[])
      .map(row => [row.id, row.artist_name || row.handle || 'Room member']))
    const byId = new Map(comments.map(comment => [comment.id, comment]))
    feedbackSnapshot = feedbackIds.map(feedbackId => {
      const comment = byId.get(feedbackId)!
      return {
        feedbackId,
        versionId: comment.version_id,
        versionDisplay: displays.get(comment.version_id) ?? 'take',
        timestampMs: comment.timestamp_ms,
        body: comment.body,
        authorUserId: comment.author_user_id,
        authorName: comment.author_user_id ? authors.get(comment.author_user_id) ?? 'Former room member' : 'Former room member',
      }
    })
  }
  const { data, error } = await service
    .from('work_recording_handoffs')
    .insert({
      id: input.handoffId,
      work_id: workId,
      session_id: sessionId,
      rough_version_id: input.roughVersionId,
      created_by: user.id,
      recipient_user_id: input.recipientUserId,
      vocal_path: input.path,
      vocal_size: storedSize,
      note,
      round_label: roundLabel,
      bpm,
      musical_key: musicalKey,
      reference_url: referenceUrl,
      feedback_snapshot: feedbackSnapshot,
    })
    .select('id')
    .single()
  if (error || !data) {
    await service.storage.from(BUCKET).remove([input.path])
    return NextResponse.json({ error: error?.message ?? 'Could not save the producer handoff.' }, { status: 409 })
  }

  const { data: actor } = await service.from('user_profiles').select('artist_name, handle, avatar_url').eq('id', user.id).maybeSingle()
  const actorName = actor?.artist_name || actor?.handle || 'A collaborator'
  await createNotification(service, {
    userId: input.recipientUserId,
    type: 'writer_room_producer_handoff',
    title: `${actorName} sent you a producer handoff`,
    body: `${work.title}: the rough mix and aligned dry vocal are ready${roundLabel ? ` for ${roundLabel}` : ''}.`,
    link: `/vault/producer-inbox?handoff=${data.id}`,
    data: { workId, handoffId: data.id, roughVersionId: input.roughVersionId },
    actorId: user.id,
    actorName,
    actorAvatarUrl: actor?.avatar_url ?? null,
  })

  return NextResponse.json({ data }, { status: 201 })
}
