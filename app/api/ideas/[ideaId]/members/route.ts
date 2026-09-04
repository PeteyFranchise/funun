import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveIdeaAccess } from '@/lib/ideas/access'
import { createNotification } from '@/lib/notifications'

type RouteCtx = { params: Promise<{ ideaId: string }> }
const MemberSchema = z.object({
  userId: z.string().uuid(),
  permission: z.enum(['listen', 'comment', 'contribute']),
}).strict()

export async function POST(request: Request, { params }: RouteCtx) {
  const { ideaId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveIdeaAccess(supabase, ideaId, user.id)
  if (!access.granted || access.permission !== 'owner') return NextResponse.json({ error: 'Idea not found.' }, { status: 404 })
  const parsed = MemberSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || parsed.data.userId === user.id) return NextResponse.json({ error: 'Choose a collaborator.' }, { status: 400 })
  const service = createServiceClient()
  const [{ data: profile }, { data: idea }] = await Promise.all([
    service.from('user_profiles').select('id, artist_name, handle').eq('id', parsed.data.userId).maybeSingle(),
    service.from('ideas').select('title').eq('id', ideaId).single(),
  ])
  if (!profile) return NextResponse.json({ error: 'That collaborator has not claimed a Funūn account yet.' }, { status: 409 })
  const { data, error } = await service.from('idea_members').upsert({
    idea_id: ideaId, user_id: parsed.data.userId, permission: parsed.data.permission, added_by: user.id,
  }, { onConflict: 'idea_id,user_id' }).select('id').single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not share the idea.' }, { status: 409 })
  await createNotification(service, {
    userId: parsed.data.userId, type: 'idea_invite', title: 'An idea was shared with you',
    body: idea?.title ?? 'Private idea', link: `/ideas?idea=${ideaId}`,
    data: { ideaId, permission: parsed.data.permission }, actorId: user.id,
  })
  return NextResponse.json({ data }, { status: 201 })
}

export async function DELETE(request: Request, { params }: RouteCtx) {
  const { ideaId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveIdeaAccess(supabase, ideaId, user.id)
  if (!access.granted || access.permission !== 'owner') return NextResponse.json({ error: 'Idea not found.' }, { status: 404 })
  const parsed = z.object({ userId: z.string().uuid() }).strict().safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Choose a collaborator.' }, { status: 400 })
  const { error } = await createServiceClient().from('idea_members').delete()
    .eq('idea_id', ideaId).eq('user_id', parsed.data.userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  return NextResponse.json({ ok: true })
}
