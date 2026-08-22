import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff, primaryStaffRole, ALL_STAFF_ROLES, type StaffRole } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { formatPhone, isValidPhone } from '@/lib/staff/phone'

// Team management is leadership + TMS (people ops) — Team Members redesign.
const MANAGE_ROLES: StaffRole[] = ['leadership', 'tms']

const STAFF_COLUMNS =
  'id, user_id, staff_role, staff_roles, display_name, first_name, last_name, title, phone, avatar_url, created_at'

// Last-leadership guard: would removing/demoting this member leave the console
// with ZERO leadership? Passing nextRoles=null models a full removal (DELETE).
// Blocks demoting or removing the only leadership principal (permanent lockout).
async function wouldOrphanLeadership(
  service: SupabaseClient,
  targetUserId: string,
  nextRoles: StaffRole[] | null
): Promise<boolean> {
  const { data } = await service
    .from('funun_staff')
    .select('user_id')
    .contains('staff_roles', ['leadership'])
  const leaders = (data ?? []).map(r => (r as { user_id: string }).user_id)
  const isTargetLeader = leaders.includes(targetUserId)
  if (!isTargetLeader) return false
  const targetStaysLeader = nextRoles ? nextRoles.includes('leadership') : false
  if (targetStaysLeader) return false
  return leaders.length <= 1
}

function readRoles(body: Record<string, unknown>): StaffRole[] | null | 'invalid' {
  if (!('staff_roles' in body)) return null
  const raw = body.staff_roles
  if (
    !Array.isArray(raw) ||
    raw.length === 0 ||
    !raw.every(r => (ALL_STAFF_ROLES as string[]).includes(r as string))
  ) {
    return 'invalid'
  }
  return Array.from(new Set(raw as StaffRole[]))
}

// ─── PATCH /api/admin/staff/[id] — edit roles and/or contact phone ──────────
// Leadership + TMS. Dual-writes app_metadata (the AUTHORITATIVE gate value) AND
// funun_staff (the DISPLAY copy) in the same handler (25-RESEARCH Pitfall 1):
// staff_roles = the full set, staff_role = its primary. Guarded by the
// last-leadership check so the console can never be orphaned of leadership.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireStaff(MANAGE_ROLES)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const roles = readRoles(body)
  if (roles === 'invalid') {
    return NextResponse.json({ error: 'Select at least one valid role.' }, { status: 400 })
  }

  let nextFirst: string | undefined
  if ('first_name' in body) {
    nextFirst = typeof body.first_name === 'string' ? body.first_name.trim() : ''
    if (!nextFirst) return NextResponse.json({ error: "First name can't be empty." }, { status: 400 })
  }
  let nextLast: string | undefined
  if ('last_name' in body) {
    nextLast = typeof body.last_name === 'string' ? body.last_name.trim() : ''
    if (!nextLast) return NextResponse.json({ error: "Last name can't be empty." }, { status: 400 })
  }
  // Display name optional — a blank value falls back to "First Last" when both
  // are in the same request, otherwise the display update is simply skipped.
  let nextDisplay: string | undefined
  if ('display_name' in body) {
    const d = typeof body.display_name === 'string' ? body.display_name.trim() : ''
    nextDisplay = d || (nextFirst && nextLast ? `${nextFirst} ${nextLast}` : undefined)
  }

  let nextPhone: string | null | undefined
  if ('phone' in body) {
    if (body.phone !== null && typeof body.phone !== 'string') {
      return NextResponse.json({ error: 'Phone must be text.' }, { status: 400 })
    }
    const raw = body.phone === null ? '' : String(body.phone).trim()
    if (raw && !isValidPhone(raw)) {
      return NextResponse.json({ error: 'Enter a 10-digit phone number.' }, { status: 400 })
    }
    nextPhone = raw ? formatPhone(raw) : null
  }

  if (
    roles === null &&
    nextPhone === undefined &&
    nextFirst === undefined &&
    nextLast === undefined &&
    nextDisplay === undefined
  ) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 })
  }

  const service = createServiceClient()

  if (roles && (await wouldOrphanLeadership(service, id, roles))) {
    return NextResponse.json(
      { error: 'You can’t remove Leadership from the last leadership member.' },
      { status: 400 }
    )
  }

  // ── app_metadata write (AUTHORITATIVE for the gate) — only on a role change ─
  if (roles) {
    const primary = primaryStaffRole(roles)
    const { error: authError } = await service.auth.admin.updateUserById(id, {
      // Clear the legacy is_admin fallback too, so a demotion can't be
      // overridden by is_admin===true (getStaffRoles treats it as leadership).
      app_metadata: { staff_roles: roles, staff_role: primary, is_admin: false },
    })
    if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  // ── funun_staff write (DISPLAY COPY) ────────────────────────────────────────
  const tableUpdate: Record<string, unknown> = {}
  if (roles) {
    tableUpdate.staff_roles = roles
    tableUpdate.staff_role = primaryStaffRole(roles)
  }
  if (nextPhone !== undefined) tableUpdate.phone = nextPhone
  if (nextFirst !== undefined) tableUpdate.first_name = nextFirst
  if (nextLast !== undefined) tableUpdate.last_name = nextLast
  if (nextDisplay !== undefined) tableUpdate.display_name = nextDisplay

  let tableWriteError: string | null = null
  const { error: upErr } = await service.from('funun_staff').update(tableUpdate).eq('user_id', id)
  if (upErr) tableWriteError = upErr.message

  // D-04: unconditional, exactly once per request.
  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'update_staff',
    targetType: 'funun_staff',
    targetId: id,
    changes: {
      ...(roles ? { staff_roles: roles } : {}),
      ...(nextPhone !== undefined ? { phone: nextPhone } : {}),
      ...(nextFirst !== undefined ? { first_name: nextFirst } : {}),
      ...(nextLast !== undefined ? { last_name: nextLast } : {}),
      ...(nextDisplay !== undefined ? { display_name: nextDisplay } : {}),
    },
  })

  const { data: row } = await service
    .from('funun_staff')
    .select(STAFF_COLUMNS)
    .eq('user_id', id)
    .maybeSingle()

  return NextResponse.json({
    data: row ?? { user_id: id },
    ...(tableWriteError ? { warning: `Display record update failed: ${tableWriteError}` } : {}),
  })
}

// ─── DELETE /api/admin/staff/[id] — remove a member from the team ────────────
// Leadership + TMS. Deletes the auth user; funun_staff cascades (089 FK
// ON DELETE CASCADE). Guards: can't remove yourself, can't remove the last
// leadership.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireStaff(MANAGE_ROLES)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (id === auth.user.id) {
    return NextResponse.json(
      { error: 'You can’t remove yourself from the team.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()

  if (await wouldOrphanLeadership(service, id, null)) {
    return NextResponse.json(
      { error: 'You can’t remove the last Leadership member.' },
      { status: 400 }
    )
  }

  const { error } = await service.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'remove_staff',
    targetType: 'funun_staff',
    targetId: id,
    changes: {},
  })

  return NextResponse.json({ data: { removed: true } })
}
