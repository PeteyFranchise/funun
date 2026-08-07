import { createApiClient } from '@/lib/supabase/server'
import { getStaffRole, ALL_STAFF_ROLES, type StaffRole } from './staff-role'

// getStaffRole + StaffRole moved to ./staff-role (client-safe, no server imports)
// so client components can import them; re-exported here so every existing
// importer of @/lib/admin/gate is unaffected (D-01, single authority).
export { getStaffRole } from './staff-role'
export type { StaffRole } from './staff-role'

// ─── Staff auth gate (Phase 25 — generalized from the binary admin gate) ──
// Must run on every /api/admin/* handler before createServiceClient() is
// invoked. Returns { error, status } if the caller is not staff (or not in
// the allowed role set), { user, staffRole } if the gate passes.
//
// T-05-02: this gate provides the per-route auth check so that the layout
// redirect alone is not relied upon as the authority decision.
// D-01 (Phase 25): requireStaff() is the single authority every staff route
// calls before touching a service-role client — no parallel auth path.

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
