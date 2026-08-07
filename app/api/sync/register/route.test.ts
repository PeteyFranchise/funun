import { createServiceClient } from '@/lib/supabase/server'
import { createBuyerAccount, DuplicateBuyerAccountError } from '@/lib/buyers/createBuyerAccount'
import { resolveLeadershipFallback } from '@/lib/staff/leadershipFallback'
import { createNotification } from '@/lib/notifications'
import { POST } from './route'

// ─── POST /api/sync/register (23-04 Task 3) ────────────────────────────────
// Integration test with a mocked service client + mocked createBuyerAccount,
// mirroring __tests__/staff-buyer-orgs-api.test.ts's admin-route
// conventions. Covers: 201 + correct insert shape, best-effort lead
// routing, 400 on invalid payload, neutral response on duplicate email
// (account-enumeration avoidance), and 429 over the rate limit.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/buyers/createBuyerAccount', () => ({
  createBuyerAccount: jest.fn(),
  DuplicateBuyerAccountError: class DuplicateBuyerAccountError extends Error {},
}))

jest.mock('@/lib/staff/leadershipFallback', () => ({
  resolveLeadershipFallback: jest.fn(),
}))

jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(),
}))

const ORG_UUID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const NEW_USER_UUID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const LEADERSHIP_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://t.local/api/sync/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    company: 'Acme Ad Agency',
    contactName: 'Jamie Rivera',
    email: 'jamie.rivera@acme.test',
    phone: '555-123-4567',
    role: 'Marketing Director',
    useCase: 'agency',
    ...overrides,
  }
}

function mockService(options: { orgInsertError?: { message: string } | null } = {}) {
  const { orgInsertError = null } = options
  const insertSpy = jest.fn((row: Record<string, unknown>) => ({
    select: jest.fn(() => ({
      single: jest.fn(async () => ({
        data: orgInsertError ? null : { id: ORG_UUID, name: row.name, ae_user_id: null },
        error: orgInsertError,
      })),
    })),
  }))
  const from = jest.fn((table: string) => {
    if (table === 'buyer_orgs') return { insert: insertSpy }
    return {}
  })
  const getUserById = jest.fn(async () => ({ data: { user: { email: 'leader@funun.studio' } } }))
  return { from, insertSpy, auth: { admin: { getUserById } } }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(resolveLeadershipFallback as jest.Mock).mockResolvedValue(LEADERSHIP_UUID)
  ;(createNotification as jest.Mock).mockResolvedValue({ ok: true })
})

describe('POST /api/sync/register', () => {
  it('creates a pending_onboarding buyer_orgs row + approver/org-admin member, routes the lead, returns 201', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(createBuyerAccount as jest.Mock).mockResolvedValue({ userId: NEW_USER_UUID, emailSent: true })

    const res = await POST(jsonRequest(validBody(), { 'x-forwarded-for': '1.1.1.1' }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.orgId).toBe(ORG_UUID)
    expect(body.data.userId).toBe(NEW_USER_UUID)
    expect(body.emailSent).toBe(true)

    expect(service.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Acme Ad Agency',
        status: 'pending_onboarding',
        use_case: 'agency',
        contact_name: 'Jamie Rivera',
        contact_email: 'jamie.rivera@acme.test',
        contact_phone: '555-123-4567',
        contact_role: 'Marketing Director',
        source: 'register',
      })
    )

    expect(createBuyerAccount).toHaveBeenCalledWith({
      email: 'jamie.rivera@acme.test',
      displayName: 'Jamie Rivera',
      orgId: ORG_UUID,
      buyerRole: 'approver',
      isOrgAdmin: true,
    })

    // Best-effort lead routing fired after the mutation.
    expect(resolveLeadershipFallback).toHaveBeenCalledWith(service)
    expect(createNotification).toHaveBeenCalledTimes(1)
    const [, payload] = (createNotification as jest.Mock).mock.calls[0]
    expect(payload.userId).toBe(LEADERSHIP_UUID)
    expect(payload.type).toBe('lead_routed')
  })

  it('carries the source discriminant through for the "Talk to a sales rep" door', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(createBuyerAccount as jest.Mock).mockResolvedValue({ userId: NEW_USER_UUID, emailSent: true })

    const res = await POST(
      jsonRequest(validBody({ source: 'sales_rep' }), { 'x-forwarded-for': '2.2.2.2' })
    )

    expect(res.status).toBe(201)
    expect(service.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'sales_rep' })
    )
  })

  it('never blocks or fails the signup when lead routing errors', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(createBuyerAccount as jest.Mock).mockResolvedValue({ userId: NEW_USER_UUID, emailSent: true })
    ;(resolveLeadershipFallback as jest.Mock).mockRejectedValue(new Error('funun_staff unreachable'))

    const res = await POST(jsonRequest(validBody(), { 'x-forwarded-for': '3.3.3.3' }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.orgId).toBe(ORG_UUID)
  })

  it('returns 400 on an invalid payload and never creates an account', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest(validBody({ email: 'not-an-email' }), { 'x-forwarded-for': '4.4.4.4' })
    )

    expect(res.status).toBe(400)
    expect(service.insertSpy).not.toHaveBeenCalled()
    expect(createBuyerAccount).not.toHaveBeenCalled()
  })

  it('returns a neutral 201 response on a duplicate email, never revealing the account already exists', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(createBuyerAccount as jest.Mock).mockRejectedValue(
      new DuplicateBuyerAccountError('This email has already been invited.')
    )

    const res = await POST(
      jsonRequest(validBody({ email: 'existing@acme.test' }), { 'x-forwarded-for': '5.5.5.5' })
    )

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.orgId).toBe(ORG_UUID)
    expect(body.error).toBeUndefined()
    // The org row was still created (never silently rolled back).
    expect(service.insertSpy).toHaveBeenCalledTimes(1)
  })

  it('returns 429 after the rate-limit threshold is exceeded for the same IP', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(createBuyerAccount as jest.Mock).mockResolvedValue({ userId: NEW_USER_UUID, emailSent: true })

    const ip = '9.9.9.9'
    let lastStatus = 0
    for (let i = 0; i < 6; i++) {
      const res = await POST(
        jsonRequest(validBody({ email: `visitor${i}@acme.test` }), { 'x-forwarded-for': ip })
      )
      lastStatus = res.status
    }

    expect(lastStatus).toBe(429)
  })

  it('returns 429 after the rate-limit threshold is exceeded for the same email', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(createBuyerAccount as jest.Mock).mockResolvedValue({ userId: NEW_USER_UUID, emailSent: true })

    let lastStatus = 0
    for (let i = 0; i < 6; i++) {
      const res = await POST(
        jsonRequest(validBody({ email: 'repeat@acme.test' }), {
          'x-forwarded-for': `10.0.0.${i}`,
        })
      )
      lastStatus = res.status
    }

    expect(lastStatus).toBe(429)
  })

  it('returns 500 (not a leak) when the buyer_orgs insert itself fails', async () => {
    const service = mockService({ orgInsertError: { message: 'db down' } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest(validBody({ email: 'insertfail@acme.test' }), { 'x-forwarded-for': '6.6.6.6' })
    )

    expect(res.status).toBe(500)
    expect(createBuyerAccount).not.toHaveBeenCalled()
  })
})
