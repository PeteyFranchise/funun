import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { markAssignmentComplete } from '@/lib/playbook/plays'

// ─── POST /api/admin/plays/[id]/assignments/[assignmentId]/complete ───────
// Any staff member (requireStaff — no leadership gate; every AE marks their
// OWN completions) marks the CALLING AE's own completion on an assignment —
// idempotent per (assignment, AE) via markAssignmentComplete's
// upsert-on-conflict-do-nothing (D-31.2-11). A re-click on an already-
// completed assignment returns success without a duplicate row. The play
// id in the URL scopes the assignment to its parent play for the route
// shape only — the write itself keys off assignmentId + the caller's own
// id, never a body-supplied AE id (never let a caller mark completion for
// someone else).

const BodySchema = z.object({ note: z.string().max(2000).optional() }).strict()

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const auth = await requireStaff()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { assignmentId } = await params

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  }

  const service = createServiceClient()

  try {
    const result = await markAssignmentComplete(service, assignmentId, auth.user.id, parsed.data.note ?? null)

    // Unconditional — mirrors stampLicenseExecuted's route (D-04): a
    // re-click on an already-completed assignment still records the attempt.
    await logStaffAction(service, {
      actorId: auth.user.id,
      action: 'complete_play_assignment',
      targetType: 'play_assignments',
      targetId: assignmentId,
    })

    return NextResponse.json({ data: result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to mark assignment complete' },
      { status: 500 }
    )
  }
}
