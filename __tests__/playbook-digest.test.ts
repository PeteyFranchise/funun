import { THRESHOLDS, classifyThreshold, type ThresholdMetric } from '@/lib/observability/config'

// ─── Mock the health route's GET handler ───────────────────────────────
// getDashboardHealth() must re-check health IN-PROCESS by importing
// { GET as checkHealth } from '@/app/api/health/route' (never a self-fetch
// over HTTP) — mocking the module here is what lets us assert that exact
// import shape while controlling its return value per scenario.
jest.mock('@/app/api/health/route', () => ({
  GET: jest.fn(),
}))

import { GET as mockedCheckHealth } from '@/app/api/health/route'
import { getDashboardHealth, buildDigestTodayRow, classifyAllThresholds } from '@/lib/playbook/digest'

const checkHealthMock = mockedCheckHealth as jest.Mock

describe('getDashboardHealth', () => {
  afterEach(() => {
    checkHealthMock.mockReset()
  })

  it('maps a 200 healthy response to "healthy"', async () => {
    checkHealthMock.mockResolvedValue({ json: async () => ({ status: 'healthy' }) })
    await expect(getDashboardHealth()).resolves.toBe('healthy')
  })

  it('maps a 503 degraded response to "degraded"', async () => {
    checkHealthMock.mockResolvedValue({ json: async () => ({ status: 'degraded' }) })
    await expect(getDashboardHealth()).resolves.toBe('degraded')
  })

  it('maps a thrown call to "unknown" — never throws', async () => {
    checkHealthMock.mockRejectedValue(new Error('unreachable'))
    await expect(getDashboardHealth()).resolves.toBe('unknown')
  })

  it('maps a body that fails to parse to "unknown" — never throws', async () => {
    checkHealthMock.mockResolvedValue({
      json: async () => {
        throw new Error('bad json')
      },
    })
    await expect(getDashboardHealth()).resolves.toBe('unknown')
  })
})

describe('buildDigestTodayRow', () => {
  it('is pure — returns the emerald dot + Healthy locked copy for "healthy"', () => {
    const row = buildDigestTodayRow('healthy')
    expect(row.dot).toBe('emerald')
    expect(row.text).toContain('**Healthy.**')
    expect(row.text).toContain('/api/health re-check: healthy.')
    expect(row.text).toContain('All threshold metrics: no live telemetry yet (v2 wires the feed).')
    expect(typeof row.date).toBe('string')
  })

  it('returns the rose dot + Degraded locked copy for "degraded"', () => {
    const row = buildDigestTodayRow('degraded')
    expect(row.dot).toBe('rose')
    expect(row.text).toContain('**Degraded.**')
    expect(row.text).toContain('/api/health re-check: degraded.')
  })

  it('returns the lavdim dot + Unknown locked copy for "unknown"', () => {
    const row = buildDigestTodayRow('unknown')
    expect(row.dot).toBe('lavdim')
    expect(row.text).toContain('**Unknown.**')
    expect(row.text).toContain('/api/health re-check: unknown.')
  })

  it('never sends email — the module never imports the alert fan-out', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const digestSource = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'lib', 'playbook', 'digest.ts'),
      'utf-8'
    )
    expect(digestSource).not.toMatch(/observability\/alerts/)
    expect(digestSource).not.toMatch(/fetch\(/)
  })
})

describe('classifyAllThresholds parity with the cron route', () => {
  it('matches the cron\'s own filter+classify loop exactly (excludes only monthly_spend_usd) — 18-04-style parity anchor', () => {
    // Mirrors app/api/cron/daily-observability-check/route.ts lines 66-69
    // verbatim as the parity-anchor fixture.
    const cronShape = (Object.keys(THRESHOLDS) as ThresholdMetric[])
      .filter((metric) => metric !== 'monthly_spend_usd')
      .map((metric) => ({ metric, status: classifyThreshold(metric, undefined) }))

    expect(classifyAllThresholds()).toEqual(cronShape)
  })
})
