import { resolveHandleGate, shouldGateForHandle } from '@/lib/handles/gate'

// ─── Fixtures ─────────────────────────────────────────────────────────────
// Typed identities at the top, explicit per-identity assertions below —
// the shape lib/admin/gate.test.ts uses. These are written as realistic
// identities rather than bare ids so the test READS as the account model it
// is defending (docs/architecture/ACCOUNT-TYPES.md).

type Identity = {
  id: string
  app_metadata?: { role?: string; staff_roles?: string[] }
}

// A Team Member. Identified by app_metadata.staff_roles + a funun_staff row;
// handle_new_user() never gives this account a user_profiles row, so every
// profile lookup for it resolves to null.
const STAFF: Identity = { id: 'staff-1', app_metadata: { staff_roles: ['ae'] } }

// A Client Partner (buyer). handle_new_user() returns early for
// app_metadata.role = 'buyer' BEFORE any profile insert — no profile row.
const BUYER: Identity = { id: 'buyer-1', app_metadata: { role: 'buyer' } }

// An Artist — a User Account, the only kind that owns a user_profiles row.
const USER_ACCOUNT: Identity = { id: 'u1', app_metadata: {} }

const noProfile = async () => null

describe('lib/handles/gate shouldGateForHandle', () => {
  it('is false with no session — nothing to ask and nobody to ask it of', () => {
    expect(shouldGateForHandle({ user: null, profile: null })).toBe(false)
  })

  // ─── The two load-bearing cases (D-10c) ─────────────────────────────────
  // An artist account passes EVERY version of this function, including the
  // broken `!!user` one. Only these two cases distinguish the correct gate
  // from the one that locks staff out of the admin console and buyers out of
  // the catalogue, so they are the only cases here that actually prove
  // anything.
  it('is false for a Team Member — a staff identity has no user_profiles row', () => {
    expect(shouldGateForHandle({ user: STAFF, profile: null })).toBe(false)
  })

  it('is false for a Client Partner — a buyer identity has no user_profiles row', () => {
    expect(shouldGateForHandle({ user: BUYER, profile: null })).toBe(false)
  })

  it('is false for a User Account that already has a handle', () => {
    expect(shouldGateForHandle({ user: USER_ACCOUNT, profile: { handle: 'maya-reyes' } })).toBe(
      false
    )
  })

  it('is true for a User Account with a profile row and a null handle', () => {
    expect(shouldGateForHandle({ user: USER_ACCOUNT, profile: { handle: null } })).toBe(true)
  })

  it('is true for an empty-string handle — an empty column is not a handle', () => {
    expect(shouldGateForHandle({ user: USER_ACCOUNT, profile: { handle: '' } })).toBe(true)
  })

  it('is true for a whitespace-only handle — a blank handle is not a handle', () => {
    expect(shouldGateForHandle({ user: USER_ACCOUNT, profile: { handle: '   ' } })).toBe(true)
  })
})

describe('lib/handles/gate resolveHandleGate', () => {
  // The injected renderGate callback is the point. Asserting `false` proves
  // the boolean is right; asserting the callback was NEVER CALLED proves the
  // blocking screen is never even constructed for these identities — the
  // same machine-verified shape lib/admin/gate.test.ts uses to prove a
  // leadership-only loader is never invoked for ae/bd.

  it('never calls renderGate for a Team Member, and returns null', async () => {
    const renderGate = jest.fn(() => 'GATE')
    const result = await resolveHandleGate({ user: STAFF, loadProfile: noProfile, renderGate })
    expect(renderGate).not.toHaveBeenCalled()
    expect(result).toBe(null)
  })

  // This case is a REACHABLE path, not defence in depth. middleware.ts's
  // isProtected check tests only `!user` — it never checks role — so a
  // signed-in Client Partner navigating directly to /vault DOES render
  // app/(artist)/layout.tsx. The route group is not a wall; the absent
  // profile row is what protects them (D-10a CORRECTION, D-10b).
  it('never calls renderGate for a Client Partner, and returns null', async () => {
    const renderGate = jest.fn(() => 'GATE')
    const result = await resolveHandleGate({ user: BUYER, loadProfile: noProfile, renderGate })
    expect(renderGate).not.toHaveBeenCalled()
    expect(result).toBe(null)
  })

  it('never calls renderGate for a User Account that already has a handle', async () => {
    const renderGate = jest.fn(() => 'GATE')
    const result = await resolveHandleGate({
      user: USER_ACCOUNT,
      loadProfile: async () => ({ handle: 'maya-reyes' }),
      renderGate,
    })
    expect(renderGate).not.toHaveBeenCalled()
    expect(result).toBe(null)
  })

  it('calls renderGate exactly once with the user id for a handle-less User Account', async () => {
    const renderGate = jest.fn(() => 'GATE')
    const result = await resolveHandleGate({
      user: USER_ACCOUNT,
      loadProfile: async () => ({ handle: null }),
      renderGate,
    })
    expect(renderGate).toHaveBeenCalledTimes(1)
    expect(renderGate).toHaveBeenCalledWith('u1')
    expect(result).toBe('GATE')
  })

  it('short-circuits with no session — neither loadProfile nor renderGate runs', async () => {
    const loadProfile = jest.fn(noProfile)
    const renderGate = jest.fn(() => 'GATE')
    const result = await resolveHandleGate({ user: null, loadProfile, renderGate })
    expect(loadProfile).not.toHaveBeenCalled()
    expect(renderGate).not.toHaveBeenCalled()
    expect(result).toBe(null)
  })

  it('passes the signed-in user id to loadProfile', async () => {
    const loadProfile = jest.fn(async () => ({ handle: null }))
    await resolveHandleGate({
      user: USER_ACCOUNT,
      loadProfile,
      renderGate: () => 'GATE',
    })
    expect(loadProfile).toHaveBeenCalledWith('u1')
  })
})
