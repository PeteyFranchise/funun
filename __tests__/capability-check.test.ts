// Tests for hasCapability() / isValidCapability() — the capability_grants
// read path (D-14). Pure unit tests mocking the Supabase service client.

import { hasCapability, isValidCapability } from '@/lib/capabilities/check'

// ─── Mock @/lib/supabase/server's createServiceClient ──────────────────────
// .from('capability_grants').select('id').eq('profile_id', ...).eq('capability', ...)
// .eq('status', 'approved').maybeSingle() chain.
const mockMaybeSingle = jest.fn()
const mockEqStatus = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
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

// ─── hasCapability ──────────────────────────────────────────────────────────

describe('hasCapability', () => {
  it('returns true when an approved grant row exists for (profileId, capability)', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'g1' }, error: null })

    const result = await hasCapability('p1', 'industry')

    expect(result).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('capability_grants')
    expect(mockSelect).toHaveBeenCalledWith('id')
    expect(mockEqProfile).toHaveBeenCalledWith('profile_id', 'p1')
    expect(mockEqCapability).toHaveBeenCalledWith('capability', 'industry')
    expect(mockEqStatus).toHaveBeenCalledWith('status', 'approved')
  })

  it('returns false when the only grant row is "pending"', async () => {
    // The query itself filters on status='approved', so a pending-only
    // state surfaces as no matching row (data: null) at this layer.
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const result = await hasCapability('p1', 'industry')

    expect(result).toBe(false)
  })

  it('returns false when the only grant row is "denied"', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const result = await hasCapability('p1', 'industry')

    expect(result).toBe(false)
  })

  it('returns false when no grant row is absent', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const result = await hasCapability('p1', 'artist')

    expect(result).toBe(false)
  })
})

// ─── isValidCapability ───────────────────────────────────────────────────────

describe('isValidCapability', () => {
  it('returns true for "artist"', () => {
    expect(isValidCapability('artist')).toBe(true)
  })

  it('returns true for "industry"', () => {
    expect(isValidCapability('industry')).toBe(true)
  })

  it('returns false for any other value', () => {
    expect(isValidCapability('curator')).toBe(false)
    expect(isValidCapability('')).toBe(false)
    expect(isValidCapability(null)).toBe(false)
    expect(isValidCapability(undefined)).toBe(false)
    expect(isValidCapability(123)).toBe(false)
  })
})
