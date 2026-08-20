import { createServiceClient } from '@/lib/supabase/server'
import { isArtistEmailAllowed, emailHasExistingAccount } from '@/lib/invites/allowlist'
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
  isArtistEmailAllowed: jest.fn(),
  emailHasExistingAccount: jest.fn(),
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
  it('returns allowed:true for an invited/collaborator email', async () => {
    ;(isArtistEmailAllowed as jest.Mock).mockResolvedValue(true)
    ;(emailHasExistingAccount as jest.Mock).mockResolvedValue(false)

    const res = await POST(
      jsonRequest({ email: 'invited@example.test' }, { 'x-forwarded-for': '30.0.0.1' })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ allowed: true, existingAccount: false })
  })

  it('returns allowed:false for an unknown/uninvited email', async () => {
    ;(isArtistEmailAllowed as jest.Mock).mockResolvedValue(false)
    ;(emailHasExistingAccount as jest.Mock).mockResolvedValue(false)

    const res = await POST(
      jsonRequest({ email: 'unknown@example.test' }, { 'x-forwarded-for': '30.0.0.2' })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ allowed: false, existingAccount: false })
  })

  it('returns existingAccount:true for an email that already has an account', async () => {
    ;(isArtistEmailAllowed as jest.Mock).mockResolvedValue(true)
    ;(emailHasExistingAccount as jest.Mock).mockResolvedValue(true)

    const res = await POST(
      jsonRequest({ email: 'has-account@example.test' }, { 'x-forwarded-for': '30.0.0.3' })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ allowed: true, existingAccount: true })
  })

  it('returns the identical response shape for allowed and denied emails (enumeration mitigation)', async () => {
    ;(isArtistEmailAllowed as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    ;(emailHasExistingAccount as jest.Mock).mockResolvedValue(false)

    const allowedRes = await POST(
      jsonRequest({ email: 'allowed@example.test' }, { 'x-forwarded-for': '30.0.0.4' })
    )
    const deniedRes = await POST(
      jsonRequest({ email: 'denied@example.test' }, { 'x-forwarded-for': '30.0.0.5' })
    )

    expect(Object.keys(await allowedRes.json()).sort()).toEqual(
      Object.keys(await deniedRes.json()).sort()
    )
    expect(allowedRes.status).toBe(deniedRes.status)
  })

  it('returns 429 when the limiter reports the request is rate-limited', async () => {
    ;(checkRateLimit as jest.Mock).mockResolvedValue(true)

    const res = await POST(
      jsonRequest({ email: 'limited@example.test' }, { 'x-forwarded-for': '30.0.1.1' })
    )

    expect(res.status).toBe(429)
    expect(isArtistEmailAllowed).not.toHaveBeenCalled()
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
    expect(isArtistEmailAllowed).not.toHaveBeenCalled()
    expect(emailHasExistingAccount).not.toHaveBeenCalled()
  })

  it('returns allowed:false and never throws on an empty body', async () => {
    const res = await POST(jsonRequest({}, { 'x-forwarded-for': '30.0.3.2' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ allowed: false, existingAccount: false })
  })
})
