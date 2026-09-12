import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isRoomLead } from '@/lib/playbook/entries'
import { playbookFeatureAvailable } from '@/lib/playbook/feature-access'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
const Schema = z
  .object({
    roomKey: z.string().min(1).max(80),
    score: z.number().int().min(0).max(100),
    needsRemediation: z.boolean(),
    note: z.string().trim().min(1).max(8000),
  })
  .strict()
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const id = z
    .string()
    .uuid()
    .safeParse((await context.params).id)
  const parsed = Schema.safeParse(await request.json().catch(() => ({})))
  if (!id.success || !parsed.success)
    return NextResponse.json(
      { error: 'Invalid simulation review' },
      { status: 400 }
    )
  const auth = await requireRoomAccess(parsed.data.roomKey)
  if ('error' in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  const service = createServiceClient()
  if (!(await playbookFeatureAvailable(service, auth.user.id, 'simulations'))) {
    return NextResponse.json(
      { error: 'Simulations are not enabled for this beta cohort' },
      { status: 403 }
    )
  }
  const room = await service
    .from('playbook_rooms')
    .select('id')
    .eq('key', parsed.data.roomKey)
    .maybeSingle()
  if (!room.data)
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (
    auth.staffRole !== 'leadership' &&
    !(await isRoomLead(service, room.data.id, auth.user.id))
  )
    return NextResponse.json(
      { error: 'Only a room lead can assess a simulation' },
      { status: 403 }
    )
  const attempt = await service
    .from('playbook_simulation_attempts')
    .select(
      'id,user_id,scenario_id,status,playbook_simulation_scenarios!inner(room_id,source_revision_number,passing_score,certificate_valid_days)'
    )
    .eq('id', id.data)
    .maybeSingle()
  if (!attempt.data || attempt.data.status !== 'submitted')
    return NextResponse.json(
      { error: 'Pending attempt not found' },
      { status: 404 }
    )
  const nested = attempt.data as unknown as {
    user_id: string
    scenario_id: string
    playbook_simulation_scenarios: {
      room_id: string
      source_revision_number: number
      passing_score: number
      certificate_valid_days: number | null
    }
  }
  if (nested.playbook_simulation_scenarios.room_id !== room.data.id)
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  const { data, error } = await service.rpc('review_playbook_simulation_attempt', {
    p_attempt_id: id.data,
    p_actor_id: auth.user.id,
    p_score: parsed.data.score,
    p_needs_remediation: parsed.data.needsRemediation,
    p_note: parsed.data.note,
  })
  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  return NextResponse.json({ data })
}
