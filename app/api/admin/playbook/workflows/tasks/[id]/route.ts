import { NextResponse } from 'next/server'
import { z } from 'zod'
import { workflowRunState } from '@/lib/playbook/enablement'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'

const Schema = z.object({ roomKey: z.string().min(1).max(80), status: z.enum(['pending','completed','skipped','blocked']) }).strict()
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await context.params).id); const parsed = Schema.safeParse(await request.json().catch(() => ({}))); if (!id.success || !parsed.success) return NextResponse.json({ error: 'Invalid workflow task' }, { status: 400 })
  const auth = await requireRoomAccess(parsed.data.roomKey); if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status }); const service = createServiceClient()
  const task = await service.from('playbook_workflow_run_tasks').select('id, run_id, playbook_workflow_runs!inner(owner_id, playbook_workflow_templates!inner(playbook_rooms!inner(key)))').eq('id', id.data).maybeSingle(); if (!task.data) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  const nested = task.data as unknown as { run_id: string; playbook_workflow_runs: { owner_id: string | null; playbook_workflow_templates: { playbook_rooms: { key: string } } } }
  if (nested.playbook_workflow_runs.playbook_workflow_templates.playbook_rooms.key !== parsed.data.roomKey) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (auth.staffRole !== 'leadership' && nested.playbook_workflow_runs.owner_id !== auth.user.id) return NextResponse.json({ error: 'Only the run owner can update this task' }, { status: 403 })
  const completed = parsed.data.status === 'completed'; const update = await service.from('playbook_workflow_run_tasks').update({ status: parsed.data.status, completed_by: completed ? auth.user.id : null, completed_at: completed ? new Date().toISOString() : null }).eq('id', id.data); if (update.error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  const all = await service.from('playbook_workflow_run_tasks').select('required, status').eq('run_id', nested.run_id); const state = workflowRunState((all.data ?? []) as { required: boolean; status: 'pending' | 'completed' | 'skipped' | 'blocked' }[]); await service.from('playbook_workflow_runs').update({ status: state === 'complete' ? 'completed' : 'active', completed_at: state === 'complete' ? new Date().toISOString() : null }).eq('id', nested.run_id)
  return NextResponse.json({ data: { state } })
}
