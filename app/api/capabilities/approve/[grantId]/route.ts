import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { mapSlugsToProfileRoles } from '@/lib/industry/roleMapping'

// Valid decision values (T-15-08 input validation).
const VALID_DECISIONS = ['approve', 'deny'] as const
type Decision = (typeof VALID_DECISIONS)[number]

// ─── POST /api/capabilities/approve/[grantId] ────────────────────────────
// Admin-only route (T-05-02 doctrine — verifyAdmin() is the first statement).
// Flips a pending capability_grants row to approved or denied.
//
// Approve path (D-03/D-11):
//   - Updates status → 'approved', records decided_at/decided_by
//   - Attaches the pre-picked badge (role_slugs were collected at request
//     time) by writing artist_profiles.roles via mapSlugsToProfileRoles()
//
// Deny path:
//   - Updates status → 'denied', records decided_at/decided_by
//   - No badge write
//
// T-15-06 mitigation: the target profile_id is read from the loaded grant
// row — never from the request body (a non-admin cannot self-approve their
// own pending industry request). T-15-09 mitigation: returns 409 if the
// grant is not in 'pending' status (double-decide prevention).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ grantId: string }> }
) {
  // T-05-02: verifyAdmin() is the first statement — must precede any DB read.
  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { grantId } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  // Validate decision literal (T-15-08).
  const decision = body.decision
  if (decision !== 'approve' && decision !== 'deny') {
    return NextResponse.json(
      { error: 'decision must be "approve" or "deny".' },
      { status: 400 }
    )
  }

  const service = createServiceClient()

  // Load the grant row — target profile_id comes from DB, never the caller.
  const { data: grant, error: loadError } = await service
    .from('capability_grants')
    .select('id, profile_id, capability, status, role_slugs')
    .eq('id', grantId)
    .maybeSingle()

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 })
  }
  if (!grant) {
    return NextResponse.json({ error: 'Grant not found.' }, { status: 404 })
  }
  // T-15-09: prevent double-decide.
  if (grant.status !== 'pending') {
    return NextResponse.json(
      { error: 'This request was already decided.' },
      { status: 409 }
    )
  }

  if (decision === 'approve') {
    // Flip the grant row to approved and record the admin decision.
    const { error: updateError } = await service
      .from('capability_grants')
      .update({
        status: 'approved',
        decided_at: new Date().toISOString(),
        decided_by: auth.user.id,
        source: 'admin_approved',
      })
      .eq('id', grant.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // D-11: attach the pre-picked badge — role_slugs were collected at request
    // time; no new input from the caller needed.
    const roleSlugs: string[] = Array.isArray(grant.role_slugs) ? grant.role_slugs : []
    if (roleSlugs.length > 0) {
      await service
        .from('artist_profiles')
        .update({ roles: mapSlugsToProfileRoles(roleSlugs) })
        .eq('id', grant.profile_id)
    }

    return NextResponse.json({ data: { grantId: grant.id, status: 'approved' as const } })
  }

  // Deny path.
  const { error: denyError } = await service
    .from('capability_grants')
    .update({
      status: 'denied',
      decided_at: new Date().toISOString(),
      decided_by: auth.user.id,
    })
    .eq('id', grant.id)

  if (denyError) {
    return NextResponse.json({ error: denyError.message }, { status: 500 })
  }

  return NextResponse.json({ data: { grantId: grant.id, status: 'denied' as const } })
}
