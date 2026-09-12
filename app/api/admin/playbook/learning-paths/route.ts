import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ALL_STAFF_ROLES, type StaffRole } from '@/lib/admin/staff-role'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { isRoomLead } from '@/lib/playbook/entries'
import { isPlaybookEnablementSchemaMissing } from '@/lib/playbook/enablement'
import { createServiceClient } from '@/lib/supabase/server'

const Schema = z.object({ roomKey: z.string().trim().min(1).max(80), title: z.string().trim().min(1).max(180), description: z.string().trim().min(1).max(2000), entryIds: z.array(z.string().uuid()).min(1).max(50), targetRole: z.enum(ALL_STAFF_ROLES as [string, ...string[]]), dueAt: z.string().datetime({ offset: true }).nullable() }).strict()

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: 'Invalid learning path' }, { status: 400 })
  const auth = await requireRoomAccess(parsed.data.roomKey); if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status }); const service = createServiceClient()
  const room = await service.from('playbook_rooms').select('id').eq('key', parsed.data.roomKey).maybeSingle(); if (!room.data) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (auth.staffRole !== 'leadership' && !(await isRoomLead(service, room.data.id, auth.user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const grants = await service.from('playbook_room_role_grants').select('role').eq('room_id', room.data.id); const granted = (grants.data ?? []).map(row => row.role as StaffRole)
  if (parsed.data.targetRole !== 'leadership' && !granted.includes(parsed.data.targetRole as StaffRole)) return NextResponse.json({ error: 'That team cannot access this room' }, { status: 400 })
  const entries = await service.from('playbook_entries').select('id, title, revision_number').in('id', parsed.data.entryIds).eq('room_id', room.data.id).eq('status', 'published')
  if (entries.error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 }); if ((entries.data ?? []).length !== new Set(parsed.data.entryIds).size) return NextResponse.json({ error: 'Every learning step must be published guidance in this room' }, { status: 400 })
  const byId = new Map((entries.data ?? []).map(row => [row.id as string, row])); const path = await service.from('playbook_learning_paths').insert({ room_id: room.data.id, title: parsed.data.title, description: parsed.data.description, status: 'published', created_by: auth.user.id, published_at: new Date().toISOString() }).select('id').single()
  if (path.error) { if (isPlaybookEnablementSchemaMissing(path.error)) return NextResponse.json({ error: 'Learning paths are built but not activated yet.' }, { status: 503 }); return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 }) }
  const steps = parsed.data.entryIds.map((id, index) => ({ path_id: path.data.id, sort_order: index, entry_id: id, revision_number: Number(byId.get(id)?.revision_number ?? 1), label: String(byId.get(id)?.title ?? 'Learning step') }))
  const stepWrite = await service.from('playbook_learning_path_steps').insert(steps); if (stepWrite.error) { await service.from('playbook_learning_paths').delete().eq('id', path.data.id); return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 }) }
  const assignment = await service.from('playbook_learning_assignments').insert({ path_id: path.data.id, target_kind: 'role', target_role: parsed.data.targetRole, target_user_id: null, due_at: parsed.data.dueAt, assigned_by: auth.user.id }); if (assignment.error) { await service.from('playbook_learning_paths').delete().eq('id', path.data.id); return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 }) }
  return NextResponse.json({ data: { id: path.data.id } })
}
