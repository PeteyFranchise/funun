import { NextResponse } from 'next/server'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { runVendorHealthChecks } from '@/lib/observability/vendor-health'

// ─── GET /api/admin/vendor-health — independently gated (260826-2qm) ─────
// middleware.ts's config.matcher excludes /api entirely, so this route is
// its OWN complete security boundary — it does not rely on the sub-page's
// nav visibility, which is UX only and never the authorization decision.
//
// The gate is the FIRST statement, before process.env is read and before
// runVendorHealthChecks() is called — a refused request performs zero
// outbound calls to any vendor.
//
// Response contract: every field in the body is derived from a status
// code or a named non-secret vendor field (see lib/observability/vendor-
// health.ts). Adding a field that echoes an env value into this shape
// reintroduces the exact incident this page exists to prevent.

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireRoomAccess('it-team')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { results, summary } = await runVendorHealthChecks()

  return NextResponse.json({
    checkedAt: summary.checkedAt,
    results,
    summary,
  })
}
