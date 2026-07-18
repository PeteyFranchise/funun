import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { parseReportFilters, loadReportsForAdmin } from '@/lib/trust-safety/admin-reports'

// ─── GET /api/admin/reports?status=&reason=&targetType=&since=&until= ────
// Lists the report queue for admin review, filterable by status, reason,
// target type, and a created_at date range. Enriched with a minimal
// reporter identity projection only — reported-user identity for
// green_room_* / profile targets is intentionally NOT resolved here (that
// would require per-target-type lookups this task doesn't need); the admin
// UI resolves target_id → content via the target_type-specific admin
// surfaces it already has (e.g. green-room placements admin).
export async function GET(request: Request) {
  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const url = new URL(request.url)
  const parsed = parseReportFilters(url.searchParams)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const service = createServiceClient()
  try {
    const data = await loadReportsForAdmin(service, parsed.value)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load reports' }, { status: 500 })
  }
}
