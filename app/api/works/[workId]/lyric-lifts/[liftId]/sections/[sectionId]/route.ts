import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { LYRIC_LIFT_BLOCK_TYPES } from '@/lib/catalogue/lyric-lift'
import { loadLyricLiftView } from '@/lib/catalogue/lyric-lift-service'

type RouteContext = { params: Promise<{ workId: string; liftId: string; sectionId: string }> }

const PatchSchema = z.object({
  text: z.string().max(20000).optional(),
  blockType: z.enum(LYRIC_LIFT_BLOCK_TYPES).optional(),
  customLabel: z.string().trim().min(1).max(80).nullable().optional(),
  included: z.boolean().optional(),
}).strict().refine(input => Object.keys(input).length > 0)

export async function PATCH(request: Request, { params }: RouteContext) {
  const { workId, liftId, sectionId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid lyric section update.' }, { status: 400 })

  const service = createServiceClient()
  const { data: lift } = await service
    .from('work_lyric_lifts')
    .select('id, status')
    .eq('id', liftId)
    .eq('work_id', workId)
    .maybeSingle()
  if (!lift) return NextResponse.json({ error: 'Lyric Lift not found.' }, { status: 404 })
  if (lift.status !== 'review') return NextResponse.json({ error: 'This lyric draft is not editable.' }, { status: 409 })

  const { data: current } = await service
    .from('work_lyric_lift_sections')
    .select('id, block_type, repeat_of_section_id')
    .eq('id', sectionId)
    .eq('lift_id', liftId)
    .maybeSingle()
  if (!current) return NextResponse.json({ error: 'Lyric section not found.' }, { status: 404 })

  const nextType = parsed.data.blockType ?? current.block_type
  const update: Record<string, unknown> = { updated_by: user.id }
  if (parsed.data.text !== undefined) {
    update.text = parsed.data.text
    update.needs_review = false
    if (current.repeat_of_section_id) update.repeat_of_section_id = null
  }
  if (parsed.data.included !== undefined) update.included = parsed.data.included
  if (parsed.data.blockType !== undefined) {
    update.block_type = nextType
    update.repeat_of_section_id = null
  }
  if (nextType === 'custom') {
    if (parsed.data.customLabel !== undefined) update.custom_label = parsed.data.customLabel
    else if (current.block_type !== 'custom') update.custom_label = 'Section'
  } else {
    if (parsed.data.customLabel !== undefined && parsed.data.customLabel !== null) {
      return NextResponse.json({ error: 'Only a custom section can have a custom label.' }, { status: 400 })
    }
    update.custom_label = null
  }
  if (parsed.data.customLabel !== undefined && nextType === 'custom') update.custom_label = parsed.data.customLabel

  const { error } = await service
    .from('work_lyric_lift_sections')
    .update(update)
    .eq('id', sectionId)
    .eq('lift_id', liftId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const view = await loadLyricLiftView(service, { workId, liftId })
  return NextResponse.json({ data: view })
}
