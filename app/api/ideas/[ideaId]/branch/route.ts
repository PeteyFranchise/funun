import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveIdeaAccess } from '@/lib/ideas/access'

type RouteCtx = { params: Promise<{ ideaId: string }> }
const BranchSchema = z.object({ requestId: z.string().uuid() }).strict()

export async function POST(request: Request, { params }: RouteCtx) {
  const { ideaId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveIdeaAccess(supabase, ideaId, user.id)
  if (!access.granted || access.permission !== 'owner') return NextResponse.json({ error: 'Idea not found.' }, { status: 404 })
  const parsed = BranchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid branch request.' }, { status: 400 })
  const service = createServiceClient()
  const { data, error } = await service.rpc('branch_idea_transactional', {
    p_idea_id: ideaId,
    p_actor: user.id,
    p_request_id: parsed.data.requestId,
  })
  const result = data as { id?: string; created?: boolean } | null
  if (error || !result?.id) return NextResponse.json({ error: 'Could not branch this idea.' }, { status: 409 })
  return NextResponse.json({ data: { id: result.id } }, { status: result.created ? 201 : 200 })
}
