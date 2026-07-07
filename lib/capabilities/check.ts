import { createServiceClient } from '@/lib/supabase/server'
import type { Capability } from './grant'

// ─── hasCapability (D-14) ────────────────────────────────────────────────
// Read helper backing both nav visibility (Plan 03) and server-side route
// enforcement (Plan 02, e.g. POST /api/antenna/opportunities). Only an
// 'approved' grant row counts — a 'pending' or 'denied' row (or no row at
// all) returns false, so a self-inserted 'pending' row grants nothing even
// if RLS were somehow bypassed (T-15-01 mitigation).
export async function hasCapability(profileId: string, capability: Capability): Promise<boolean> {
  const service = createServiceClient()
  const { data } = await service
    .from('capability_grants')
    .select('id')
    .eq('profile_id', profileId)
    .eq('capability', capability)
    .eq('status', 'approved')
    .maybeSingle()

  return data !== null
}

/** Strict literal guard — true only for the two real capability values. */
export function isValidCapability(value: unknown): value is Capability {
  return value === 'artist' || value === 'industry'
}
