import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { createNotification } from '@/lib/notifications'
import { buildSyncLibraryInviteNotification } from '@/lib/social/notifications'

// ─── POST /api/sync-library/invite ─────────────────────────────────────
// Staff mints an admin_invited sync_library capability_grants row for an
// artist (26-CONTEXT.md "Invited (push)" entry path) and notifies them —
// the invite mint that backs the dashboard spotlight card (26-08/26-09).
//
// T-26-17: requireStaff() is the FIRST statement, before any DB read.
// Curation stays with the broader permissioned-staff role per CONTEXT
// ("admission stays with the broader permissioned-staff curation role") —
// leadership AND ae, unlike the leadership-only removal route.

// Statuses that occupy capability_grants_active_uniq (migration 042) — an
// existing row in either blocks a fresh insert and should be returned
// as-is (idempotent), never duplicated.
const ACTIVE_GRANT_STATUSES = ['pending', 'approved']

type RequestBody = { profileId?: unknown }
type ProfileRow = { id: string; member_type: string }
type GrantRow = { id: string; status: string }

export async function POST(request: Request) {
  // T-26-17: staff-gate-first — precedes any DB read.
  const auth = await requireStaff(['leadership', 'ae'])
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody
  const profileId = body.profileId
  if (typeof profileId !== 'string' || profileId.trim() === '') {
    return NextResponse.json({ error: 'profileId is required.' }, { status: 400 })
  }

  const service = createServiceClient()

  // Confirm the target is a real artist account before minting anything.
  const { data: profileRaw, error: profileError } = await service
    .from('user_profiles')
    .select('id, member_type')
    .eq('id', profileId)
    .maybeSingle()
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }
  const profile = profileRaw as ProfileRow | null
  if (!profile || profile.member_type !== 'artist') {
    return NextResponse.json({ error: 'Artist account not found.' }, { status: 404 })
  }

  // Idempotent: an active sync_library grant already exists — return it,
  // never duplicate (respects capability_grants_active_uniq).
  const { data: existingRaw, error: existingError } = await service
    .from('capability_grants')
    .select('id, status')
    .eq('profile_id', profileId)
    .eq('capability', 'sync_library')
    .in('status', ACTIVE_GRANT_STATUSES)
    .maybeSingle()
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }
  const existing = existingRaw as GrantRow | null
  if (existing) {
    // T-26-21: audit even the idempotent no-op — mirrors logStaffAction's
    // own "log even idempotent actions" discipline.
    await logStaffAction(service, {
      actorId: auth.user.id,
      action: 'sync_library.invite',
      targetType: 'capability_grant',
      targetId: existing.id,
      changes: { profileId, idempotent: true },
    })
    return NextResponse.json({ data: { grantId: existing.id, status: existing.status } })
  }

  const nowIso = new Date().toISOString()
  // T-26-20: fixed allowlisted column set — never spread the request body.
  const { data: grantRaw, error: insertError } = await service
    .from('capability_grants')
    .insert({
      profile_id: profileId,
      capability: 'sync_library',
      status: 'approved',
      source: 'admin_invited',
      decided_at: nowIso,
      decided_by: auth.user.id,
    })
    .select('id, status')
    .maybeSingle()
  if (insertError || !grantRaw) {
    return NextResponse.json(
      { error: insertError?.message ?? 'Failed to create invite.' },
      { status: 500 }
    )
  }
  const grant = grantRaw as GrantRow

  // Best-effort — a notification failure must never abort the grant.
  try {
    await createNotification(
      service,
      buildSyncLibraryInviteNotification({
        recipientId: profileId,
        actorId: auth.user.id,
      })
    )
  } catch {
    // swallow — non-fatal side effect
  }

  // T-26-21: UNCONDITIONAL, after the write.
  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'sync_library.invite',
    targetType: 'capability_grant',
    targetId: grant.id,
    changes: { profileId },
  })

  return NextResponse.json({ data: { grantId: grant.id, status: grant.status } }, { status: 201 })
}
