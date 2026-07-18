import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
const HEARTBEAT_THROTTLE_MS = 60_000

// POST /api/presence/heartbeat  → throttled last_seen_at write (PRESENCE-01/02)
// Session client only authenticates the caller; the actual write uses the
// service-role client because artist_profiles has no authenticated UPDATE
// grant on last_seen_at (migration 054 T-11-04) — a member must never be
// able to forge their own "Active now" via direct PostgREST.
export async function POST(_request: Request) {
  if (DEMO) return NextResponse.json({ ok: true })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const now = new Date().toISOString()
  const throttleCutoff = new Date(Date.now() - HEARTBEAT_THROTTLE_MS).toISOString()

  // Throttled write: only update when the existing value is stale.
  await service.from('artist_profiles').update({ last_seen_at: now }).eq('id', user.id).lt('last_seen_at', throttleCutoff)

  // First-ever heartbeat: `.lt()` never matches a NULL last_seen_at, so a
  // brand-new member's first heartbeat needs its own conditional branch.
  await service.from('artist_profiles').update({ last_seen_at: now }).eq('id', user.id).is('last_seen_at', null)

  return NextResponse.json({ ok: true })
}
