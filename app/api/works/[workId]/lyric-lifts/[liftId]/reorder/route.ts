import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { loadLyricLiftView } from '@/lib/catalogue/lyric-lift-service'

type RouteContext = { params: Promise<{ workId: string; liftId: string }> }

const ReorderSchema = z.object({
  order: z.array(z.object({
    id: z.string().uuid(),
    position: z.number().int().min(0).max(199),
  }).strict()).min(1).max(200),
}).strict()

export async function POST(request: Request, { params }: RouteContext) {
  const { workId, liftId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const parsed = ReorderSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid lyric section order.' }, { status: 400 })

  const service = createServiceClient()
  const { data: lift } = await service
    .from('work_lyric_lifts')
    .select('id')
    .eq('id', liftId)
    .eq('work_id', workId)
    .maybeSingle()
  if (!lift) return NextResponse.json({ error: 'Lyric Lift not found.' }, { status: 404 })
  const { error } = await service.rpc('reorder_work_lyric_lift_sections', {
    p_lift_id: liftId,
    p_actor_id: user.id,
    p_order: parsed.data.order,
  })
  if (error) return NextResponse.json(
    { error: error.message },
    { status: error.code === '22023' ? 400 : error.code === '55000' ? 409 : 500 }
  )
  const view = await loadLyricLiftView(service, { workId, liftId })
  return NextResponse.json({ data: view })
}
