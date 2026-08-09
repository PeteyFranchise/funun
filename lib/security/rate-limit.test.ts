import { createRateLimiter, getClientIp } from './rate-limit'

// ─── createRateLimiter ──────────────────────────────────────────────────
describe('createRateLimiter', () => {
  it('allows the first maxAttempts calls and blocks the next one within the window', () => {
    const limiter = createRateLimiter({ windowMs: 1000, maxAttempts: 3 })
    expect(limiter.isRateLimited('k')).toBe(false)
    expect(limiter.isRateLimited('k')).toBe(false)
    expect(limiter.isRateLimited('k')).toBe(false)
    expect(limiter.isRateLimited('k')).toBe(true)
  })

  it('tracks each key independently within the same limiter instance', () => {
    const limiter = createRateLimiter({ windowMs: 1000, maxAttempts: 1 })
    expect(limiter.isRateLimited('a')).toBe(false)
    expect(limiter.isRateLimited('b')).toBe(false)
    expect(limiter.isRateLimited('a')).toBe(true)
    expect(limiter.isRateLimited('b')).toBe(true)
  })

  it('gives each limiter instance its own independent Map/bucket', () => {
    const a = createRateLimiter({ windowMs: 1000, maxAttempts: 1 })
    const b = createRateLimiter({ windowMs: 1000, maxAttempts: 1 })
    expect(a.isRateLimited('k')).toBe(false)
    // b's bucket is unaffected by a's usage of the same key string.
    expect(b.isRateLimited('k')).toBe(false)
  })

  it('resets after the window elapses', () => {
    jest.useFakeTimers()
    try {
      const limiter = createRateLimiter({ windowMs: 1000, maxAttempts: 1 })
      expect(limiter.isRateLimited('k')).toBe(false)
      expect(limiter.isRateLimited('k')).toBe(true)
      jest.advanceTimersByTime(1001)
      expect(limiter.isRateLimited('k')).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })

  it('defaults to the shared 15-minute / 5-attempt constants when no options are passed', () => {
    const limiter = createRateLimiter()
    for (let i = 0; i < 5; i++) {
      expect(limiter.isRateLimited('default')).toBe(false)
    }
    expect(limiter.isRateLimited('default')).toBe(true)
  })
})

// ─── getClientIp ────────────────────────────────────────────────────────
describe('getClientIp', () => {
  function req(headers: Record<string, string>) {
    return new Request('http://t.local', { headers })
  }

  it('prefers x-forwarded-for, taking the first entry', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    expect(getClientIp(req({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9')
  })

  it('falls back to "unknown" when neither header is present', () => {
    expect(getClientIp(req({}))).toBe('unknown')
  })
})
