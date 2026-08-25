import { canAccessRoom } from './rooms'

// ─── lib/playbook/rooms.test.ts (31.2-03 Task 1) ──────────────────────────
// Unit-proves the pure canAccessRoom predicate — the tested surface per the
// plan ("the DB-backed require* functions are exercised by the route test
// in Task 3"). Leadership is structurally never gated (D-31.2-01/03,
// Pitfall 5); every other role passes only via an explicit grant; a
// multi-role member passes if ANY held role is granted.

describe('lib/playbook/rooms canAccessRoom', () => {
  it('leadership passes even with an empty grant set (structural, never row-data)', () => {
    expect(canAccessRoom(['leadership'], [])).toBe(true)
  })

  it('leadership passes regardless of which roles are granted', () => {
    expect(canAccessRoom(['leadership'], ['it'])).toBe(true)
  })

  it('a role with no matching grant is denied', () => {
    expect(canAccessRoom(['ae'], ['it'])).toBe(false)
  })

  it('a role with a matching grant passes', () => {
    expect(canAccessRoom(['it'], ['it'])).toBe(true)
  })

  it('a multi-role member passes if ANY held role is granted', () => {
    expect(canAccessRoom(['ae', 'tms'], ['tms'])).toBe(true)
  })

  it('a multi-role member is denied when NONE of their held roles is granted', () => {
    expect(canAccessRoom(['ae', 'bd'], ['it', 'tms'])).toBe(false)
  })

  it('an empty roles set is denied (no staff role at all)', () => {
    expect(canAccessRoom([], ['it'])).toBe(false)
  })

  it('leadership held alongside other roles still short-circuits true', () => {
    expect(canAccessRoom(['leadership', 'ae'], [])).toBe(true)
  })
})
