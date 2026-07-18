import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { loadMembersForVerification } from '@/lib/trust-safety/verification'

// ─── GET /api/admin/verification?q= ──────────────────────────────────────
// Lists members for the verified-badge admin queue (SAFETY-03), optionally
// filtered by a free-text search over artist_name/handle. Admin-only —
// verified badge grant/revoke has no self-serve path in V1.
export async function GET(request: Request) {
  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const url = new URL(request.url)
  const q = url.searchParams.get('q')?.trim().slice(0, 120) || null

  const service = createServiceClient()
  try {
    const data = await loadMembersForVerification(service, q)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load members' }, { status: 500 })
  }
}
