import type { SupabaseClient } from '@supabase/supabase-js'

// Audit #7 — the limiter is now DB-backed (checkRateLimit → check_rate_limit RPC
// via the service client) and getClientIp is hardened against XFF spoofing.

const mockRpc = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ rpc: (...a: unknown[]) => mockRpc(...a) }) as unknown as SupabaseClient,
}))

import {
  checkRateLimit,
  getClientIp,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_ATTEMPTS,
} from './rate-limit'

beforeEach(() => jest.clearAllMocks())

// ─── checkRateLimit ───────────────────────────────────────────────────────
describe('checkRateLimit', () => {
  it('returns true when the RPC reports over the limit', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    expect(await checkRateLimit('ip:1.2.3.4')).toBe(true)
  })

  it('returns false when under the limit', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null })
    expect(await checkRateLimit('ip:1.2.3.4')).toBe(false)
  })

  it('passes the key, window (seconds), and max to the RPC', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null })
    await checkRateLimit('email:x@y.co', { windowMs: 60_000, maxAttempts: 3 })
    expect(mockRpc).toHaveBeenCalledWith('check_rate_limit', {
      p_key: 'email:x@y.co',
      p_window_seconds: 60,
      p_max: 3,
    })
  })

  it('defaults window/max from the exported constants', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null })
    await checkRateLimit('ip:1.1.1.1')
    expect(mockRpc).toHaveBeenCalledWith('check_rate_limit', {
      p_key: 'ip:1.1.1.1',
      p_window_seconds: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
      p_max: RATE_LIMIT_MAX_ATTEMPTS,
    })
  })

  it('fails OPEN (false) when the limiter backend returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc missing (pre-migration)' } })
    expect(await checkRateLimit('ip:1.2.3.4')).toBe(false)
  })

  it('fails OPEN (false) when the client throws', async () => {
    mockRpc.mockRejectedValue(new Error('network'))
    expect(await checkRateLimit('ip:1.2.3.4')).toBe(false)
  })
})

// ─── getClientIp ──────────────────────────────────────────────────────────
describe('getClientIp', () => {
  const req = (headers: Record<string, string>) =>
    ({ headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } }) as unknown as Request

  it('prefers x-real-ip (the platform-set, non-spoofable client IP)', () => {
    expect(getClientIp(req({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('9.9.9.9')
  })

  it('falls back to the LAST x-forwarded-for entry, never the spoofable first', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('5.6.7.8')
  })

  it('returns unknown when no IP header is present', () => {
    expect(getClientIp(req({}))).toBe('unknown')
  })
})
