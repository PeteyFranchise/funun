import { getStaffRole, getStaffRoles, hasStaffRole } from '@/lib/admin/staff-role'

// Pass 6 H-3. requireStaff() (lib/admin/gate.ts:48-53) passes when ANY of a
// member's roles is allowed. Pages that asked `getStaffRole(user) === 'anr'`
// were asking whether anr is the member's HIGHEST-PRIORITY role -- a different
// question, which diverges for anyone holding two roles.
//
// Pass 4 reported this matrix as clean. It is clean only for single-role staff.

const user = (...roles: string[]) => ({ app_metadata: { staff_roles: roles } })

describe('Pass 6 H-3 — the divergence these tests exist to pin down', () => {
  it.each([
    [['bd', 'anr'], 'bd'],
    [['ae', 'anr'], 'ae'],
    [['ae', 'it'], 'ae'],
  ])('primary of %j is %s, which is NOT the role the capability needs', (roles, primary) => {
    expect(getStaffRole(user(...roles))).toBe(primary)
  })

  it('a bd+anr member was redirected off the submissions queue the admit route accepts', () => {
    const u = user('bd', 'anr')
    // What the page used to ask:
    const oldPageGate = ['leadership', 'ae', 'anr'].includes(getStaffRole(u) as string)
    expect(oldPageGate).toBe(false)
    // What the route asks, and what the page asks now:
    expect(hasStaffRole(u, ['leadership', 'ae', 'anr'])).toBe(true)
    expect(hasStaffRole(u, ['leadership', 'anr'])).toBe(true)
  })

  it('an ae+anr member saw the page but lost admit and quality-review', () => {
    const u = user('ae', 'anr')
    const oldCanAdmit = ['leadership', 'anr'].includes(getStaffRole(u) as string)
    expect(oldCanAdmit).toBe(false)
    expect(hasStaffRole(u, ['leadership', 'anr'])).toBe(true)
  })

  it('an ae+it member never reached the IT dashboard — it is LAST in ROLE_PRIORITY', () => {
    const u = user('ae', 'it')
    const oldPlaybookGate = ['leadership', 'it'].includes(getStaffRole(u) as string)
    expect(oldPlaybookGate).toBe(false)
    expect(hasStaffRole(u, ['leadership', 'it'])).toBe(true)
  })
})

describe('hasStaffRole — matches requireStaff semantics', () => {
  it('passes when ANY held role is allowed', () => {
    expect(hasStaffRole(user('bd', 'anr'), ['anr'])).toBe(true)
    expect(hasStaffRole(user('anr', 'bd'), ['bd'])).toBe(true)
    expect(hasStaffRole(user('leadership'), ['anr', 'leadership'])).toBe(true)
  })

  it('fails when no held role is allowed', () => {
    expect(hasStaffRole(user('bd'), ['anr'])).toBe(false)
    expect(hasStaffRole(user('it'), ['leadership', 'ae', 'anr'])).toBe(false)
  })

  it('fails closed for a non-staff user, an empty set and junk metadata', () => {
    expect(hasStaffRole({}, ['leadership'])).toBe(false)
    expect(hasStaffRole({ app_metadata: {} }, ['leadership'])).toBe(false)
    expect(hasStaffRole(user(), ['leadership'])).toBe(false)
    expect(hasStaffRole({ app_metadata: { staff_roles: 'leadership' } }, ['leadership'])).toBe(false)
    expect(hasStaffRole(user('not-a-role'), ['leadership'])).toBe(false)
  })

  it('honours the legacy single staff_role and the is_admin bootstrap', () => {
    expect(hasStaffRole({ app_metadata: { staff_role: 'anr' } }, ['anr'])).toBe(true)
    expect(hasStaffRole({ app_metadata: { is_admin: true } }, ['leadership'])).toBe(true)
  })

  it('is never more permissive than requireStaff — the safety direction', () => {
    // A page flag derived from the primary role can only ever be a SUBSET of
    // what requireStaff accepts, so the old behaviour under-granted and never
    // over-granted. This asserts the new helper does not overshoot either.
    const allowed = ['leadership', 'anr'] as const
    for (const roles of [['bd', 'anr'], ['ae'], ['it'], ['leadership', 'it'], []]) {
      const u = user(...roles)
      const viaPrimary = allowed.includes(getStaffRole(u) as never)
      const viaAny = hasStaffRole(u, allowed)
      const requireStaffWouldPass = getStaffRoles(u).some(r => (allowed as readonly string[]).includes(r))
      expect(viaAny).toBe(requireStaffWouldPass)
      if (viaPrimary) expect(viaAny).toBe(true)
    }
  })
})

describe('leadership-only call sites stay correct without change', () => {
  it("'leadership' is ROLE_PRIORITY[0], so holding it always makes it primary", () => {
    for (const extra of ['ae', 'bd', 'anr', 'it', 'legal', 'tms', 'accounting', 'marketing']) {
      expect(getStaffRole(user('leadership', extra))).toBe('leadership')
      expect(getStaffRole(user(extra, 'leadership'))).toBe('leadership')
    }
  })

  it('so the ~15 `getStaffRole(user) !== \'leadership\'` guards cannot misfire today', () => {
    expect(getStaffRole(user('leadership', 'it')) !== 'leadership').toBe(false)
    expect(getStaffRole(user('ae', 'bd')) !== 'leadership').toBe(true)
  })
})
