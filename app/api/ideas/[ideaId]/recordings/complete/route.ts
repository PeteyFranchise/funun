import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { BUCKET, MAX_BYTES, resolveAudioType } from '@/lib/catalogue/audio-mime'
import { resolveIdeaAccess } from '@/lib/ideas/access'
import { buildIdeaRecordingPath, ideaPermissionAllows } from '@/lib/ideas/schema'
import { createNotification } from '@/lib/notifications'

type RouteCtx = { params: Promise<{ ideaId: string }> }
const CompleteSchema = z.object({
  recordingId: z.string().uuid(), path: z.string().min(1).max(500),
  durationSeconds: z.number().int().min(0).nullable(), label: z.string().max(200).nullable(),
  kind: z.enum(['voice', 'melody', 'lyric', 'rhythm', 'harmony', 'reference', 'import']),
  parentRecordingId: z.string().uuid().nullable(),
  markers: z.array(z.object({ timestampMs: z.number().int().min(0), label: z.string().max(100).nullable().optional() }).strict()).max(100),
}).strict()

export async function POST(request: Request, { params }: RouteCtx) {
  const { ideaId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveIdeaAccess(supabase, ideaId, user.id)
  if (!access.granted || !ideaPermissionAllows(access.permission, 'contribute')) return NextResponse.json({ error: 'Idea not found.' }, { status: 404 })
  const parsed = CompleteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid recording completion.' }, { status: 400 })
  const input = parsed.data
  const pathType = resolveAudioType('', input.path)
  if (!pathType || input.path !== buildIdeaRecordingPath(ideaId, input.recordingId, pathType.ext)) {
    return NextResponse.json({ error: 'Invalid recording reference.' }, { status: 400 })
  }
  const service = createServiceClient()
  const { data: stored, error: infoError } = await service.storage.from(BUCKET).info(input.path)
  const storedType = stored ? resolveAudioType(stored.contentType ?? '', input.path) : null
  const size = stored?.size ?? 0
  if (infoError || !stored || !storedType || storedType.ext !== pathType.ext || size <= 0 || size > MAX_BYTES) {
    if (stored) await service.storage.from(BUCKET).remove([input.path])
    return NextResponse.json({ error: 'The stored recording is invalid.' }, { status: 400 })
  }
  const { data, error } = await service.rpc('complete_idea_recording_transactional', {
    p_idea_id: ideaId,
    p_recording_id: input.recordingId,
    p_actor: user.id,
    p_parent_recording_id: input.parentRecordingId,
    p_audio_path: input.path,
    p_audio_ext: pathType.ext,
    p_audio_size: size,
    p_duration_seconds: input.durationSeconds,
    p_label: input.label?.trim() || null,
    p_kind: input.kind,
    p_markers: input.markers,
  })
  const result = data as { id?: string; created?: boolean } | null
  if (error || !result?.id) {
    await service.storage.from(BUCKET).remove([input.path])
    return NextResponse.json({ error: error?.message ?? 'Could not save the idea recording.' }, { status: 409 })
  }
  if (result.created && access.permission !== 'owner') {
    const [{ data: actor }, { data: idea }] = await Promise.all([
      service.from('user_profiles').select('artist_name, handle, avatar_url').eq('id', user.id).maybeSingle(),
      service.from('ideas').select('title').eq('id', ideaId).single(),
    ])
    const actorName = actor?.artist_name || actor?.handle || 'A collaborator'
    await createNotification(service, {
      userId: access.ownerId, type: 'idea_contribution', title: `${actorName} added to your idea`,
      body: `${idea?.title ?? 'Your idea'} has a new recording.`, link: `/ideas?idea=${ideaId}`,
      data: { ideaId, recordingId: result.id }, actorId: user.id, actorName, actorAvatarUrl: actor?.avatar_url ?? null,
    })
  }
  return NextResponse.json({ data: { id: result.id } }, { status: result.created ? 201 : 200 })
}
