import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveIdeaAccess } from '@/lib/ideas/access'

type RouteCtx = { params: Promise<{ ideaId: string }> }
const CollectionSchema = z.object({ name: z.string().trim().min(1).max(100) }).strict()

export async function POST(request: Request, { params }: RouteCtx) {
  const { ideaId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveIdeaAccess(supabase, ideaId, user.id)
  if (!access.granted || access.permission !== 'owner') return NextResponse.json({ error: 'Idea not found.' }, { status: 404 })
  const parsed = CollectionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Name this collection.' }, { status: 400 })
  const service = createServiceClient()
  const { data: collection, error } = await service.rpc('add_idea_to_collection_transactional', {
    p_idea_id: ideaId, p_actor: user.id, p_name: parsed.data.name,
  })
  if (error || !collection) return NextResponse.json({ error: error?.message ?? 'Could not create the collection.' }, { status: 409 })
  return NextResponse.json({ data: collection }, { status: 201 })
}

export async function DELETE(request: Request, { params }: RouteCtx) {
  const { ideaId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveIdeaAccess(supabase, ideaId, user.id)
  if (!access.granted || access.permission !== 'owner') return NextResponse.json({ error: 'Idea not found.' }, { status: 404 })
  const parsed = CollectionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid collection.' }, { status: 400 })
  const service = createServiceClient()
  const { error } = await service.rpc('remove_idea_from_collection_transactional', {
    p_idea_id: ideaId, p_actor: user.id, p_name: parsed.data.name,
  })
  if (error) return NextResponse.json({ error: 'Could not remove this collection.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
