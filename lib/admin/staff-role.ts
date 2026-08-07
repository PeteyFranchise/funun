// ─── Client-safe staff-role resolver (Phase 25 / 25-11) ───────────────────
// Extracted from lib/admin/gate.ts so client components (the sign-in page's
// post-login routing) can import it WITHOUT pulling in the server-only
// createApiClient / next/headers that gate.ts's requireStaff depends on.
// gate.ts re-exports these so its existing importers are unaffected.
//
// Pure — reads only app_metadata, never I/O, never throws.

export type StaffRole = 'leadership' | 'ae' | 'bd'

export const ALL_STAFF_ROLES: StaffRole[] = ['leadership', 'ae', 'bd']

// staff_role is authoritative when present; app_metadata.is_admin === true is a
// backward-compat fallback to 'leadership' for the pre-existing owner bootstrap
// account (D-02/A1) so it is not locked out on deploy.
export function getStaffRole(user: { app_metadata?: unknown }): StaffRole | null {
  const meta = user?.app_metadata as { staff_role?: string; is_admin?: boolean } | undefined
  if (meta?.staff_role === 'leadership' || meta?.staff_role === 'ae' || meta?.staff_role === 'bd') {
    return meta.staff_role
  }
  if (meta?.is_admin === true) return 'leadership'
  return null
}
