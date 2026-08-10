// Bug-1 reconciliation for createBuyerAccount: handle_new_user cannot see
// app_metadata.role='buyer' at INSERT time in this Supabase instance, so it runs
// the default artist branch and creates a phantom user_profiles + subscriptions
// row. createBuyerAccount must delete those (buyers are a separate account type
// with NO profile — migration 080's intent).

import { createBuyerAccount } from '@/lib/buyers/createBuyerAccount'

const mockCreateUser = jest.fn()
const mockGenerateLink = jest.fn()
const mockSubsDeleteEq = jest.fn().mockResolvedValue({ error: null })
const mockSubsDelete = jest.fn(() => ({ eq: mockSubsDeleteEq }))
const mockProfilesDeleteEq = jest.fn().mockResolvedValue({ error: null })
const mockProfilesDelete = jest.fn(() => ({ eq: mockProfilesDeleteEq }))
const mockMembersInsert = jest.fn().mockResolvedValue({ error: null })
// account_provision_intents (migration 104): createUserWithProvisionIntent
// writes a row before createUser() and clears it after.
const mockIntentInsert = jest.fn().mockResolvedValue({ error: null })
const mockIntentDeleteEq = jest.fn().mockResolvedValue({ error: null })
const mockIntentDelete = jest.fn(() => ({ eq: mockIntentDeleteEq }))

const mockFrom = jest.fn((table: string) => {
  if (table === 'subscriptions') return { delete: mockSubsDelete }
  if (table === 'user_profiles') return { delete: mockProfilesDelete }
  if (table === 'buyer_members') return { insert: mockMembersInsert }
  if (table === 'account_provision_intents')
    return { insert: mockIntentInsert, delete: mockIntentDelete }
  return {}
})

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    auth: { admin: { createUser: mockCreateUser, generateLink: mockGenerateLink } },
    from: mockFrom,
  }),
}))
jest.mock('@/lib/email', () => ({ sendEmail: jest.fn().mockResolvedValue({ ok: true }) }))
jest.mock('@/lib/email/buyerInvite', () => ({ buyerInviteEmail: () => ({ subject: 's', html: 'h' }) }))

beforeEach(() => {
  jest.clearAllMocks()
})

describe('createBuyerAccount — Bug-1 phantom-profile reconciliation', () => {
  it('deletes the phantom subscriptions + user_profiles rows the artist-fallback trigger created', async () => {
    mockCreateUser.mockResolvedValueOnce({ data: { user: { id: 'b1' } }, error: null })
    mockGenerateLink.mockResolvedValueOnce({
      data: { properties: { action_link: 'http://x' } },
      error: null,
    })

    const input: Parameters<typeof createBuyerAccount>[0] = {
      email: 'buyer@example.com',
      displayName: 'Buyer Co',
      orgId: 'org1',
      buyerRole: 'requester',
      isOrgAdmin: false,
    }
    const result = await createBuyerAccount(input)

    expect(result).toEqual({ userId: 'b1', emailSent: true })

    // the fix: both phantom rows removed, keyed on the new user id
    expect(mockSubsDelete).toHaveBeenCalled()
    expect(mockSubsDeleteEq).toHaveBeenCalledWith('user_id', 'b1')
    expect(mockProfilesDelete).toHaveBeenCalled()
    expect(mockProfilesDeleteEq).toHaveBeenCalledWith('id', 'b1')

    // and it still creates the buyer_members row (unchanged behavior)
    expect(mockMembersInsert).toHaveBeenCalled()

    // migration 104: a single-use intent row (client-generated id + lower-cased
    // email) is written so the gate exempts this buyer, then cleared by that id.
    expect(mockIntentInsert).toHaveBeenCalledWith({
      id: expect.any(String),
      email: 'buyer@example.com',
    })
    expect(mockIntentDeleteEq).toHaveBeenCalledWith('id', expect.any(String))
  })
})
