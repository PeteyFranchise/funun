// Unit tests for the INDUSTRY-06 member_type <-> capability_grants lockstep
// sync: an approved 'industry' grantCapability() call must also set
// user_profiles.member_type='industry' (closing the drift documented in
// 28-RESEARCH.md Summary #3 / Pitfall 2), while an 'artist' grant must NOT
// touch member_type at all (T-28-01-03 — only an approved industry grant
// may flip the account lane).
//
// Mirrors the mock-Supabase-client shape from __tests__/capability-grant.test.ts.

import { grantCapability } from '@/lib/capabilities/grant'

const mockSingle = jest.fn()
const mockSelect = jest.fn(() => ({ single: mockSingle }))
const mockInsert = jest.fn(() => ({ select: mockSelect }))
const mockEq = jest.fn(() => Promise.resolve({ error: null }))
const mockUpdate = jest.fn((_payload: Record<string, unknown>) => ({ eq: mockEq }))

const mockFrom = jest.fn((table: string) => {
  if (table === 'capability_grants') return { insert: mockInsert }
  if (table === 'user_profiles') return { update: mockUpdate }
  throw new Error(`Unexpected table in mock: ${table}`)
})

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}))

beforeEach(() => {
  jest.clearAllMocks()
})

describe('grantCapability member_type sync (INDUSTRY-06)', () => {
  it('an industry grant issues a user_profiles update whose payload includes member_type="industry"', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'g1' }, error: null })

    await grantCapability({
      profileId: 'p1',
      capability: 'industry',
      roleSlugs: ['music_supervisor'],
      source: 'admin_approved',
    })

    expect(mockFrom).toHaveBeenCalledWith('user_profiles')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ member_type: 'industry' })
    )
    expect(mockEq).toHaveBeenCalledWith('id', 'p1')
  })

  it('an artist grant issues a user_profiles update whose payload does NOT include a member_type key', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'g2' }, error: null })

    await grantCapability({
      profileId: 'p1',
      capability: 'artist',
      roleSlugs: ['recording_artist'],
      source: 'self_serve_instant',
    })

    expect(mockFrom).toHaveBeenCalledWith('user_profiles')
    const updatePayload = mockUpdate.mock.calls[0][0]
    expect(updatePayload).not.toHaveProperty('member_type')
  })
})
