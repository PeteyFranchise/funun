import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { stampLicenseExecuted } from '@/lib/deals/executed'

// ─── POST /api/admin/deals/[id]/executed ───────────────────────────────────
// The explicit executed/signed-license event (D-31.1-09) — the ONLY write
// path for license_requests.executed_at, the relationship-health color
// clock source. Deliberately distinct from PATCH /api/admin/deals/[id]'s
// stage transitions: moving a deal to closed_won does not stamp this
// column, and this route does not touch `stage`. Leadership-only
// (verifyAdmin), mirroring app/api/admin/deals/[id]/route.ts's auth gate.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const service = createServiceClient()

  const result = await stampLicenseExecuted(service, id, new Date().toISOString())
  if (!result) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  // Unconditional — mirrors grantOrRevokeVerification's "log even
  // idempotent actions" discipline (D-04); a re-POST on an already-executed
  // deal still records the attempt.
  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'stamp_license_executed',
    targetType: 'license_request',
    targetId: id,
    changes: { executed_at: result.executedAt },
  })

  return NextResponse.json({ data: { executedAt: result.executedAt, alreadyExecuted: result.alreadyExecuted } })
}
