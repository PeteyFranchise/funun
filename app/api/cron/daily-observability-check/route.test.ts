import { NextResponse } from 'next/server'
import { fanOutAlert } from '@/lib/observability/alerts'
import { GET as checkHealth } from '@/app/api/health/route'
import { GET } from './route'

// ─── GET /api/cron/daily-observability-check (32-05 Task 2) ────────────
// Mirrors app/api/cron/curator-reach/route.ts's fail-closed CRON_SECRET
// check, tested the same way this repo already tests that shape. Covers:
// 401 when the Authorization header is missing/mismatched, 401 when
// CRON_SECRET itself is unset (fail-closed, never `Bearer undefined`),
// and the authorized path building + fanning out the digest exactly once.

jest.mock('@/lib/observability/alerts', () => ({
  fanOutAlert: jest.fn(),
}))

jest.mock('@/app/api/health/route', () => ({
  GET: jest.fn(),
}))

const ORIGINAL_ENV = process.env

function request(authHeader?: string): Request {
  const headers: Record<string, string> = authHeader ? { authorization: authHeader } : {}
  return new Request('http://t.local/api/cron/daily-observability-check', { headers })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: 'test-secret' }
  ;(checkHealth as jest.Mock).mockResolvedValue(NextResponse.json({ status: 'healthy' }, { status: 200 }))
  ;(fanOutAlert as jest.Mock).mockResolvedValue({ sent: 1, failed: 0 })
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('GET /api/cron/daily-observability-check', () => {
  it('returns 401 and never runs the digest when the Authorization header is missing/mismatched', async () => {
    const res = await GET(request('Bearer wrong-secret'))

    expect(res.status).toBe(401)
    expect(checkHealth).not.toHaveBeenCalled()
    expect(fanOutAlert).not.toHaveBeenCalled()
  })

  it('returns 401 (fails closed) when CRON_SECRET is unset, never matching Bearer undefined', async () => {
    process.env = { ...ORIGINAL_ENV }
    delete process.env.CRON_SECRET

    const res = await GET(request('Bearer undefined'))

    expect(res.status).toBe(401)
    expect(fanOutAlert).not.toHaveBeenCalled()
  })

  it('runs the digest and fans it out exactly once when authorized', async () => {
    const res = await GET(request('Bearer test-secret'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.healthStatus).toBe('healthy')
    expect(checkHealth).toHaveBeenCalledTimes(1)
    expect(fanOutAlert).toHaveBeenCalledTimes(1)
    const [subject, html] = (fanOutAlert as jest.Mock).mock.calls[0]
    expect(subject).toContain('healthy')
    expect(html).toContain('Uptime status')
  })

  it('reports healthStatus "degraded" when the health re-check is degraded, and still fans out', async () => {
    ;(checkHealth as jest.Mock).mockResolvedValue(NextResponse.json({ status: 'degraded' }, { status: 503 }))

    const res = await GET(request('Bearer test-secret'))

    const body = await res.json()
    expect(body.healthStatus).toBe('degraded')
    expect(fanOutAlert).toHaveBeenCalledTimes(1)
  })

  it('never throws when the health re-check itself rejects (reports unknown instead)', async () => {
    ;(checkHealth as jest.Mock).mockRejectedValue(new Error('unreachable'))

    const res = await GET(request('Bearer test-secret'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.healthStatus).toBe('unknown')
    expect(fanOutAlert).toHaveBeenCalledTimes(1)
  })

  it('degrades the spend line to the Hobby-tier note when VERCEL_PLAN_TIER is not "pro"', async () => {
    delete process.env.VERCEL_PLAN_TIER

    await GET(request('Bearer test-secret'))

    const [, html] = (fanOutAlert as jest.Mock).mock.calls[0]
    expect(html).toContain('spend detection unavailable on Hobby tier')
    expect(html).toContain('docs/observability/VERCEL-ALERTS-RESPONSE.md')
  })

  it('includes the Spend Management dashboard note when VERCEL_PLAN_TIER is "pro"', async () => {
    process.env.VERCEL_PLAN_TIER = 'pro'

    await GET(request('Bearer test-secret'))

    const [, html] = (fanOutAlert as jest.Mock).mock.calls[0]
    expect(html).toContain('Vercel Spend Management dashboard')
    expect(html).not.toContain('unavailable on Hobby tier')
  })
})
