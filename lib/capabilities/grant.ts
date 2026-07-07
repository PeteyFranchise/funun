import { createServiceClient } from '@/lib/supabase/server'
import { mapSlugsToProfileRoles } from '@/lib/industry/roleMapping'

export type Capability = 'artist' | 'industry'
export type CapabilitySource = 'signup' | 'self_serve_instant' | 'admin_approved' | 'backfill'

/**
 * Thrown when the capability_grants partial unique index
 * (capability_grants_active_uniq) rejects a duplicate pending/approved
 * request for the same (profile_id, capability) pair (T-15-02).
 */
export class DuplicateCapabilityRequestError extends Error {}

// ─── grantCapability (D-01/D-10) ────────────────────────────────────────
// Standalone, reusable service function — does NOT provision a brand-new
// auth account (no admin user-creation call, no magic-link generation;
// Pitfall 4). This grants a capability onto an EXISTING artist_profiles
// row: it inserts an
// 'approved' capability_grants row, then auto-attaches the matching role
// badge via mapSlugsToProfileRoles() as a plain UPDATE onto the existing
// row (mirrors createIndustryMember()'s pre-population of `roles`, but as
// an UPDATE instead of user_metadata set at creation time).
export async function grantCapability(input: {
  profileId: string
  capability: Capability
  roleSlugs: string[]
  source: CapabilitySource
  decidedBy?: string
}): Promise<{ grantId: string }> {
  const service = createServiceClient()

  const { data, error } = await service
    .from('capability_grants')
    .insert({
      profile_id: input.profileId,
      capability: input.capability,
      status: 'approved',
      role_slugs: input.roleSlugs,
      source: input.source,
      decided_at: new Date().toISOString(),
      decided_by: input.decidedBy ?? null,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new DuplicateCapabilityRequestError(
        `A request or grant for capability "${input.capability}" already exists for this profile.`
      )
    }
    throw new Error(`Failed to grant capability: ${error.message}`)
  }

  await service
    .from('artist_profiles')
    .update({ roles: mapSlugsToProfileRoles(input.roleSlugs) })
    .eq('id', input.profileId)

  return { grantId: data.id }
}

// ─── requestCapability (D-02 asymmetric gate) ───────────────────────────
// industry -> artist is instant (artist signup is already open to anyone
// with zero verification today, so gating it here would be a NEW
// restriction with no justification). artist -> industry requires admin
// approval (mirrors today's admin-invite trust gate for industry claims —
// impersonation/credibility risk is real on this side).
export async function requestCapability(input: {
  profileId: string
  capability: Capability
  roleSlugs: string[]
}): Promise<{ grantId: string; status: 'approved' | 'pending' }> {
  if (input.capability === 'artist') {
    const { grantId } = await grantCapability({
      profileId: input.profileId,
      capability: 'artist',
      roleSlugs: input.roleSlugs,
      source: 'self_serve_instant',
    })
    return { grantId, status: 'approved' }
  }

  // Pending review path — no badge write yet; the badge attaches at admin
  // approval time (Plan 02's approve route calls grantCapability()).
  const service = createServiceClient()
  const { data, error } = await service
    .from('capability_grants')
    .insert({
      profile_id: input.profileId,
      capability: 'industry',
      status: 'pending',
      role_slugs: input.roleSlugs,
      source: 'self_serve_instant',
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new DuplicateCapabilityRequestError(
        'A request or grant for capability "industry" already exists for this profile.'
      )
    }
    throw new Error(`Failed to request capability: ${error.message}`)
  }

  return { grantId: data.id, status: 'pending' }
}
