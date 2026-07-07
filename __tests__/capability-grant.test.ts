// Tests for grantCapability() / requestCapability() — the capability_grants
// write path (D-01/D-02/D-10). Pure unit tests mocking the Supabase service
// client; mirrors the mock/import style of schema-stems-instrumental.test.ts.

import { mapSlugsToProfileRoles } from '@/lib/industry/roleMapping'
import {
  grantCapability,
  requestCapability,
  DuplicateCapabilityRequestError,
} from '@/lib/capabilities/grant'

// ─── Mock @/lib/supabase/server's createServiceClient ──────────────────────
// .from('capability_grants').insert(...).select('id').single() chain, and a
// separate .from('artist_profiles').update(...).eq(...) chain for the D-10
// badge auto-attach write.
const mockSingle = jest.fn()
const mockSelect = jest.fn(() => ({ single: mockSingle }))
const mockInsert = jest.fn(() => ({ select: mockSelect }))
const mockEq = jest.fn(() => Promise.resolve({ error: null }))
const mockUpdate = jest.fn(() => ({ eq: mockEq }))

const mockFrom = jest.fn((table: string) => {
  if (table === 'capability_grants') return { insert: mockInsert }
  if (table === 'artist_profiles') return { update: mockUpdate }
  throw new Error(`Unexpected table in mock: ${table}`)
})

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}))

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── grantCapability ────────────────────────────────────────────────────────

describe('grantCapability', () => {
  it('inserts a row with status=approved, the given capability, role_slugs, and source; returns { grantId }', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'g1' }, error: null })

    const result = await grantCapability({
      profileId: 'p1',
      capability: 'industry',
      roleSlugs: ['music_supervisor'],
      source: 'admin_approved',
    })

    expect(result).toEqual({ grantId: 'g1' })
    expect(mockFrom).toHaveBeenCalledWith('capability_grants')
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        profile_id: 'p1',
        capability: 'industry',
        status: 'approved',
        role_slugs: ['music_supervisor'],
        source: 'admin_approved',
      })
    )
  })

  it('writes artist_profiles.roles via mapSlugsToProfileRoles(roleSlugs) (D-10 badge auto-attach)', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'g1' }, error: null })

    await grantCapability({
      profileId: 'p1',
      capability: 'industry',
      roleSlugs: ['music_supervisor'],
      source: 'admin_approved',
    })

    expect(mockFrom).toHaveBeenCalledWith('artist_profiles')
    expect(mockUpdate).toHaveBeenCalledWith({
      roles: mapSlugsToProfileRoles(['music_supervisor']),
    })
    expect(mockEq).toHaveBeenCalledWith('id', 'p1')
  })

  it('surfaces a DuplicateCapabilityRequestError when the service insert returns a Postgres unique-violation (23505)', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    })

    await expect(
      grantCapability({
        profileId: 'p1',
        capability: 'artist',
        roleSlugs: [],
        source: 'self_serve_instant',
      })
    ).rejects.toThrow(DuplicateCapabilityRequestError)
  })

  it('throws a descriptive Error for any other insert failure', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: '500', message: 'connection reset' },
    })

    await expect(
      grantCapability({
        profileId: 'p1',
        capability: 'artist',
        roleSlugs: [],
        source: 'self_serve_instant',
      })
    ).rejects.toThrow(/Failed to grant capability/)
  })
})

// ─── requestCapability ──────────────────────────────────────────────────────

describe('requestCapability', () => {
  describe('instant grant', () => {
    it('with capability="artist" inserts status=approved immediately (D-02 instant path)', async () => {
      mockSingle.mockResolvedValueOnce({ data: { id: 'g2' }, error: null })

      const result = await requestCapability({
        profileId: 'p1',
        capability: 'artist',
        roleSlugs: ['recording_artist'],
      })

      expect(result).toEqual({ grantId: 'g2', status: 'approved' })
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'approved', capability: 'artist' })
      )
      // D-02 instant path still goes through the badge auto-attach.
      expect(mockFrom).toHaveBeenCalledWith('artist_profiles')
    })
  })

  describe('pending request', () => {
    it('with capability="industry" inserts status=pending (D-02 review path)', async () => {
      mockSingle.mockResolvedValueOnce({ data: { id: 'g3' }, error: null })

      const result = await requestCapability({
        profileId: 'p1',
        capability: 'industry',
        roleSlugs: ['music_supervisor'],
      })

      expect(result).toEqual({ grantId: 'g3', status: 'pending' })
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending', capability: 'industry' })
      )
      // No badge write yet for the pending path — it attaches at approval time.
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('surfaces DuplicateCapabilityRequestError when a pending request already exists (23505)', async () => {
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      })

      await expect(
        requestCapability({
          profileId: 'p1',
          capability: 'industry',
          roleSlugs: ['music_supervisor'],
        })
      ).rejects.toThrow(DuplicateCapabilityRequestError)
    })
  })
})
