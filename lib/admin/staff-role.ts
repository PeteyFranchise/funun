// ─── Client-safe staff-role resolver (Phase 25 / 25-11) ───────────────────
// Extracted from lib/admin/gate.ts so client components (the sign-in page's
// post-login routing) can import it WITHOUT pulling in the server-only
// createApiClient / next/headers that gate.ts's requireStaff depends on.
// gate.ts re-exports these so its existing importers are unaffected.
//
// Pure — reads only app_metadata, never I/O, never throws.
//
// MULTI-ROLE (Team Members redesign, 2026-08): a staff member may hold SEVERAL
// roles. The authoritative store is `app_metadata.staff_roles` (a string[]).
// A legacy single `app_metadata.staff_role` is still honored as a one-element
// fallback, so accounts provisioned before the storage migration keep working
// unchanged. This deliberately supersedes the earlier single-role model — the
// DB-side widen for the new 'legal'/'tms' values + the funun_staff.staff_roles
// column ship in the owner-run migration; recognizing new roles here is safe
// beforehand because this reads app_metadata only, never the DB (same reasoning
// migrations 108/114 used when adding 'anr'/'it').
//
//   getStaffRoles(user) → the full role SET (priority-sorted, deduped).
//   getStaffRole(user)  → the PRIMARY (highest-priority) role, or null. Kept so
//                         the many call sites that branch on a single role, and
//                         the {staffRole} requireStaff returns, are unchanged.
//   hasStaffRole(user, allowed) → true if ANY held role is allowed. This is the
//                         one to use for a CAPABILITY check, because it matches
//                         requireStaff's semantics exactly (gate.ts:48-53).
//
// WHICH ONE TO USE — this distinction is load-bearing (Pass 6 H-3)
//
// requireStaff() passes when ANY of a member's roles is allowed. A page that
// asks `getStaffRole(user) === 'anr'` instead asks whether anr is the member's
// HIGHEST-PRIORITY role, which is a different question. For anyone holding two
// roles the two answers diverge, and the page ends up stricter than the server:
//
//   staff_roles        primary   page says            the API says
//   ['bd','anr']       bd        no (redirects)       yes, via anr
//   ['ae','anr']       ae        no (control hidden)  yes, via anr
//   ['ae','it']        ae        not IT               IT routes accept them
//
// The divergence is always in the safe direction — a page flag derived from one
// role can only ever be a SUBSET of what requireStaff accepts, so this never
// grants more than the server allows. But it silently takes capability away
// from exactly the people the multi-role model exists to serve.
//
// `getStaffRole(user) === 'leadership'` and `!== 'leadership'` remain correct
// without change, because 'leadership' is ROLE_PRIORITY[0]: if a member holds
// it, it is always their primary. That is a property of the ordering, not a
// coincidence — if ROLE_PRIORITY is ever reordered, those call sites must move
// to hasStaffRole() too.

export type StaffRole =
  | 'leadership'
  | 'ae'
  | 'bd'
  | 'anr'
  | 'it'
  | 'legal'
  | 'tms'
  | 'accounting'
  | 'marketing'

export const ALL_STAFF_ROLES: StaffRole[] = [
  'leadership',
  'ae',
  'bd',
  'anr',
  'it',
  'legal',
  'tms',
  'accounting',
  'marketing',
]

// CR-01 hardening (Phase 33): the fail-closed default for every GENERAL staff
// surface — every StaffRole EXCEPT the read-only 'it' role. requireStaff() /
// requireStaffPage() default to this, so 'it' is admitted ONLY where a
// page/route lists it explicitly (today, only the Playbook IT room's
// requireStaffPage(['leadership','it']) calls). 'legal' and 'tms' are
// operational staff (they work inside the console), so they join this set;
// ALL_STAFF_ROLES stays the full enumeration for dropdowns/display.
export const OPERATIONAL_STAFF_ROLES: StaffRole[] = [
  'leadership',
  'ae',
  'bd',
  'anr',
  'legal',
  'tms',
  'accounting',
  'marketing',
]

// Primary-role precedence, highest authority first. getStaffRole() and the
// {staffRole} requireStaff returns pick the highest-priority role a member
// holds, so a leadership+X person still reads as 'leadership' for the call
// sites that branch on a single role.
const ROLE_PRIORITY: StaffRole[] = [
  'leadership',
  'ae',
  'bd',
  'anr',
  'legal',
  'tms',
  'accounting',
  'marketing',
  'it',
]

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (ALL_STAFF_ROLES as string[]).includes(value)
}

// Resolve a user's full staff-role set from app_metadata. Precedence:
//   1. staff_roles (array) — the authoritative multi-role store,
//   2. staff_role (single) — legacy one-element fallback,
//   3. is_admin === true   — backward-compat 'leadership' for the pre-existing
//      owner bootstrap account (D-02/A1) so it is not locked out on deploy.
// Returns a priority-sorted, deduped list; [] when the user is not staff.
export function getStaffRoles(user: { app_metadata?: unknown }): StaffRole[] {
  const meta = user?.app_metadata as
    | { staff_roles?: unknown; staff_role?: unknown; is_admin?: boolean }
    | undefined

  let roles: StaffRole[] = []
  if (Array.isArray(meta?.staff_roles)) {
    roles = (meta!.staff_roles as unknown[]).filter(isStaffRole)
  }
  if (roles.length === 0 && isStaffRole(meta?.staff_role)) {
    roles = [meta!.staff_role as StaffRole]
  }
  if (roles.length === 0 && meta?.is_admin === true) {
    roles = ['leadership']
  }

  const deduped = Array.from(new Set(roles))
  return deduped.sort((a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b))
}

// The PRIMARY (highest-priority) staff role, or null if the user is not staff.
// Backward-compatible with every existing single-role caller.
export function getStaffRole(user: { app_metadata?: unknown }): StaffRole | null {
  return getStaffRoles(user)[0] ?? null
}

// True when the member holds ANY of `allowed`. Mirrors requireStaff's check
// (lib/admin/gate.ts:48-53) exactly, so a page gate written with this cannot
// drift from the route gate it is meant to mirror. Use this for capability
// decisions; use getStaffRole() only for display or for the leadership case
// described in the header above.
export function hasStaffRole(
  user: { app_metadata?: unknown },
  allowed: readonly StaffRole[]
): boolean {
  const roles = getStaffRoles(user)
  return roles.some(r => allowed.includes(r))
}

// The PRIMARY (highest-priority) role of an explicit role SET — used by the
// write path (createStaffAccount + the edit endpoint) to derive the staff_role
// display copy that must accompany staff_roles. Returns null for an empty/
// all-invalid set. Priority-sorted with the same ROLE_PRIORITY as getStaffRoles.
export function primaryStaffRole(roles: readonly StaffRole[]): StaffRole | null {
  const valid = roles.filter(isStaffRole)
  if (valid.length === 0) return null
  return [...valid].sort((a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b))[0]
}
