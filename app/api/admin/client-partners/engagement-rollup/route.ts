import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { buildEngagementRollup } from '@/lib/selects/engagement-rollup'

// ─── GET /api/admin/client-partners/engagement-rollup (R13, D-31.2-13/14) ──
// Leadership-only (verifyAdmin) aggregate across the WHOLE team's book —
// who's getting listens, which Selects land. buildEngagementRollup
// (lib/selects/engagement-rollup.ts) is the SAME implementation
// app/(admin)/admin/client-partners/page.tsx's loadClientPartnersRoomData
// calls server-side for the leadership tower (plan 10 Task 3) — single
// authority, no parallel aggregation path. This route exists as a
// standalone leadership-gated HTTP surface (a future refresh/poll action
// can call it without a full page reload); non-leadership staff never
// reach the aggregation (T-31.2-27, verifyAdmin fails closed).

export async function GET() {
  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const data = await buildEngagementRollup(service)
  return NextResponse.json({ data })
}
