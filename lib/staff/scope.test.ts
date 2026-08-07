import { isAssignedToOrg } from '@/lib/staff/scope'

// ─── Fixtures ────────────────────────────────────────────────────────────
// isAssignedToOrg is a pure, zero-I/O predicate over an already-fetched org
// row — mirror lib/buyers/permissions.test.ts's typed-fixture structure.

describe('lib/staff/scope isAssignedToOrg', () => {
  it('returns true when org.ae_user_id matches the caller', () => {
    expect(isAssignedToOrg({ ae_user_id: 'u1' }, 'u1')).toBe(true)
  })

  it('returns false when org.ae_user_id does not match the caller', () => {
    expect(isAssignedToOrg({ ae_user_id: 'u2' }, 'u1')).toBe(false)
  })

  it('returns false when org.ae_user_id is null', () => {
    expect(isAssignedToOrg({ ae_user_id: null }, 'u1')).toBe(false)
  })

  it('degrades to false for null/undefined org, never throws (fail-closed)', () => {
    expect(() => isAssignedToOrg(null, 'u1')).not.toThrow()
    expect(isAssignedToOrg(null, 'u1')).toBe(false)
    expect(() => isAssignedToOrg(undefined, 'u1')).not.toThrow()
    expect(isAssignedToOrg(undefined, 'u1')).toBe(false)
  })

  it('returns false for an empty caller id, never matches', () => {
    expect(isAssignedToOrg({ ae_user_id: 'u1' }, '')).toBe(false)
  })
})
