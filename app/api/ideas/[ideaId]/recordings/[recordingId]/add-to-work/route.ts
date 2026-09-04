import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveIdeaAccess } from '@/lib/ideas/access'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'

type RouteCtx = { params: Promise<{ ideaId: string; recordingId: string }> }
const InputSchema = z.object({ workId: z.string().uuid() }).strict()

export async function POST(request: Request, { params }: RouteCtx) {
  const { ideaId, recordingId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('user_profiles').select('id').eq('id', user.id).maybeSingle()
  if (!profile) return NextResponse.json({ error: 'Global Capture is available to User Accounts only.' }, { status: 403 })

  const parsed = InputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid Writer’s Room.' }, { status: 400 })

  const [ideaAccess, workAccess] = await Promise.all([
    resolveIdeaAccess(supabase, ideaId, user.id),
    resolveWorkAccess(createWorkAccessDeps(supabase), parsed.data.workId, user.id, 'contribute'),
  ])
  if (!ideaAccess.granted || ideaAccess.permission !== 'owner') {
    return NextResponse.json({ error: 'Idea recording not found.' }, { status: 404 })
  }
  if (!workAccess.granted) {
    return NextResponse.json({ error: workAccess.reason }, { status: workAccess.status })
  }

  const { data, error } = await service.rpc('add_idea_recording_to_work', {
    p_idea_id: ideaId, p_recording_id: recordingId,
    p_work_id: parsed.data.workId, p_actor: user.id,
  })
  const result = Array.isArray(data) ? data[0] : data
  if (error || !result?.version_id) {
    return NextResponse.json({ error: 'Could not add this recording to the Writer’s Room.' }, { status: 409 })
  }
  return NextResponse.json({ data: { versionId: result.version_id, created: Boolean(result.created) } })
}
