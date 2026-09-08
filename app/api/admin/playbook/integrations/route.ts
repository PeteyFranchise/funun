import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getStaffRoles } from '@/lib/admin/gate'
import { playbookFeatureAvailable } from '@/lib/playbook/feature-access'
import { resolveOperationalEntity } from '@/lib/playbook/operational-links'
import { OPERATIONAL_ENTITY_TYPES } from '@/lib/playbook/operational-v1'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'

const LinkSchema = z
  .object({
    roomKey: z.string().min(1).max(80),
    workflowRunId: z.string().uuid(),
    entityType: z.enum(OPERATIONAL_ENTITY_TYPES),
    entityId: z.string().trim().min(1).max(180),
  })
  .strict()

export async function POST(request: Request) {
  const parsed = LinkSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Invalid operational link' },
      { status: 400 }
    )
  const auth = await requireRoomAccess(parsed.data.roomKey)
  if ('error' in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  const service = createServiceClient()
  if (
    !(await playbookFeatureAvailable(
      service,
      auth.user.id,
      'operational_integrations'
    ))
  ) {
    return NextResponse.json(
      {
        error: 'Operational integrations are not enabled for this beta cohort',
      },
      { status: 403 }
    )
  }
  const { data: room } = await service
    .from('playbook_rooms')
    .select('id')
    .eq('key', parsed.data.roomKey)
    .maybeSingle()
  if (!room)
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  const { data: run } = await service
    .from('playbook_workflow_runs')
    .select('id,owner_id,started_by,playbook_workflow_templates!inner(room_id)')
    .eq('id', parsed.data.workflowRunId)
    .maybeSingle()
  const typedRun = run as unknown as {
    id: string
    owner_id: string | null
    started_by: string
    playbook_workflow_templates: { room_id: string }
  } | null
  if (!typedRun || typedRun.playbook_workflow_templates.room_id !== room.id)
    return NextResponse.json(
      { error: 'Workflow run not found' },
      { status: 404 }
    )
  const roles = getStaffRoles(auth.user)
  if (
    !roles.includes('leadership') &&
    typedRun.owner_id !== auth.user.id &&
    typedRun.started_by !== auth.user.id
  ) {
    return NextResponse.json(
      { error: 'Workflow run not found' },
      { status: 404 }
    )
  }
  const entity = await resolveOperationalEntity(service, {
    ...parsed.data,
    userId: auth.user.id,
    roles,
  })
  if (!entity)
    return NextResponse.json(
      { error: 'Record not found or not available to this account' },
      { status: 404 }
    )
  const { data: linkId, error } = await service.rpc(
    'link_playbook_operational_record',
    {
      p_workflow_run_id: typedRun.id,
      p_room_id: room.id,
      p_entity_type: parsed.data.entityType,
      p_entity_id: entity.id,
      p_entity_label: entity.label,
      p_entity_href: entity.href,
      p_actor_id: auth.user.id,
    }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    data: {
      linkId,
      entityId: entity.id,
      label: entity.label,
      href: entity.href,
    },
  })
}
