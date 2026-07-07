// Tests for capability route guards (Plan 15-02):
//   1. D-14 boundary: hasCapability() 'pending'-only-returns-false (route-level
//      403 is a Manual-Only verification per 15-VALIDATION.md, recorded below)
//   2. isValidCapability guard used by the request route (shape coverage)
//
// Manual-only verification (route-level 403):
//   As an artist-only account, POST /api/antenna/opportunities should return 403
//   now that the hasCapability(user.id, 'industry') check is in place (D-14).
//   This cannot be cleanly unit-tested without a full Next.js request harness;
//   it is listed in the 15-02-SUMMARY.md Manual-Only table per 15-VALIDATION.md.

import { hasCapability, isValidCapability } from '@/lib/capabilities/check'

// ─── Mock @/lib/supabase/server's createServiceClient ──────────────────────
const mockMaybySingle = jest.fn()
const mockEqStatus = jest.fn(() => ({ maybeSingle: mockMaybySingle }))
const mockEqCapability = jest.fn(() => ({ eq: mockEqStatus }))
const mockEqProfile = jest.fn(() => ({ eq: mockEqCapability }))
const mockSelect = jest.fn(() => ({ eq: mockEqProfile }))
const mockFrom = jest.fn(() => ({ select: mockSelect }))

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}))

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── D-14 boundary: pending-only returns false ────────────────────────────
// This is the critical invariant that the route-level 403 depends on —
// a 'pending' grant must never pass the hasCapability() check.
describe('D-14 boundary: hasCapability and the pending-only case', () => {
  it('returns false when the only grant row has status="pending" (query returns null because it filters on approved)', async () => {
    // The SQL query adds `.eq('status', 'approved')`, so a pending row
    // doesn't match — maybeSingle returns { data: null }.
    mockMaybySingle.mockResolvedValueOnce({ data: null, error: null })

    const result = await hasCapability('user-123', 'industry')

    expect(result).toBe(false)
    expect(mockEqStatus).toHaveBeenCalledWith('status', 'approved')
  })

  it('returns false when no grant row exists at all', async () => {
    mockMaybySingle.mockResolvedValueOnce({ data: null, error: null })

    const result = await hasCapability('user-123', 'industry')

    expect(result).toBe(false)
  })

  it('returns true when an approved grant exists — route proceeds', async () => {
    mockMaybySingle.mockResolvedValueOnce({ data: { id: 'g-approved' }, error: null })

    const result = await hasCapability('user-123', 'industry')

    expect(result).toBe(true)
  })

  it('checks the correct profile_id and capability values', async () => {
    mockMaybySingle.mockResolvedValueOnce({ data: { id: 'g1' }, error: null })

    await hasCapability('profile-abc', 'industry')

    expect(mockFrom).toHaveBeenCalledWith('capability_grants')
    expect(mockSelect).toHaveBeenCalledWith('id')
    expect(mockEqProfile).toHaveBeenCalledWith('profile_id', 'profile-abc')
    expect(mockEqCapability).toHaveBeenCalledWith('capability', 'industry')
    expect(mockEqStatus).toHaveBeenCalledWith('status', 'approved')
  })
})

// ─── isValidCapability guard (request route shape coverage) ───────────────
// The request route validates the body `capability` field before delegating
// to requestCapability(). These tests confirm the guard rejects invalid input.
describe('isValidCapability (request route input guard)', () => {
  it('accepts "artist" — a valid capability for self-serve requests', () => {
    expect(isValidCapability('artist')).toBe(true)
  })

  it('accepts "industry" — a valid capability for self-serve requests', () => {
    expect(isValidCapability('industry')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isValidCapability('')).toBe(false)
  })

  it('rejects null', () => {
    expect(isValidCapability(null)).toBe(false)
  })

  it('rejects undefined', () => {
    expect(isValidCapability(undefined)).toBe(false)
  })

  it('rejects a number', () => {
    expect(isValidCapability(42)).toBe(false)
  })

  it('rejects an unrecognised string', () => {
    expect(isValidCapability('curator')).toBe(false)
    expect(isValidCapability('admin')).toBe(false)
  })
})
