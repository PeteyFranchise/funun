import { createServiceClient } from '@/lib/supabase/server'
import { createBuyerAccount, DuplicateBuyerAccountError } from '@/lib/buyers/createBuyerAccount'
import { resolveLeadershipFallback } from '@/lib/staff/leadershipFallback'
import { createNotification } from '@/lib/notifications'
import { checkRateLimit, peekRateLimit } from '@/lib/security/rate-limit'
import { turnstileConfigStatus, verifyTurnstileToken } from '@/lib/security/turnstile'
import * as Sentry from '@sentry/nextjs'
import { POST } from './route'

// ─── POST /api/sync/register (23-04 Task 3) ────────────────────────────────
// Integration test with a mocked service client + mocked createBuyerAccount,
// mirroring __tests__/staff-buyer-orgs-api.test.ts's admin-route
// conventions. Covers: 201 + correct insert shape, best-effort lead
// routing, 400 on invalid payload, neutral response on duplicate email
// (account-enumeration avoidance), and 429 over the rate limit. Also covers
// the bot check (rejected before any DB call, identical response in every
// config state) and the fail-closed limiter posture including the global
// daily cap.

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

// Limiter is DB-backed (audit #7) — mock it; counting is covered in
// lib/security/rate-limit.test.ts.
jest.mock('@/lib/security/rate-limit', () => ({
  ...jest.requireActual('@/lib/security/rate-limit'),
  checkRateLimit: jest.fn(),
  peekRateLimit: jest.fn(),
}))

jest.mock('@/lib/security/turnstile', () => ({
  verifyTurnstileToken: jest.fn(),
  turnstileConfigStatus: jest.fn(),
}))

jest.mock('@sentry/nextjs', () => ({
  captureMessage: jest.fn(),
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
    turnstileToken: 'tok-ok',
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
  ;(checkRateLimit as jest.Mock).mockResolvedValue(false)
  ;(peekRateLimit as jest.Mock).mockResolvedValue('allowed')
  ;(verifyTurnstileToken as jest.Mock).mockResolvedValue(true)
  ;(turnstileConfigStatus as jest.Mock).mockReturnValue('configured')
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

  it('returns 429 when the limiter reports the request is rate-limited', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(createBuyerAccount as jest.Mock).mockResolvedValue({ userId: NEW_USER_UUID, emailSent: true })
    ;(checkRateLimit as jest.Mock).mockResolvedValue(true)

    const res = await POST(
      jsonRequest(validBody({ email: 'limited@acme.test' }), { 'x-forwarded-for': '9.9.9.9' })
    )

    expect(res.status).toBe(429)
    expect(createBuyerAccount).not.toHaveBeenCalled()
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

describe('POST /api/sync/register - bot check', () => {
  const VERIFY_FAILED = { error: 'Verification failed. Please try again.' }

  it('rejects buyer signup without a bot check token, before any DB call', async () => {
    ;(verifyTurnstileToken as jest.Mock).mockResolvedValue(false)
    const body = validBody()
    delete (body as Record<string, unknown>).turnstileToken

    const res = await POST(jsonRequest(body, { 'x-forwarded-for': '7.7.7.7' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual(VERIFY_FAILED)
    expect(verifyTurnstileToken).toHaveBeenCalledWith('', '7.7.7.7', { expectedAction: 'sync-register' })
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(createBuyerAccount).not.toHaveBeenCalled()
  })

  it('rejects buyer signup when the token fails verification, before any DB call', async () => {
    ;(verifyTurnstileToken as jest.Mock).mockResolvedValue(false)

    const res = await POST(
      jsonRequest(validBody({ turnstileToken: 'tok-bad' }), { 'x-forwarded-for': '7.7.7.8' })
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual(VERIFY_FAILED)
    expect(verifyTurnstileToken).toHaveBeenCalledWith('tok-bad', '7.7.7.8', {
      expectedAction: 'sync-register',
    })
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(createBuyerAccount).not.toHaveBeenCalled()
  })

  it('reports a half-configured bot check to Sentry, with an identical client response', async () => {
    ;(verifyTurnstileToken as jest.Mock).mockResolvedValue(false)
    ;(turnstileConfigStatus as jest.Mock).mockReturnValue('secret-missing')

    const res = await POST(jsonRequest(validBody(), { 'x-forwarded-for': '7.7.7.9' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual(VERIFY_FAILED)
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'Buyer signup Turnstile verification failed due to misconfiguration',
      expect.objectContaining({
        level: 'error',
        tags: { feature: 'sync-register-turnstile', configStatus: 'secret-missing' },
      })
    )
  })

  it('reports the misconfiguration at most once per server instance', async () => {
    // Fresh module registry so the module-level state starts clear.
    jest.resetModules()
    const sentry = jest.requireMock('@sentry/nextjs') as { captureMessage: jest.Mock }
    const turnstile = jest.requireMock('@/lib/security/turnstile') as {
      verifyTurnstileToken: jest.Mock
      turnstileConfigStatus: jest.Mock
    }
    const limiter = jest.requireMock('@/lib/security/rate-limit') as {
      checkRateLimit: jest.Mock
      peekRateLimit: jest.Mock
    }
    limiter.checkRateLimit.mockResolvedValue(false)
    limiter.peekRateLimit.mockResolvedValue('allowed')
    turnstile.verifyTurnstileToken.mockResolvedValue(false)
    turnstile.turnstileConfigStatus.mockReturnValue('site-key-missing')
    sentry.captureMessage.mockClear()
    const { POST: freshPost } = require('./route') as { POST: typeof POST }

    const first = await freshPost(jsonRequest(validBody(), { 'x-forwarded-for': '7.7.7.20' }))
    const second = await freshPost(jsonRequest(validBody(), { 'x-forwarded-for': '7.7.7.21' }))

    expect(first.status).toBe(400)
    expect(second.status).toBe(400)
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1)
  })

  it.each(['configured', 'unconfigured'] as const)(
    'does not report to Sentry when a failed check is in the %s state',
    async status => {
      ;(verifyTurnstileToken as jest.Mock).mockResolvedValue(false)
      ;(turnstileConfigStatus as jest.Mock).mockReturnValue(status)

      const res = await POST(jsonRequest(validBody(), { 'x-forwarded-for': '7.7.7.10' }))

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual(VERIFY_FAILED)
      expect(Sentry.captureMessage).not.toHaveBeenCalled()
    }
  )
})

describe('POST /api/sync/register - limits', () => {
  it('uses route-scoped fail-closed keys for the ip and email counters', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(createBuyerAccount as jest.Mock).mockResolvedValue({ userId: NEW_USER_UUID, emailSent: true })

    await POST(jsonRequest(validBody(), { 'x-forwarded-for': '8.8.8.8' }))

    expect(checkRateLimit).toHaveBeenCalledWith('sync-register:ip:8.8.8.8', { failClosed: true })
    expect(checkRateLimit).toHaveBeenCalledWith('sync-register:email:jamie.rivera@acme.test', {
      failClosed: true,
    })
    expect(checkRateLimit).not.toHaveBeenCalledWith('ip:8.8.8.8', expect.anything())
    expect(checkRateLimit).not.toHaveBeenCalledWith('email:jamie.rivera@acme.test', expect.anything())
  })

  it('checks the ip counter first and the email counter only after the bot check', async () => {
    const order: string[] = []
    ;(checkRateLimit as jest.Mock).mockImplementation(async (key: string) => {
      order.push(`limit:${key}`)
      return false
    })
    ;(verifyTurnstileToken as jest.Mock).mockImplementation(async () => {
      order.push('turnstile')
      return true
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(mockService())
    ;(createBuyerAccount as jest.Mock).mockResolvedValue({ userId: NEW_USER_UUID, emailSent: true })

    await POST(jsonRequest(validBody(), { 'x-forwarded-for': '8.8.8.20' }))

    expect(order.slice(0, 3)).toEqual([
      'limit:sync-register:ip:8.8.8.20',
      'turnstile',
      'limit:sync-register:email:jamie.rivera@acme.test',
    ])
  })

  it('does not touch the email counter or the cap when the bot check fails', async () => {
    ;(verifyTurnstileToken as jest.Mock).mockResolvedValue(false)

    await POST(jsonRequest(validBody(), { 'x-forwarded-for': '8.8.8.10' }))

    expect(checkRateLimit).toHaveBeenCalledTimes(1)
    expect(peekRateLimit).not.toHaveBeenCalled()
  })

  it('peeks the global daily cap before the insert and records a slot only after a new account', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(createBuyerAccount as jest.Mock).mockResolvedValue({ userId: NEW_USER_UUID, emailSent: true })

    await POST(jsonRequest(validBody(), { 'x-forwarded-for': '8.8.8.30' }))

    expect(peekRateLimit).toHaveBeenCalledWith('sync-register:global', {
      windowMs: 24 * 60 * 60 * 1000,
      maxAttempts: 200,
    })
    expect(checkRateLimit).toHaveBeenCalledWith('sync-register:global', {
      windowMs: 24 * 60 * 60 * 1000,
      maxAttempts: 200,
      failClosed: true,
    })
  })

  it('does not record a global slot for a duplicate-email attempt', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue(mockService())
    ;(createBuyerAccount as jest.Mock).mockRejectedValue(new DuplicateBuyerAccountError('dup'))

    const res = await POST(jsonRequest(validBody(), { 'x-forwarded-for': '8.8.8.31' }))

    expect(res.status).toBe(201)
    expect(checkRateLimit).not.toHaveBeenCalledWith('sync-register:global', expect.anything())
  })

  it('does not record a global slot when the account create fails', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue(mockService())
    ;(createBuyerAccount as jest.Mock).mockRejectedValue(new Error('auth down'))

    const res = await POST(jsonRequest(validBody(), { 'x-forwarded-for': '8.8.8.32' }))

    expect(res.status).toBe(500)
    expect(checkRateLimit).not.toHaveBeenCalledWith('sync-register:global', expect.anything())
  })

  it('does not record a global slot when the org insert fails', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue(mockService({ orgInsertError: { message: 'db down' } }))

    await POST(jsonRequest(validBody(), { 'x-forwarded-for': '8.8.8.33' }))

    expect(checkRateLimit).not.toHaveBeenCalledWith('sync-register:global', expect.anything())
  })

  it('returns 429 with a contact fallback, no DB call and one Sentry signal when the cap is reached', async () => {
    // Fresh module registry so the module-level state starts clear.
    jest.resetModules()
    const sentry = jest.requireMock('@sentry/nextjs') as { captureMessage: jest.Mock }
    const turnstile = jest.requireMock('@/lib/security/turnstile') as {
      verifyTurnstileToken: jest.Mock
      turnstileConfigStatus: jest.Mock
    }
    const limiter = jest.requireMock('@/lib/security/rate-limit') as {
      checkRateLimit: jest.Mock
      peekRateLimit: jest.Mock
    }
    const server = jest.requireMock('@/lib/supabase/server') as { createServiceClient: jest.Mock }
    turnstile.verifyTurnstileToken.mockResolvedValue(true)
    limiter.checkRateLimit.mockResolvedValue(false)
    limiter.peekRateLimit.mockResolvedValue('limited')
    server.createServiceClient.mockClear()
    sentry.captureMessage.mockClear()
    const { POST: freshPost } = require('./route') as { POST: typeof POST }

    const res = await freshPost(jsonRequest(validBody(), { 'x-forwarded-for': '8.8.8.9' }))
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.error).toContain('sync@funun.studio')
    expect(server.createServiceClient).not.toHaveBeenCalled()
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1)
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      'Buyer signup daily registration cap reached',
      expect.objectContaining({ tags: { feature: 'sync-register-cap', state: 'limited' } })
    )
    // No PII in the event.
    expect(JSON.stringify(sentry.captureMessage.mock.calls)).not.toContain('acme.test')

    await freshPost(jsonRequest(validBody(), { 'x-forwarded-for': '8.8.8.19' }))
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1)
  })

  it('refuses with 429 and a Sentry signal when the cap count cannot be read', async () => {
    // Fresh module registry so the module-level state starts clear.
    jest.resetModules()
    const sentry = jest.requireMock('@sentry/nextjs') as { captureMessage: jest.Mock }
    const turnstile = jest.requireMock('@/lib/security/turnstile') as {
      verifyTurnstileToken: jest.Mock
      turnstileConfigStatus: jest.Mock
    }
    const limiter = jest.requireMock('@/lib/security/rate-limit') as {
      checkRateLimit: jest.Mock
      peekRateLimit: jest.Mock
    }
    turnstile.verifyTurnstileToken.mockResolvedValue(true)
    limiter.checkRateLimit.mockResolvedValue(false)
    limiter.peekRateLimit.mockResolvedValue('unavailable')
    sentry.captureMessage.mockClear()
    const { POST: freshPost } = require('./route') as { POST: typeof POST }

    const res = await freshPost(jsonRequest(validBody(), { 'x-forwarded-for': '8.8.8.12' }))

    expect(res.status).toBe(429)
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      'Buyer signup refused because the rate limiter is unavailable',
      expect.objectContaining({ tags: { feature: 'sync-register-cap', state: 'unavailable' } })
    )
  })

  it('refuses with 429 when the ip limiter is unavailable', async () => {
    // Mirror the real helper's failure branch: only fail-closed callers see "limited".
    ;(checkRateLimit as jest.Mock).mockImplementation(
      async (_key: string, opts?: { failClosed?: boolean }) => opts?.failClosed === true
    )

    const res = await POST(jsonRequest(validBody(), { 'x-forwarded-for': '8.8.8.11' }))

    expect(res.status).toBe(429)
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(createBuyerAccount).not.toHaveBeenCalled()
  })
})
