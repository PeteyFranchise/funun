import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ALL_STAFF_ROLES } from '@/lib/admin/staff-role'
import { isRoomLead } from '@/lib/playbook/entries'
import { playbookFeatureAvailable } from '@/lib/playbook/feature-access'
import { parseSimulationScenario } from '@/lib/playbook/operational-v1'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
const Schema = z
  .object({
    roomKey: z.string().min(1).max(80),
    sourceEntryId: z.string().uuid(),
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(4000),
    prompts: z.array(z.string().trim().min(1).max(2000)).min(1).max(30),
    passingScore: z.number().int().min(1).max(100),
    certificateValidDays: z.number().int().min(1).max(3650).nullable(),
    targetRole: z.enum(ALL_STAFF_ROLES as [string, ...string[]]),
    dueAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => ({})))
  if (
    !parsed.success ||
    !parseSimulationScenario({
      prompts: parsed.success ? parsed.data.prompts : [],
    })
  )
    return NextResponse.json(
      { error: 'Invalid simulation scenario' },
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
      { error: 'Only a room lead can publish simulations' },
      { status: 403 }
    )
  const grants = await service
    .from('playbook_room_role_grants')
    .select('role')
    .eq('room_id', room.data.id)
  if (
    parsed.data.targetRole !== 'leadership' &&
    !(grants.data ?? []).some((x) => x.role === parsed.data.targetRole)
  )
    return NextResponse.json(
      { error: 'That role cannot access this room' },
      { status: 400 }
    )
  const entry = await service
    .from('playbook_entries')
    .select('revision_number')
    .eq('id', parsed.data.sourceEntryId)
    .eq('room_id', room.data.id)
    .eq('status', 'published')
    .maybeSingle()
  if (!entry.data)
    return NextResponse.json(
      { error: 'Published source doctrine not found' },
      { status: 404 }
    )
  const scenario = await service
    .from('playbook_simulation_scenarios')
    .insert({
      room_id: room.data.id,
      source_entry_id: parsed.data.sourceEntryId,
      source_revision_number: entry.data.revision_number,
      title: parsed.data.title,
      description: parsed.data.description,
      scenario: { prompts: parsed.data.prompts },
      passing_score: parsed.data.passingScore,
      certificate_valid_days: parsed.data.certificateValidDays,
      status: 'published',
      created_by: auth.user.id,
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (scenario.error)
    return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  const assignment = await service
    .from('playbook_simulation_assignments')
    .insert({
      scenario_id: scenario.data.id,
      target_kind: 'role',
      target_role: parsed.data.targetRole,
      assigned_by: auth.user.id,
      due_at: parsed.data.dueAt,
    })
    .select('id')
    .single()
  if (assignment.error) {
    await service
      .from('playbook_simulation_scenarios')
      .delete()
      .eq('id', scenario.data.id)
    return NextResponse.json(
      { error: 'Request could not be completed.' },
      { status: 500 }
    )
  }
  await service.from('playbook_simulation_events').insert({
    scenario_id: scenario.data.id,
    assignment_id: assignment.data.id,
    event_type: 'published',
    actor_id: auth.user.id,
  })
  return NextResponse.json({ data: { id: scenario.data.id } })
}
