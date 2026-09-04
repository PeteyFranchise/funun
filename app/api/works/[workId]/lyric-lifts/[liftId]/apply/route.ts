import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { loadLyricLiftView } from '@/lib/catalogue/lyric-lift-service'

type RouteContext = { params: Promise<{ workId: string; liftId: string }> }

const ApplySchema = z.object({ mode: z.enum(['empty_only', 'append']) }).strict()

export async function POST(request: Request, { params }: RouteContext) {
  const { workId, liftId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })
  const parsed = ApplySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Choose how to add the reviewed lyrics.' }, { status: 400 })

  const service = createServiceClient()
  const view = await loadLyricLiftView(service, { workId, liftId })
  if (!view) return NextResponse.json({ error: 'Lyric Lift not found.' }, { status: 404 })
  const { data, error } = await service.rpc('apply_work_lyric_lift', {
    p_lift_id: liftId,
    p_actor_id: user.id,
    p_mode: parsed.data.mode,
  })
  if (error) {
    const status = error.code === '40001' || error.code === '55000'
      ? 409
      : error.code === '23514' || error.code === '22023'
        ? 400
        : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  const applied = await loadLyricLiftView(service, { workId, liftId })
  return NextResponse.json({ data: applied, importedCount: Number(data ?? 0) })
}
