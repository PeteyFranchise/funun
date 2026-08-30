import {
  WORK_TIER_VALUES,
  canContribute,
  canAdminister,
  canManageMembership,
  canOpenMoneyOrReleaseDoors,
} from '@/lib/catalogue/membership'

// ─── The two-tier capability matrix (doctrine scope item 9) ──────────
// | Tier        | Contribute | Administer | Manage membership | Money/release doors |
// |-------------|:---:|:---:|:---:|:---:|
// | contribute  | ✓ | ✗ | ✗ | ✗ |
// | administer  | ✓ | ✓ | ✓ | ✓ |

describe('lib/catalogue/membership', () => {
  it('WORK_TIER_VALUES resolves to exactly the two strings migration 136 CHECKs, in that order', () => {
    expect(WORK_TIER_VALUES).toEqual(['contribute', 'administer'])
  })

  it('canContribute is true for both tiers', () => {
    for (const tier of WORK_TIER_VALUES) {
      expect(canContribute(tier)).toBe(true)
    }
  })

  it('canContribute is false for an unrecognized value, and never throws', () => {
    const bogus = 'owner' as unknown as (typeof WORK_TIER_VALUES)[number]
    expect(() => canContribute(bogus)).not.toThrow()
    expect(canContribute(bogus)).toBe(false)
  })

  it('canAdminister is true only for the administer tier', () => {
    expect(canAdminister('administer')).toBe(true)
    expect(canAdminister('contribute')).toBe(false)
  })

  it('canAdminister is false for an unrecognized value', () => {
    const bogus = 'superadmin' as unknown as (typeof WORK_TIER_VALUES)[number]
    expect(canAdminister(bogus)).toBe(false)
  })

  it('canManageMembership is true for the administer tier and false for contribute-tier non-owners', () => {
    expect(canManageMembership('administer', false)).toBe(true)
    expect(canManageMembership('contribute', false)).toBe(false)
  })

  it('canManageMembership is true for the owner regardless of tier', () => {
    expect(canManageMembership('contribute', true)).toBe(true)
    expect(canManageMembership('administer', true)).toBe(true)
  })

  it('canManageMembership is false for an unrecognized tier and a non-owner', () => {
    const bogus = 'viewer' as unknown as (typeof WORK_TIER_VALUES)[number]
    expect(canManageMembership(bogus, false)).toBe(false)
  })

  it('canOpenMoneyOrReleaseDoors — the 37.2 seam — is true only for administer tier or owner', () => {
    expect(canOpenMoneyOrReleaseDoors('administer', false)).toBe(true)
    expect(canOpenMoneyOrReleaseDoors('contribute', true)).toBe(true)
    expect(canOpenMoneyOrReleaseDoors('contribute', false)).toBe(false)
  })

  it('canOpenMoneyOrReleaseDoors is false for an unrecognized tier and a non-owner', () => {
    const bogus = 'guest' as unknown as (typeof WORK_TIER_VALUES)[number]
    expect(canOpenMoneyOrReleaseDoors(bogus, false)).toBe(false)
  })
})
