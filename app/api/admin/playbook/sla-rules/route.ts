import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyAdmin } from '@/lib/admin/gate'
import { playbookFeatureAvailable } from '@/lib/playbook/feature-access'
import { createServiceClient } from '@/lib/supabase/server'

const Schema = z
  .object({
    workKind: z.enum([
      'reading',
      'learning',
      'feedback',
      'workflow',
      'exception',
      'incident',
      'simulation',
    ]),
    roomId: z.string().uuid().nullable(),
    severity: z.number().int().min(1).max(4).nullable(),
    acknowledgeMinutes: z.number().int().min(1).max(525600),
    resolveMinutes: z.number().int().min(1).max(5256000),
  })
  .strict()
  .refine((value) => value.resolveMinutes >= value.acknowledgeMinutes, {
    message: 'Resolution SLA must not be shorter than acknowledgement SLA',
  })

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid SLA rule' },
      { status: 400 }
    )
  const auth = await verifyAdmin()
  if ('error' in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  const service = createServiceClient()
  if (!(await playbookFeatureAvailable(service, auth.user.id, 'sla_inbox')))
    return NextResponse.json(
      { error: 'SLA controls are not enabled for this beta cohort' },
      { status: 403 }
    )
  if (parsed.data.roomId) {
    const { data: room } = await service
      .from('playbook_rooms')
      .select('id')
      .eq('id', parsed.data.roomId)
      .maybeSingle()
    if (!room)
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }
  const { data, error } = await service
    .from('playbook_sla_rules')
    .upsert(
      {
        work_kind: parsed.data.workKind,
        room_id: parsed.data.roomId,
        severity: parsed.data.severity,
        acknowledge_minutes: parsed.data.acknowledgeMinutes,
        resolve_minutes: parsed.data.resolveMinutes,
        created_by: auth.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'work_kind,room_id,severity' }
    )
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { id: data.id } })
}
