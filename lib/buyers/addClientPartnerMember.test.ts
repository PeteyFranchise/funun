import { sendEmail } from '@/lib/email'
import {
  addClientPartnerMember,
  IncompatibleClientPartnerIdentityError,
} from './addClientPartnerMember'
import { createBuyerAccount, DuplicateBuyerAccountError } from './createBuyerAccount'

jest.mock('@/lib/email', () => ({ sendEmail: jest.fn() }))
jest.mock('./createBuyerAccount', () => ({
  createBuyerAccount: jest.fn(),
  DuplicateBuyerAccountError: class DuplicateBuyerAccountError extends Error {},
}))

const BASE = {
  email: 'member@example.com',
  displayName: 'Jordan Lee',
  organizationName: 'Netflix Music',
  orgId: 'org-1',
  buyerRole: 'requester' as const,
  isOrgAdmin: false,
  invitedBy: 'staff-1',
}

function mockService(input: {
  existingUserId?: string | null
  existingMembership?: { id: string; org_id: string } | null
  staffIdentity?: { id: string } | null
  insertError?: { message: string } | null
} = {}) {
  const rpc = jest.fn().mockResolvedValue({ data: input.existingUserId ?? null, error: null })
  const insert = jest.fn().mockResolvedValue({ error: input.insertError ?? null })
  const membershipMaybeSingle = jest
    .fn()
    .mockResolvedValue({ data: input.existingMembership ?? null, error: null })
  const staffMaybeSingle = jest
    .fn()
    .mockResolvedValue({ data: input.staffIdentity ?? null, error: null })
  const from = jest.fn((table: string) => {
    if (table === 'funun_staff') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({ maybeSingle: staffMaybeSingle })),
        })),
      }
    }
    return {
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ limit: jest.fn(() => ({ maybeSingle: membershipMaybeSingle })) })),
      })),
      insert,
    }
  })
  return { rpc, from, insert }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(sendEmail as jest.Mock).mockResolvedValue({ ok: true })
})

describe('addClientPartnerMember', () => {
  it('attaches an existing Member identity without provisioning or deleting its profile', async () => {
    const service = mockService({ existingUserId: 'member-1' })

    const result = await addClientPartnerMember({ ...BASE, service: service as never })

    expect(result).toEqual({ userId: 'member-1', emailSent: true, existingAccount: true })
    expect(service.insert).toHaveBeenCalledWith({
      org_id: 'org-1',
      user_id: 'member-1',
      buyer_role: 'requester',
      is_org_admin: false,
      invited_by: 'staff-1',
    })
    expect(createBuyerAccount).not.toHaveBeenCalled()
  })

  it('uses the established buyer provisioning flow for a new identity', async () => {
    const service = mockService({ existingUserId: null })
    ;(createBuyerAccount as jest.Mock).mockResolvedValue({ userId: 'buyer-1', emailSent: true })

    await expect(addClientPartnerMember({ ...BASE, service: service as never })).resolves.toEqual({
      userId: 'buyer-1',
      emailSent: true,
      existingAccount: false,
    })
  })

  it('refuses a second Client Partner membership until active-org switching is implemented', async () => {
    const service = mockService({
      existingUserId: 'member-1',
      existingMembership: { id: 'membership-1', org_id: 'org-2' },
    })

    await expect(
      addClientPartnerMember({ ...BASE, service: service as never })
    ).rejects.toBeInstanceOf(DuplicateBuyerAccountError)
    expect(service.insert).not.toHaveBeenCalled()
  })

  it('never attaches a privileged Funūn Team Member identity', async () => {
    const service = mockService({
      existingUserId: 'staff-1',
      staffIdentity: { id: 'staff-row-1' },
    })

    await expect(
      addClientPartnerMember({ ...BASE, service: service as never })
    ).rejects.toBeInstanceOf(IncompatibleClientPartnerIdentityError)
    expect(service.insert).not.toHaveBeenCalled()
  })
})
