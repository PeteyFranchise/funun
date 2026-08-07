import { createApiClient } from '@/lib/supabase/server'

// ─── Staff auth gate (Phase 25 — generalized from the binary admin gate) ──
// Must run on every /api/admin/* handler before createServiceClient() is
// invoked. Returns { error, status } if the caller is not staff (or not in
// the allowed role set), { user, staffRole } if the gate passes.
//
// T-05-02: this gate provides the per-route auth check so that the layout
// redirect alone is not relied upon as the authority decision.
// D-01 (Phase 25): requireStaff() is the single authority every staff route
// calls before touching a service-role client — no parallel auth path.

export type StaffRole = 'leadership' | 'ae' | 'bd'

const ALL_STAFF_ROLES: StaffRole[] = ['leadership', 'ae', 'bd']

type ApiUser = NonNullable<
  Awaited<ReturnType<Awaited<ReturnType<typeof createApiClient>>['auth']['getUser']>>['data']['user']
>

type RequireStaffResult =
  | { error: 'Unauthorized'; status: 401 }
  | { error: 'Forbidden'; status: 403 }
  | { user: ApiUser; staffRole: StaffRole }

type VerifyAdminResult =
  | { error: 'Unauthorized'; status: 401 }
  | { error: 'Forbidden'; status: 403 }
  | { user: ApiUser }

// Pure — reads only app_metadata, never I/O, never throws. staff_role is
// authoritative when present; app_metadata.is_admin === true is a
// backward-compat fallback to 'leadership' for the pre-existing owner
// bootstrap account (D-02/A1) so it is not locked out on deploy.
export function getStaffRole(user: { app_metadata?: unknown }): StaffRole | null {
  const meta = user?.app_metadata as { staff_role?: string; is_admin?: boolean } | undefined
  if (meta?.staff_role === 'leadership' || meta?.staff_role === 'ae' || meta?.staff_role === 'bd') {
    return meta.staff_role
  }
  if (meta?.is_admin === true) return 'leadership'
  return null
}

export async function requireStaff(allowed: StaffRole[] = ALL_STAFF_ROLES): Promise<RequireStaffResult> {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const staffRole = getStaffRole(user)
  if (!staffRole || !allowed.includes(staffRole)) return { error: 'Forbidden', status: 403 }
  return { user, staffRole }
}

// Preserved leadership alias — zero changes required to ~15 existing
// /api/admin/* callers (D-01, single authority, no parallel path).
export async function verifyAdmin(): Promise<VerifyAdminResult> {
  const result = await requireStaff(['leadership'])
  if ('error' in result) return result
  return { user: result.user }
}

// ─── Shared constants ────────────────────────────────────────────────────

// Mass-assignment protection: only these fields may be written via PATCH.
export const EDITABLE_FIELDS = [
  'label',
  'section',
  'action_type',
  'action_href',
  'action_label',
  'sort_order',
] as const

export type EditableField = (typeof EDITABLE_FIELDS)[number]

export const SECTION_VALUES = [
  'before_release',
  'week_1',
  'week_2',
  'weeks_3_4',
] as const

export const ACTION_TYPE_VALUES = ['internal_tool', 'external_url'] as const

// itemKey is used directly in a WHERE clause — must be constrained.
// T-05-08: regex prevents SQL injection via the key path param.
export const KEY_REGEX = /^[a-z0-9_]+$/
