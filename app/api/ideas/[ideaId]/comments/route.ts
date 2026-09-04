import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveIdeaAccess } from '@/lib/ideas/access'
import { ideaPermissionAllows } from '@/lib/ideas/schema'
import { createNotification } from '@/lib/notifications'

type RouteCtx = { params: Promise<{ ideaId: string }> }
const CommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  recordingId: z.string().uuid().nullable().optional(),
  timestampMs: z.number().int().min(0).nullable().optional(),
}).strict()

export async function POST(request: Request, { params }: RouteCtx) {
  const { ideaId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveIdeaAccess(supabase, ideaId, user.id)
  if (!access.granted || !ideaPermissionAllows(access.permission, 'comment')) {
    return NextResponse.json({ error: 'Idea not found.' }, { status: 404 })
  }
  const parsed = CommentSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Write a comment under 2,000 characters.' }, { status: 400 })
  const service = createServiceClient()
  if (parsed.data.recordingId) {
    const { data: recording } = await service.from('idea_recordings').select('id')
      .eq('id', parsed.data.recordingId).eq('idea_id', ideaId).maybeSingle()
    if (!recording) return NextResponse.json({ error: 'Recording not found.' }, { status: 404 })
  }
  const { data, error } = await service.from('idea_comments').insert({
    idea_id: ideaId, author_user_id: user.id, body: parsed.data.body,
    recording_id: parsed.data.recordingId ?? null, timestamp_ms: parsed.data.timestampMs ?? null,
  }).select('id').single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not save the comment.' }, { status: 409 })
  if (access.permission !== 'owner') {
    const [{ data: actor }, { data: idea }] = await Promise.all([
      service.from('user_profiles').select('artist_name, handle, avatar_url').eq('id', user.id).maybeSingle(),
      service.from('ideas').select('title').eq('id', ideaId).single(),
    ])
    const actorName = actor?.artist_name || actor?.handle || 'A collaborator'
    await createNotification(service, {
      userId: access.ownerId, type: 'idea_comment', title: `${actorName} commented on an idea`,
      body: idea?.title ?? 'Your idea', link: `/ideas?idea=${ideaId}`,
      data: { ideaId, commentId: data.id }, actorId: user.id, actorName,
      actorAvatarUrl: actor?.avatar_url ?? null,
    })
  }
  return NextResponse.json({ data }, { status: 201 })
}
