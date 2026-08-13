import { createServiceClient } from '@/lib/supabase/server'
import {
  classifyThreshold,
  THRESHOLDS,
  DEFAULT_ALERT_RECIPIENTS,
  getAlertRecipients,
  getIncidentOwners,
} from './config'

// ─── lib/observability/config.ts (32-01 Task 1) ────────────────────────
// Covers R8 boundary/adjacency/empty edges for classifyThreshold, the
// non-overlapping-bands invariant across every THRESHOLDS entry, and
// getAlertRecipients'/getIncidentOwners' never-throw fallback to the
// Pete-only default (D-08/D-13), mirroring app/api/waitlist/route.test.ts's
// mock-the-client-factory style.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

function mockService(selectResult: { data: unknown; error: { message: string } | null }) {
  const selectSpy = jest.fn(async () => selectResult)
  return { from: jest.fn(() => ({ select: selectSpy })), selectSpy }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('classifyThreshold', () => {
  it('resolves a value exactly AT warning to "warning" (boundary)', () => {
    const { warning } = THRESHOLDS.supabase_cpu_pct
    expect(classifyThreshold('supabase_cpu_pct', warning)).toBe('warning')
  })

  it('resolves a between-warning-and-critical value to "warning" (adjacency, lower band)', () => {
    const { warning, critical } = THRESHOLDS.supabase_cpu_pct
    const between = warning + (critical - warning) / 2
    expect(classifyThreshold('supabase_cpu_pct', between)).toBe('warning')
  })

  it('resolves a value exactly AT critical, and one step above, to "critical"', () => {
    const { critical } = THRESHOLDS.supabase_cpu_pct
    expect(classifyThreshold('supabase_cpu_pct', critical)).toBe('critical')
    expect(classifyThreshold('supabase_cpu_pct', critical + 1)).toBe('critical')
  })

  it('resolves a value below warning to "healthy"', () => {
    const { warning } = THRESHOLDS.supabase_cpu_pct
    expect(classifyThreshold('supabase_cpu_pct', warning - 1)).toBe('healthy')
  })

  it('resolves null/undefined to "unknown" (no-data is never silently healthy)', () => {
    expect(classifyThreshold('supabase_cpu_pct', null)).toBe('unknown')
    expect(classifyThreshold('supabase_cpu_pct', undefined)).toBe('unknown')
  })

  it('has warning < critical for every THRESHOLDS entry (non-overlapping bands)', () => {
    for (const [metric, band] of Object.entries(THRESHOLDS)) {
      expect(band.warning).toBeLessThan(band.critical)
      // sanity: every band is still provisional pending Plan 09's baseline
      expect(typeof band.provisional).toBe('boolean')
      void metric
    }
  })
})

describe('getAlertRecipients', () => {
  it('falls back to DEFAULT_ALERT_RECIPIENTS when the table returns an empty array', async () => {
    const service = mockService({ data: [], error: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const recipients = await getAlertRecipients()

    expect(recipients).toEqual(DEFAULT_ALERT_RECIPIENTS)
  })

  it('falls back to DEFAULT_ALERT_RECIPIENTS when the table read errors', async () => {
    const service = mockService({ data: null, error: { message: 'relation does not exist' } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const recipients = await getAlertRecipients()

    expect(recipients).toEqual(DEFAULT_ALERT_RECIPIENTS)
  })

  it('never throws even when createServiceClient itself throws', async () => {
    ;(createServiceClient as jest.Mock).mockImplementation(() => {
      throw new Error('missing env var')
    })

    await expect(getAlertRecipients()).resolves.toEqual(DEFAULT_ALERT_RECIPIENTS)
  })

  it('returns the table rows when the service returns a non-empty array', async () => {
    const rows = [
      { email: 'pete@funun.studio', role: 'primary' },
      { email: 'backup@funun.studio', role: 'backup' },
    ]
    const service = mockService({ data: rows, error: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const recipients = await getAlertRecipients()

    expect(recipients).toEqual(rows)
  })
})

describe('getIncidentOwners', () => {
  it('falls back to DEFAULT_ALERT_RECIPIENTS when the table is empty/unreachable', async () => {
    const service = mockService({ data: [], error: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const owners = await getIncidentOwners()

    expect(owners).toEqual(DEFAULT_ALERT_RECIPIENTS)
  })

  it('returns only primary/backup recipients, excluding watchers', async () => {
    const rows = [
      { email: 'pete@funun.studio', role: 'primary' },
      { email: 'backup@funun.studio', role: 'backup' },
      { email: 'watcher@funun.studio', role: 'watcher' },
    ]
    const service = mockService({ data: rows, error: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const owners = await getIncidentOwners()

    expect(owners).toEqual([rows[0], rows[1]])
  })
})
