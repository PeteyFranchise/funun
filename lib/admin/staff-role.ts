// ─── Client-safe staff-role resolver (Phase 25 / 25-11) ───────────────────
// Extracted from lib/admin/gate.ts so client components (the sign-in page's
// post-login routing) can import it WITHOUT pulling in the server-only
// createApiClient / next/headers that gate.ts's requireStaff depends on.
// gate.ts re-exports these so its existing importers are unaffected.
//
// Pure — reads only app_metadata, never I/O, never throws.

// 'anr' (A&R) added in Phase 30 (30-03) — the DB-side CHECK widen lives in
// the OWNER-RUN migration 108_anr_staff_role.sql. This union ships live
// immediately (no gate): getStaffRole reads only app_metadata, never the
// DB, so recognizing 'anr' here is safe before 108 is applied — no
// funun_staff row can hold 'anr' until then anyway. A&R's Phase-30
// authority is narrow: approve/reject AE tag proposals (30-06) only;
// admit/reject/remove curation stays leadership-only.
//
// 'it' added in Phase 33 (33-01, D-01) — the DB-side CHECK widen lives in
// the OWNER-RUN migration 114_it_staff_role.sql. Same reasoning as 'anr'
// above: this union ships live immediately because getStaffRole reads only
// app_metadata, never the DB, so recognizing 'it' here is safe before 114
// is applied — no funun_staff row can hold 'it' until the owner assigns it.
// 'it' is a forward-compatible single-slot role for a future non-leadership
// IT hire; its authority is narrow: Playbook IT-room read access only
// (dashboard, vendor directory, runbook, operating rhythm, thresholds).
// The single-role model stands (D-03): a person is 'it' OR 'leadership',
// never both — the owner reaches the IT room via the leadership branch.
export type StaffRole = 'leadership' | 'ae' | 'bd' | 'anr' | 'it'

export const ALL_STAFF_ROLES: StaffRole[] = ['leadership', 'ae', 'bd', 'anr', 'it']

// staff_role is authoritative when present; app_metadata.is_admin === true is a
// backward-compat fallback to 'leadership' for the pre-existing owner bootstrap
// account (D-02/A1) so it is not locked out on deploy.
export function getStaffRole(user: { app_metadata?: unknown }): StaffRole | null {
  const meta = user?.app_metadata as { staff_role?: string; is_admin?: boolean } | undefined
  if (
    meta?.staff_role === 'leadership' ||
    meta?.staff_role === 'ae' ||
    meta?.staff_role === 'bd' ||
    meta?.staff_role === 'anr' ||
    meta?.staff_role === 'it'
  ) {
    return meta.staff_role
  }
  if (meta?.is_admin === true) return 'leadership'
  return null
}
