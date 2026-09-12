import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isRoomLead } from '@/lib/playbook/entries'
import { playbookFeatureAvailable } from '@/lib/playbook/feature-access'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'

const Schema = z
  .object({
    roomKey: z.string().min(1).max(80),
    sourceEntryId: z.string().uuid(),
    sourceRevision: z.number().int().positive(),
    dependencyKind: z.enum([
      'required',
      'reference',
      'automation',
      'training',
      'policy_overlay',
    ]),
    targetKind: z.enum([
      'entry',
      'learning_path',
      'workflow_template',
      'simulation',
      'crm_surface',
      'workspace_surface',
      'integration',
    ]),
    targetId: z.string().trim().min(1).max(180),
    targetLabel: z.string().trim().min(1).max(300),
    targetHref: z.string().startsWith('/').max(500).nullable(),
  })
  .strict()

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Invalid doctrine dependency' },
      { status: 400 }
    )
  const auth = await requireRoomAccess(parsed.data.roomKey)
  if ('error' in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  const service = createServiceClient()
  if (
    !(await playbookFeatureAvailable(service, auth.user.id, 'dependency_map'))
  )
    return NextResponse.json(
      { error: 'Doctrine dependencies are not enabled for this beta cohort' },
      { status: 403 }
    )
  const { data: room } = await service
    .from('playbook_rooms')
    .select('id')
    .eq('key', parsed.data.roomKey)
    .maybeSingle()
  if (!room)
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (
    auth.staffRole !== 'leadership' &&
    !(await isRoomLead(service, room.id, auth.user.id))
  )
    return NextResponse.json(
      { error: 'Only a room lead can register doctrine dependencies' },
      { status: 403 }
    )
  const { data: entry } = await service
    .from('playbook_entries')
    .select('revision_number')
    .eq('id', parsed.data.sourceEntryId)
    .eq('room_id', room.id)
    .eq('status', 'published')
    .maybeSingle()
  if (!entry)
    return NextResponse.json(
      { error: 'Published source doctrine not found' },
      { status: 404 }
    )
  if (Number(entry.revision_number) !== parsed.data.sourceRevision)
    return NextResponse.json(
      { error: 'Source doctrine changed. Refresh before linking it.' },
      { status: 409 }
    )
  const { data, error } = await service
    .from('playbook_doctrine_dependencies')
    .insert({
      source_entry_id: parsed.data.sourceEntryId,
      source_revision_number: parsed.data.sourceRevision,
      dependency_kind: parsed.data.dependencyKind,
      target_kind: parsed.data.targetKind,
      target_id: parsed.data.targetId,
      target_label: parsed.data.targetLabel,
      target_href: parsed.data.targetHref,
      target_room_id: room.id,
      created_by: auth.user.id,
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  return NextResponse.json({ data: { id: data.id } })
}
