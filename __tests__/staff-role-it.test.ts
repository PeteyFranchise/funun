import { getStaffRole, ALL_STAFF_ROLES } from '@/lib/admin/staff-role'

// ─── Task 1: 'it' StaffRole recognition (Phase 33 / D-01) ─────────────────
// Wave 0 test — written FIRST (RED) before lib/admin/staff-role.ts is
// widened to recognize 'it'. Mirrors lib/admin/gate.test.ts's typed-fixture
// conventions for getStaffRole.

describe('staff-role.ts getStaffRole — it role (Phase 33)', () => {
  it('returns it for app_metadata.staff_role = it', () => {
    expect(getStaffRole({ app_metadata: { staff_role: 'it' } })).toBe('it')
  })

  it('ALL_STAFF_ROLES contains it and still contains leadership/ae/bd/anr', () => {
    expect(ALL_STAFF_ROLES).toContain('it')
    expect(ALL_STAFF_ROLES).toContain('leadership')
    expect(ALL_STAFF_ROLES).toContain('ae')
    expect(ALL_STAFF_ROLES).toContain('bd')
    expect(ALL_STAFF_ROLES).toContain('anr')
    expect(ALL_STAFF_ROLES).toHaveLength(5)
  })

  it('getStaffRole for leadership/ae/bd/anr is unchanged', () => {
    expect(getStaffRole({ app_metadata: { staff_role: 'leadership' } })).toBe('leadership')
    expect(getStaffRole({ app_metadata: { staff_role: 'ae' } })).toBe('ae')
    expect(getStaffRole({ app_metadata: { staff_role: 'bd' } })).toBe('bd')
    expect(getStaffRole({ app_metadata: { staff_role: 'anr' } })).toBe('anr')
  })

  it('returns leadership when is_admin === true (owner bootstrap unaffected)', () => {
    expect(getStaffRole({ app_metadata: { is_admin: true } })).toBe('leadership')
  })

  it('returns null and never throws for missing app_metadata (fail closed)', () => {
    expect(() => getStaffRole({})).not.toThrow()
    expect(getStaffRole({})).toBe(null)
  })

  it('rejects an unrecognized staff_role string', () => {
    expect(getStaffRole({ app_metadata: { staff_role: 'superadmin' } })).toBe(null)
  })
})
