import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ALL_STAFF_ROLES, getStaffRoles, requireStaff } from '@/lib/admin/gate'
import {
  parseSimulationScenario,
  targetRoleApplies,
} from '@/lib/playbook/operational-v1'
import type { StaffRole } from '@/lib/admin/staff-role'
import { canAccessRoom } from '@/lib/playbook/rooms'
import { playbookFeatureAvailable } from '@/lib/playbook/feature-access'
import { createServiceClient } from '@/lib/supabase/server'
const Schema = z
  .object({
    responses: z
      .array(
        z
          .object({
            promptId: z.string().max(80),
            response: z.string().trim().min(1).max(8000),
          })
          .strict()
      )
      .min(1)
      .max(30),
    selfReflection: z.string().trim().max(8000).nullable(),
  })
  .strict()
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaff(ALL_STAFF_ROLES)
  if ('error' in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  const id = z
    .string()
    .uuid()
    .safeParse((await context.params).id)
  const parsed = Schema.safeParse(await request.json().catch(() => ({})))
  if (!id.success || !parsed.success)
    return NextResponse.json(
      { error: 'Invalid simulation response' },
      { status: 400 }
    )
  const service = createServiceClient()
  if (!(await playbookFeatureAvailable(service, auth.user.id, 'simulations'))) {
    return NextResponse.json(
      { error: 'Simulations are not enabled for this beta cohort' },
      { status: 403 }
    )
  }
  const assignment = await service
    .from('playbook_simulation_assignments')
    .select(
      'id,scenario_id,target_kind,target_user_id,target_role,revoked_at,playbook_simulation_scenarios!inner(room_id,status,scenario)'
    )
    .eq('id', id.data)
    .maybeSingle()
  if (!assignment.data || assignment.data.revoked_at)
    return NextResponse.json(
      { error: 'Simulation assignment not found' },
      { status: 404 }
    )
  const nested = assignment.data as unknown as {
    scenario_id: string
    target_kind: 'user' | 'role'
    target_user_id: string | null
    target_role: StaffRole | null
    playbook_simulation_scenarios: {
      room_id: string
      status: string
      scenario: unknown
    }
  }
  const roles = getStaffRoles(auth.user)
  if (
    !targetRoleApplies(
      {
        targetKind: nested.target_kind,
        targetUserId: nested.target_user_id,
        targetRole: nested.target_role,
      },
      auth.user.id,
      roles
    )
  )
    return NextResponse.json(
      { error: 'This simulation is not assigned to you' },
      { status: 403 }
    )
  const grants = await service
    .from('playbook_room_role_grants')
    .select('role')
    .eq('room_id', nested.playbook_simulation_scenarios.room_id)
  if (
    !canAccessRoom(
      roles,
      (grants.data ?? []).map((x) => x.role)
    )
  )
    return NextResponse.json(
      { error: 'You no longer have access to this simulation' },
      { status: 403 }
    )
  const prompts = parseSimulationScenario(
    nested.playbook_simulation_scenarios.scenario
  )
  if (
    !prompts ||
    parsed.data.responses.length !== prompts.length ||
    !prompts.every((prompt) =>
      parsed.data.responses.some((response) => response.promptId === prompt.id)
    )
  )
    return NextResponse.json(
      { error: 'Answer every current scenario prompt before submitting' },
      { status: 400 }
    )
  const existing = await service
    .from('playbook_simulation_attempts')
    .select('id')
    .eq('assignment_id', id.data)
    .eq('user_id', auth.user.id)
    .eq('status', 'submitted')
    .maybeSingle()
  if (existing.data)
    return NextResponse.json(
      { error: 'This attempt is already awaiting human review' },
      { status: 409 }
    )
  const write = await service
    .from('playbook_simulation_attempts')
    .insert({
      assignment_id: id.data,
      scenario_id: nested.scenario_id,
      user_id: auth.user.id,
      responses: parsed.data.responses,
      self_reflection: parsed.data.selfReflection,
    })
    .select('id')
    .single()
  if (write.error)
    return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  await service.from('playbook_simulation_events').insert({
    scenario_id: nested.scenario_id,
    assignment_id: id.data,
    attempt_id: write.data.id,
    event_type: 'submitted',
    actor_id: auth.user.id,
  })
  return NextResponse.json({
    data: { id: write.data.id, status: 'submitted' },
  })
}
