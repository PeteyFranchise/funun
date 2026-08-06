// Tests for provisionIndustryAccount() — the shared, email-free account-
// creation primitive extracted from createIndustryMember() (INDUSTRY-04).
// Mirrors the mock/import style of capability-grant.test.ts.

import { sendEmail } from '@/lib/email'
import { mapSlugsToProfileRoles } from '@/lib/industry/roleMapping'
import { provisionIndustryAccount, DuplicateIndustryMemberError } from '@/lib/industry/createIndustryMember'

// ─── Mock @/lib/supabase/server's createServiceClient ──────────────────────
// Only service.auth.admin.createUser is exercised by the primitive — no
// generateLink, no table access.
const mockCreateUser = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ auth: { admin: { createUser: mockCreateUser } } }),
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
