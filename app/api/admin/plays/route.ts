import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff, verifyAdmin } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { PublishPlaySchema, loadActivePlay, publishPlay } from '@/lib/playbook/plays'

// ─── GET/POST /api/admin/plays (D-31.2-08/09/10, 31.2 plan 06 Task 3) ─────
// GET: any staff member reads the current active team-wide play (requireStaff)
// — the "today's play" every AE sees on their My Client Partners banner
// (plan 09). POST: leadership-only (verifyAdmin) publish — retires the
// prior active play (if any) and activates the new one, honoring the
// one-active invariant (D-31.2-08); every assignment is validated by
// validateAssignment (via publishPlay) before any write. Every publish is
// audited (D-04).

export async function GET() {
  const auth = await requireStaff()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const active = await loadActivePlay(service)
  return NextResponse.json({ data: active })
}

export async function POST(request: Request) {
  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = PublishPlaySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid play.' }, { status: 400 })
  }

  const service = createServiceClient()

  try {
    const result = await publishPlay(service, parsed.data, auth.user.id)

    await logStaffAction(service, {
      actorId: auth.user.id,
      action: 'publish_play',
      targetType: 'plays',
      targetId: result.play.id,
      changes: { title: result.play.title, assignment_count: result.assignments.length },
    })

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to publish play' }, { status: 400 })
  }
}
