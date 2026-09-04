import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveIdeaAccess } from '@/lib/ideas/access'

type RouteCtx = { params: Promise<{ ideaId: string }> }
const PromoteSchema = z.object({ targetWorkId: z.string().uuid().nullable().optional() }).strict()

export async function POST(request: Request, { params }: RouteCtx) {
  const { ideaId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveIdeaAccess(supabase, ideaId, user.id)
  if (!access.granted || access.permission !== 'owner') return NextResponse.json({ error: 'Idea not found.' }, { status: 404 })
  const parsed = PromoteSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid Writer’s Room.' }, { status: 400 })
  const { data, error } = await createServiceClient().rpc('promote_idea_to_work', {
    p_idea_id: ideaId, p_actor: user.id, p_target_work_id: parsed.data.targetWorkId ?? null,
  })
  const result = Array.isArray(data) ? data[0] : data
  if (error || !result?.work_id) return NextResponse.json({ error: error?.message ?? 'Could not open the Writer’s Room.' }, { status: 409 })
  return NextResponse.json({ data: { workId: result.work_id, created: Boolean(result.created) } })
}
