import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isRoomLead } from '@/lib/playbook/entries'
import { isPlaybookEnablementSchemaMissing } from '@/lib/playbook/enablement'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'

const CreateTemplate = z.object({ action: z.literal('create_template'), roomKey: z.string().min(1).max(80), entryId: z.string().uuid(), title: z.string().trim().min(1).max(180), steps: z.array(z.object({ label: z.string().trim().min(1).max(500), required: z.boolean() }).strict()).min(1).max(100) }).strict()
const StartRun = z.object({ action: z.literal('start_run'), roomKey: z.string().min(1).max(80), templateId: z.string().uuid(), contextType: z.string().trim().min(1).max(80), contextId: z.string().trim().min(1).max(180), contextLabel: z.string().trim().min(1).max(300) }).strict()
const Schema = z.discriminatedUnion('action', [CreateTemplate, StartRun])

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: 'Invalid workflow request' }, { status: 400 })
  const auth = await requireRoomAccess(parsed.data.roomKey); if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status }); const service = createServiceClient()
  const room = await service.from('playbook_rooms').select('id').eq('key', parsed.data.roomKey).maybeSingle(); if (!room.data) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (parsed.data.action === 'create_template') {
    if (auth.staffRole !== 'leadership' && !(await isRoomLead(service, room.data.id, auth.user.id))) return NextResponse.json({ error: 'Only a room lead can turn doctrine into a workflow' }, { status: 403 })
    const entry = await service.from('playbook_entries').select('id, revision_number').eq('id', parsed.data.entryId).eq('room_id', room.data.id).eq('status', 'published').maybeSingle(); if (!entry.data) return NextResponse.json({ error: 'Published source doctrine not found' }, { status: 404 })
    const template = await service.from('playbook_workflow_templates').insert({ room_id: room.data.id, entry_id: entry.data.id, revision_number: entry.data.revision_number, title: parsed.data.title, status: 'active', created_by: auth.user.id }).select('id').single()
    if (template.error) { if (isPlaybookEnablementSchemaMissing(template.error)) return NextResponse.json({ error: 'Workflow automation is built but not activated yet.' }, { status: 503 }); return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 }) }
    const steps = await service.from('playbook_workflow_template_steps').insert(parsed.data.steps.map((step, index) => ({ template_id: template.data.id, sort_order: index, ...step })))
    if (steps.error) { await service.from('playbook_workflow_templates').delete().eq('id', template.data.id); return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 }) }
    return NextResponse.json({ data: { id: template.data.id } })
  }
  const template = await service.from('playbook_workflow_templates').select('id, room_id').eq('id', parsed.data.templateId).eq('room_id', room.data.id).eq('status', 'active').maybeSingle(); if (!template.data) return NextResponse.json({ error: 'Workflow template not found' }, { status: 404 })
  const run = await service.from('playbook_workflow_runs').insert({ template_id: template.data.id, context_type: parsed.data.contextType, context_id: parsed.data.contextId, context_label: parsed.data.contextLabel, started_by: auth.user.id, owner_id: auth.user.id }).select('id').single(); if (run.error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  const steps = await service.from('playbook_workflow_template_steps').select('id, label, required').eq('template_id', template.data.id).order('sort_order'); const tasks = await service.from('playbook_workflow_run_tasks').insert((steps.data ?? []).map(step => ({ run_id: run.data.id, template_step_id: step.id, label: step.label, required: step.required }))); if (tasks.error) { await service.from('playbook_workflow_runs').delete().eq('id', run.data.id); return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 }) }
  return NextResponse.json({ data: { id: run.data.id } })
}
