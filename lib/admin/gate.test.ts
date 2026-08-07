import { getStaffRole } from '@/lib/admin/gate'

// ─── Fixtures ────────────────────────────────────────────────────────────
// getStaffRole reads only app_metadata; mirror lib/buyers/permissions.test.ts's
// typed-fixture-at-top structure.

describe('lib/admin/gate getStaffRole', () => {
  it('returns leadership for app_metadata.staff_role = leadership', () => {
    expect(getStaffRole({ app_metadata: { staff_role: 'leadership' } })).toBe('leadership')
  })

  it('returns ae and bd for those exact staff_role values', () => {
    expect(getStaffRole({ app_metadata: { staff_role: 'ae' } })).toBe('ae')
    expect(getStaffRole({ app_metadata: { staff_role: 'bd' } })).toBe('bd')
  })

  it('returns leadership when is_admin === true (D-02/A1 bootstrap fallback)', () => {
    expect(getStaffRole({ app_metadata: { is_admin: true } })).toBe('leadership')
  })

  it('returns null for an unrecognized staff_role string', () => {
    expect(getStaffRole({ app_metadata: { staff_role: 'superadmin' } })).toBe(null)
  })

  it('degrades to null from missing/undefined app_metadata, never throws (fail-closed)', () => {
    expect(() => getStaffRole({})).not.toThrow()
    expect(getStaffRole({})).toBe(null)
    expect(() => getStaffRole({ app_metadata: undefined })).not.toThrow()
    expect(getStaffRole({ app_metadata: undefined })).toBe(null)
  })

  it('staff_role wins over is_admin when both are present (explicit role is authoritative)', () => {
    expect(getStaffRole({ app_metadata: { staff_role: 'ae', is_admin: true } })).toBe('ae')
  })
})
