import { createServiceClient } from '@/lib/supabase/server'
import { emailHasExistingAccount, isSignupInviteValid } from '@/lib/invites/allowlist'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { POST } from './route'

// ─── POST /api/signup/check-invite (27-06 Task 1) ──────────────────────────
// Integration test with mocked service client + mocked allowlist twin,
// mirroring app/api/waitlist/route.test.ts's conventions. Covers: allowed
// email -> allowed:true, unknown email -> allowed:false, existing account ->
// existingAccount:true, ip/email rate limits -> 429, and malformed body ->
// allowed:false (never throws), with an IDENTICAL response shape across the
// allowed/denied cases (enumeration mitigation, T-27-02).

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/invites/allowlist', () => ({
  emailHasExistingAccount: jest.fn(),
  isSignupInviteValid: jest.fn(),
}))

// Limiter is DB-backed (audit #7) — mock it; counting is covered in
// lib/security/rate-limit.test.ts.
jest.mock('@/lib/security/rate-limit', () => ({
  ...jest.requireActual('@/lib/security/rate-limit'),
  checkRateLimit: jest.fn(),
}))

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://t.local/api/signup/check-invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServiceClient as jest.Mock).mockReturnValue({})
  ;(checkRateLimit as jest.Mock).mockResolvedValue(false)
})

describe('POST /api/signup/check-invite', () => {
  const inviteToken = 'a'.repeat(64)

  it('returns allowed:true only for a matching invite capability and email', async () => {
    ;(isSignupInviteValid as jest.Mock).mockResolvedValue(true)
    ;(emailHasExistingAccount as jest.Mock).mockResolvedValue(false)

    const res = await POST(
      jsonRequest(
        { email: 'invited@example.test', inviteToken },
        { 'x-forwarded-for': '30.0.0.1' }
      )
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ allowed: true, existingAccount: false })
  })

  it('returns a neutral denial for a token/email mismatch', async () => {
    ;(isSignupInviteValid as jest.Mock).mockResolvedValue(false)

    const res = await POST(
      jsonRequest(
        { email: 'unknown@example.test', inviteToken },
        { 'x-forwarded-for': '30.0.0.2' }
      )
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ allowed: false, existingAccount: false })
    expect(emailHasExistingAccount).not.toHaveBeenCalled()
  })

  it('reveals existing-account state only after the invite capability is proven', async () => {
    ;(isSignupInviteValid as jest.Mock).mockResolvedValue(true)
    ;(emailHasExistingAccount as jest.Mock).mockResolvedValue(true)

    const res = await POST(
      jsonRequest(
        { email: 'has-account@example.test', inviteToken },
        { 'x-forwarded-for': '30.0.0.3' }
      )
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ allowed: true, existingAccount: true })
  })

  it('does not query account or allowlist state when no capability is presented', async () => {
    const res = await POST(
      jsonRequest({ email: 'probe@example.test' }, { 'x-forwarded-for': '30.0.0.4' })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ allowed: false, existingAccount: false })
    expect(isSignupInviteValid).not.toHaveBeenCalled()
    expect(emailHasExistingAccount).not.toHaveBeenCalled()
  })

  it('returns 429 when the limiter reports the request is rate-limited', async () => {
    ;(checkRateLimit as jest.Mock).mockResolvedValue(true)

    const res = await POST(
      jsonRequest({ email: 'limited@example.test' }, { 'x-forwarded-for': '30.0.1.1' })
    )

    expect(res.status).toBe(429)
    expect(isSignupInviteValid).not.toHaveBeenCalled()
  })

  it('returns allowed:false and never throws on a malformed body', async () => {
    const res = await POST(
      new Request('http://t.local/api/signup/check-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '30.0.3.1' },
        body: 'not-json',
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ allowed: false, existingAccount: false })
    expect(isSignupInviteValid).not.toHaveBeenCalled()
    expect(emailHasExistingAccount).not.toHaveBeenCalled()
  })

  it('returns allowed:false and never throws on an empty body', async () => {
    const res = await POST(jsonRequest({}, { 'x-forwarded-for': '30.0.3.2' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ allowed: false, existingAccount: false })
  })
})
