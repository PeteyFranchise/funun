// Tests for provisionIndustryAccount() — the shared, email-free account-
// creation primitive extracted from createIndustryMember() (INDUSTRY-04).
// Mirrors the mock/import style of capability-grant.test.ts.

import { sendEmail } from '@/lib/email'
import { mapSlugsToProfileRoles } from '@/lib/industry/roleMapping'
import { provisionIndustryAccount, DuplicateIndustryMemberError } from '@/lib/industry/createIndustryMember'

// ─── Mock @/lib/supabase/server's createServiceClient ──────────────────────
// The primitive uses createUser + a post-create reconciliation (Bug-1 fix):
// user_profiles.update() + a guarded capability_grants insert.
const mockCreateUser = jest.fn()
const mockProfilesUpdateEq = jest.fn().mockResolvedValue({ error: null })
const mockProfilesUpdate = jest.fn(() => ({ eq: mockProfilesUpdateEq }))
const mockGrantsMaybeSingle = jest.fn().mockResolvedValue({ data: null })
const mockGrantsInsert = jest.fn().mockResolvedValue({ error: null })
const mockGrantsSelect = jest.fn(() => {
  const chain: { eq: jest.Mock; maybeSingle: jest.Mock } = {
    eq: jest.fn(() => chain),
    maybeSingle: mockGrantsMaybeSingle,
  }
  return chain
})
// account_provision_intents (migration 104): createUserWithProvisionIntent
// writes a row before createUser() and clears it after.
const mockIntentInsert = jest.fn().mockResolvedValue({ error: null })
const mockIntentDeleteEq = jest.fn().mockResolvedValue({ error: null })
const mockIntentDelete = jest.fn(() => ({ eq: mockIntentDeleteEq }))
const mockFrom = jest.fn((table: string) => {
  if (table === 'user_profiles') return { update: mockProfilesUpdate }
  if (table === 'capability_grants') return { select: mockGrantsSelect, insert: mockGrantsInsert }
  if (table === 'account_provision_intents')
    return { insert: mockIntentInsert, delete: mockIntentDelete }
  return {}
})

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ auth: { admin: { createUser: mockCreateUser } }, from: mockFrom }),
}))

jest.mock('@/lib/email', () => ({ sendEmail: jest.fn() }))

beforeEach(() => {
  jest.clearAllMocks()
})

describe('provisionIndustryAccount', () => {
  it('creates the account with app_metadata.role=industry and the expected user_metadata, returns { userId }, sends no email', async () => {
    mockCreateUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null })

    const result = await provisionIndustryAccount({
      email: 'curator@example.com',
      displayName: 'Nova Curator',
      roleSlugs: ['playlist_curator'],
    })

    expect(result).toEqual({ userId: 'u1' })
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'curator@example.com',
        email_confirm: true,
        app_metadata: { role: 'industry' },
        user_metadata: expect.objectContaining({
          display_name: 'Nova Curator',
          role_badges: ['playlist_curator'],
          profile_roles: mapSlugsToProfileRoles(['playlist_curator']),
        }),
      })
    )
    expect(sendEmail).not.toHaveBeenCalled()

    // Bug-1 reconciliation: handle_new_user's artist fallback is corrected here
    // (the trigger can't see app_metadata.role at INSERT time in this instance).
    expect(mockProfilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        member_type: 'industry',
        artist_name: 'Nova Curator',
        industry_roles: ['playlist_curator'],
      })
    )
    expect(mockProfilesUpdateEq).toHaveBeenCalledWith('id', 'u1')
    expect(mockGrantsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        profile_id: 'u1',
        capability: 'industry',
        status: 'approved',
        source: 'signup',
      })
    )
  })

  it('does NOT double-insert the industry grant when an approved one already exists (idempotent)', async () => {
    mockCreateUser.mockResolvedValueOnce({ data: { user: { id: 'u2' } }, error: null })
    mockGrantsMaybeSingle.mockResolvedValueOnce({ data: { id: 'existing-grant' } })

    await provisionIndustryAccount({
      email: 'existing@example.com',
      displayName: 'Existing',
      roleSlugs: ['publisher'],
    })

    expect(mockProfilesUpdate).toHaveBeenCalled()
    expect(mockGrantsInsert).not.toHaveBeenCalled()
  })

  it('surfaces DuplicateIndustryMemberError when createUser fails with code email_exists', async () => {
    mockCreateUser.mockResolvedValueOnce({
      data: null,
      error: { code: 'email_exists', message: 'This email has already been invited.' },
    })

    await expect(
      provisionIndustryAccount({
        email: 'dup@example.com',
        displayName: 'Dup Curator',
        roleSlugs: ['playlist_curator'],
      })
    ).rejects.toThrow(DuplicateIndustryMemberError)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('surfaces DuplicateIndustryMemberError when createUser fails with status 422', async () => {
    mockCreateUser.mockResolvedValueOnce({
      data: null,
      error: { status: 422, message: 'duplicate' },
    })

    await expect(
      provisionIndustryAccount({
        email: 'dup2@example.com',
        displayName: 'Dup2 Curator',
        roleSlugs: ['playlist_curator'],
      })
    ).rejects.toThrow(DuplicateIndustryMemberError)
  })

  it('throws a generic Error (not DuplicateIndustryMemberError) for a transient createUser failure', async () => {
    mockCreateUser.mockResolvedValueOnce({
      data: null,
      error: { code: 'unexpected_failure', message: 'network reset' },
    })

    await expect(
      provisionIndustryAccount({
        email: 'transient@example.com',
        displayName: 'Transient',
        roleSlugs: ['playlist_curator'],
      })
    ).rejects.toThrow(/Failed to create industry member/)
  })
})
