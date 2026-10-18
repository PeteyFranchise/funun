import type { SupabaseClient } from '@supabase/supabase-js'

// Audit #7 — the limiter is now DB-backed (checkRateLimit → check_rate_limit RPC
// via the service client) and getClientIp is hardened against XFF spoofing.

const mockRpc = jest.fn()
const mockPeekResult = jest.fn()
const mockPeekChain = {
  select: jest.fn(() => mockPeekChain),
  eq: jest.fn(() => mockPeekChain),
  gte: jest.fn(async () => mockPeekResult()),
}
const mockFrom = jest.fn(() => mockPeekChain)
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () =>
    ({ rpc: (...a: unknown[]) => mockRpc(...a), from: (...a: unknown[]) => (mockFrom as (...x: unknown[]) => unknown)(...a) }) as unknown as SupabaseClient,
}))

import {
  checkRateLimit,
  peekRateLimit,
  getClientIp,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_ATTEMPTS,
  RATE_LIMIT_MAX_KEY_LENGTH,
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

  it('rejects invalid inputs before calling the database', async () => {
    await expect(checkRateLimit('x'.repeat(RATE_LIMIT_MAX_KEY_LENGTH + 1))).rejects.toThrow(
      RangeError
    )
    await expect(checkRateLimit('ip:test', { windowMs: 0 })).rejects.toThrow(RangeError)
    await expect(checkRateLimit('ip:test', { maxAttempts: 1.5 })).rejects.toThrow(RangeError)
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

// ─── peekRateLimit ────────────────────────────────────────────────────────
describe('peekRateLimit', () => {
  const opts = { windowMs: 60_000, maxAttempts: 3 }

  it('reads the window without calling the recording RPC', async () => {
    mockPeekResult.mockReturnValue({ count: 1, error: null })
    expect(await peekRateLimit('g:key', opts)).toBe('allowed')
    expect(mockFrom).toHaveBeenCalledWith('rate_limit_hits')
    expect(mockPeekChain.eq).toHaveBeenCalledWith('key', 'g:key')
    expect(mockPeekChain.gte).toHaveBeenCalledWith('hit_at', expect.any(String))
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('is limited at or over the maximum', async () => {
    mockPeekResult.mockReturnValue({ count: 3, error: null })
    expect(await peekRateLimit('g:key', opts)).toBe('limited')
  })

  it('reports unavailable on a read error or a missing count', async () => {
    mockPeekResult.mockReturnValue({ count: null, error: { message: 'down' } })
    expect(await peekRateLimit('g:key', opts)).toBe('unavailable')
    mockPeekResult.mockReturnValue({ count: null, error: null })
    expect(await peekRateLimit('g:key', opts)).toBe('unavailable')
  })

  it('reports unavailable when the client throws', async () => {
    mockFrom.mockImplementationOnce(() => {
      throw new Error('network')
    })
    expect(await peekRateLimit('g:key', opts)).toBe('unavailable')
  })

  it('rejects invalid inputs before reading', async () => {
    await expect(peekRateLimit('  ', opts)).rejects.toThrow(RangeError)
    await expect(peekRateLimit('g:key', { windowMs: 0, maxAttempts: 3 })).rejects.toThrow(RangeError)
    expect(mockFrom).not.toHaveBeenCalled()
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
