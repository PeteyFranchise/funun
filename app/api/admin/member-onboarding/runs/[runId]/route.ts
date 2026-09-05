import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireStaff } from '@/lib/admin/gate'
import { createServiceClient } from '@/lib/supabase/server'
import {
  MEMBER_ONBOARDING_STAFF_ROLES,
  RunChecklistItemSchema,
  UpdateRunSchema,
  mergeChecklistUpdates,
  type MemberGamePlanRun,
} from '@/lib/member-onboarding/game-plan'

const CurrentItemsSchema = z.array(RunChecklistItemSchema).max(80)

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireStaff([...MEMBER_ONBOARDING_STAFF_ROLES])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { runId } = await params
  if (!z.string().uuid().safeParse(runId).success) {
    return NextResponse.json({ error: 'Invalid game plan.' }, { status: 400 })
  }

  const parsed = UpdateRunSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid game plan.' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: currentData, error: currentError } = await service
    .from('member_game_plan_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle()

  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 })
  if (!currentData) return NextResponse.json({ error: 'Game plan not found.' }, { status: 404 })
  const current = currentData as MemberGamePlanRun
  if (current.status !== 'open') {
    return NextResponse.json({ error: 'Completed call logs cannot be changed.' }, { status: 409 })
  }

  const currentItems = CurrentItemsSchema.safeParse(current.items)
  if (!currentItems.success) {
    return NextResponse.json({ error: 'This game plan needs support before it can be updated.' }, { status: 500 })
  }

  let items
  try {
    items = mergeChecklistUpdates(currentItems.data, parsed.data.items)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The checklist changed. Refresh and try again.' },
      { status: 409 }
    )
  }

  const completing = parsed.data.action === 'complete'
  const { data, error } = await service
    .from('member_game_plan_runs')
    .update({
      items,
      context: parsed.data.context,
      overall_notes: parsed.data.overallNotes.trim(),
      ...(completing ? { status: 'completed', completed_at: new Date().toISOString() } : {}),
    })
    .eq('id', runId)
    .eq('status', 'open')
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'This game plan was changed in another tab.' }, { status: 409 })
  return NextResponse.json({ data: data as MemberGamePlanRun })
}
