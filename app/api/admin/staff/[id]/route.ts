import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff, type StaffRole } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'

const STAFF_ROLE_VALUES: StaffRole[] = ['leadership', 'ae', 'bd']

const STAFF_COLUMNS = 'id, user_id, staff_role, display_name, title, phone, avatar_url, created_at'

type StaffPatch = { staff_role?: StaffRole; active?: boolean }

type SanitizeResult = { update: StaffPatch } | { error: string; status: number }

// Only accepts staff_role (validated against the closed StaffRole enum) and
// an optional active flag (deactivate signal) — reject an invalid role
// string, never coerce. Mirrors app/api/profile/route.ts's sanitize()
// discriminated-union shape.
function sanitizeStaffPatch(body: Record<string, unknown>): SanitizeResult {
  const update: StaffPatch = {}

  if ('staff_role' in body) {
    const value = body.staff_role
    if (typeof value !== 'string' || !STAFF_ROLE_VALUES.includes(value as StaffRole)) {
      return { error: 'Select a valid staff role.', status: 400 }
    }
    update.staff_role = value as StaffRole
  }

  if ('active' in body) {
    if (typeof body.active !== 'boolean') {
      return { error: '`active` must be a boolean.', status: 400 }
    }
    update.active = body.active
  }

  if (Object.keys(update).length === 0) {
    return { error: 'No valid fields to update.', status: 400 }
  }

  return { update }
}

// ─── PATCH /api/admin/staff/[id] ────────────────────────────────────────────
// Leadership-only role change / deactivate. Dual-writes app_metadata (the
// AUTHORITATIVE gate value) AND funun_staff.staff_role (the DISPLAY copy) in
// the same handler — never split across two endpoints (25-RESEARCH.md
// Pitfall 1). Deactivation semantics: since funun_staff (migration 089) has
// no `active`/`deactivated_at` column and this plan cannot alter that
// unpushed migration, `active:false` clears app_metadata.staff_role to null
// via the same admin.updateUserById() write already used for role change —
// this immediately and really revokes gate access (getStaffRole() returns
// null for a missing staff_role, so requireStaff() 403s the account on its
// next request) without requiring a schema change. funun_staff.staff_role
// keeps its last-known value as a historical display record; recorded in
// this plan's SUMMARY.md as the deactivation semantics chosen.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  // Self-lockout guard (review #7): a leadership admin cannot deactivate or
  // re-role their OWN account here. The caller is always leadership and can
  // never target themselves, so at least one active leadership principal always
  // remains — the "last leadership" can never be removed/downgraded via this route.
  if (id === auth.user.id) {
    return NextResponse.json(
      { error: 'You can’t change your own staff role or active status here.' },
      { status: 400 }
    )
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const result = sanitizeStaffPatch(body)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const update = result.update

  const service = createServiceClient()
  const deactivating = update.active === false

  // ── app_metadata write (AUTHORITATIVE for the gate) ──────────────────────
  const nextAppMetadataRole: StaffRole | null | undefined = deactivating
    ? null
    : update.staff_role

  if (nextAppMetadataRole !== undefined) {
    const { error: authError } = await service.auth.admin.updateUserById(id, {
      // staff_role is the authoritative gate value. Also clear the legacy
      // app_metadata.is_admin fallback (review #7): otherwise is_admin=true would
      // override this deactivation/downgrade, since getStaffRole() treats
      // is_admin===true as leadership regardless of staff_role.
      app_metadata: { staff_role: nextAppMetadataRole, is_admin: false },
    })
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }
  }

  // ── funun_staff write (DISPLAY COPY) ──────────────────────────────────────
  // Deactivation has no persisted column to write (see comment above) — the
  // table write only applies to an actual role value, never on deactivate.
  // Wrapped so a table-write failure is surfaced but never leaves
  // app_metadata (already written above) out of sync in the enforced sense —
  // app_metadata stays authoritative regardless of this write's outcome.
  let tableWriteError: string | null = null
  if (update.staff_role && !deactivating) {
    const { error } = await service
      .from('funun_staff')
      .update({ staff_role: update.staff_role })
      .eq('user_id', id)
    if (error) tableWriteError = error.message
  }

  // D-04: unconditional, exactly once per request, regardless of the
  // table-write outcome above.
  await logStaffAction(service, {
    actorId: auth.user.id,
    action: deactivating ? 'deactivate_staff' : 'update_staff',
    targetType: 'funun_staff',
    targetId: id,
    changes: update as Record<string, unknown>,
  })

  const { data: row } = await (service as SupabaseClient)
    .from('funun_staff')
    .select(STAFF_COLUMNS)
    .eq('user_id', id)
    .maybeSingle()

  return NextResponse.json({
    data: row ?? { user_id: id, ...update },
    ...(tableWriteError ? { warning: `Display record update failed: ${tableWriteError}` } : {}),
  })
}
