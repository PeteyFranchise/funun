import { getOrCreateCorrelationId, CORRELATION_HEADER } from './correlation'
import { logWithCorrelation } from './logger'

describe('getOrCreateCorrelationId', () => {
  it('returns the propagated x-correlation-id header value when present', () => {
    const headers = new Headers({ [CORRELATION_HEADER]: 'req-abc-123' })
    expect(getOrCreateCorrelationId(headers)).toBe('req-abc-123')
  })

  it('mints a fresh UUID when the header is absent', () => {
    const headers = new Headers()
    const id = getOrCreateCorrelationId(headers)
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
    expect(id).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it('yields N distinct IDs across N concurrent calls with no propagated header', () => {
    const N = 50
    const headerSets = Array.from({ length: N }, () => new Headers())
    const ids = headerSets.map((h) => getOrCreateCorrelationId(h))
    expect(new Set(ids).size).toBe(N)
  })

  it('exports the canonical correlation header name', () => {
    expect(CORRELATION_HEADER).toBe('x-correlation-id')
  })
})

describe('logWithCorrelation', () => {
  let logSpy: jest.SpyInstance

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  it('writes exactly one JSON line containing the correlationId and the allowlisted fields', () => {
    logWithCorrelation('req-abc-123', {
      route: '/api/vault',
      status: 200,
      durationMs: 42,
      kind: 'operational_failure',
    })

    expect(logSpy).toHaveBeenCalledTimes(1)
    const [line] = logSpy.mock.calls[0]
    expect(typeof line).toBe('string')
    const parsed = JSON.parse(line)
    expect(parsed.correlationId).toBe('req-abc-123')
    expect(parsed.route).toBe('/api/vault')
    expect(parsed.status).toBe(200)
    expect(parsed.durationMs).toBe(42)
    expect(parsed.kind).toBe('operational_failure')
    expect(typeof parsed.ts).toBe('string')
    // Only the allowlisted fields (+ ts) are present — never an arbitrary
    // sensitive record smuggled through.
    expect(Object.keys(parsed).sort()).toEqual(
      ['correlationId', 'durationMs', 'kind', 'route', 'status', 'ts'].sort()
    )
  })

  it('accepts the other LogKind value', () => {
    logWithCorrelation('req-xyz-789', {
      route: '/api/health',
      status: 503,
      durationMs: 5,
      kind: 'user_error',
    })
    const [line] = logSpy.mock.calls[0]
    expect(JSON.parse(line).kind).toBe('user_error')
  })
})
