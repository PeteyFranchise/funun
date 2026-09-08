import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ALL_STAFF_ROLES, getStaffRoles } from '@/lib/admin/staff-role'
import { requireStaff } from '@/lib/admin/gate'
import { staffTargetApplies } from '@/lib/playbook/enablement'
import { canAccessRoom } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'

const Id = z.string().uuid(); const Body = z.object({ response: z.string().trim().max(4000).nullable(), selfConfirmed: z.boolean() }).strict()
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const parsed = Body.safeParse(await request.json().catch(() => ({}))); if (!Id.safeParse(id).success || !parsed.success) return NextResponse.json({ error: 'Invalid learning completion' }, { status: 400 })
  const auth = await requireStaff(ALL_STAFF_ROLES); if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status }); const service = createServiceClient(); const roles = getStaffRoles(auth.user)
  const step = await service.from('playbook_learning_path_steps').select('id, path_id, knowledge_prompt').eq('id', id).maybeSingle(); if (!step.data) return NextResponse.json({ error: 'Learning step not found' }, { status: 404 })
  const path = await service.from('playbook_learning_paths').select('room_id').eq('id', step.data.path_id).maybeSingle(); if (!path.data) return NextResponse.json({ error: 'Learning path not found' }, { status: 404 })
  const grants = await service.from('playbook_room_role_grants').select('role').eq('room_id', path.data.room_id)
  if (!canAccessRoom(roles, (grants.data ?? []).map(row => row.role))) return NextResponse.json({ error: 'You no longer have access to this learning path' }, { status: 403 })
  const assignments = await service.from('playbook_learning_assignments').select('target_kind, target_user_id, target_role').eq('path_id', step.data.path_id).is('revoked_at', null)
  if (assignments.error) return NextResponse.json({ error: assignments.error.message }, { status: 500 }); if (!(assignments.data ?? []).some(target => staffTargetApplies(target, auth.user.id, roles))) return NextResponse.json({ error: 'This learning path is not assigned to you' }, { status: 403 })
  if (step.data.knowledge_prompt && (!parsed.data.response || !parsed.data.selfConfirmed)) return NextResponse.json({ error: 'Answer and confirm the knowledge check before completing this step' }, { status: 400 })
  if (step.data.knowledge_prompt) { const attempt = await service.from('playbook_knowledge_attempts').insert({ step_id: id, user_id: auth.user.id, response: parsed.data.response, self_confirmed: parsed.data.selfConfirmed }); if (attempt.error) return NextResponse.json({ error: attempt.error.message }, { status: 500 }) }
  const write = await service.from('playbook_learning_step_completions').upsert({ step_id: id, user_id: auth.user.id }, { onConflict: 'step_id,user_id' }); if (write.error) return NextResponse.json({ error: write.error.message }, { status: 500 })
  return NextResponse.json({ data: { stepId: id, complete: true } })
}
