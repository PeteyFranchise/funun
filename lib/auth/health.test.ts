import {
  filterAuthHealthEvents,
  summarizeAuthHealth,
  type AuthHealthEvent,
} from '@/lib/auth/health'

const now = Date.parse('2026-09-12T12:00:00.000Z')
const events: AuthHealthEvent[] = [
  {
    correlation_id: 'AUTH-A1B2C3D4E5F6',
    event_code: 'sign_in_failed',
    stage: 'credentials',
    surface: 'signin',
    workspace_intent: 'personal',
    runtime: 'browser',
    created_at: '2026-09-12T11:00:00.000Z',
  },
  {
    correlation_id: 'AUTH-F6E5D4C3B2A1',
    event_code: 'sign_in_failed',
    stage: 'credentials',
    surface: 'signin',
    workspace_intent: null,
    runtime: 'server',
    created_at: '2026-09-10T11:00:00.000Z',
  },
]

describe('auth health summary', () => {
  it('builds deterministic aggregate counts from sanitized events', () => {
    expect(summarizeAuthHealth(events, now)).toEqual({
      last24Hours: 1,
      last7Days: 2,
      topStage: 'credentials',
      topSurface: 'signin',
      byEvent: [['sign_in_failed', 2]],
    })
  })

  it('filters by bounded time window, event code, and workspace intent', () => {
    expect(filterAuthHealthEvents(events, {
      period: '24h',
      eventCode: 'sign_in_failed',
      workspaceIntent: 'personal',
    }, now)).toEqual([events[0]])

    expect(filterAuthHealthEvents(events, {
      period: '7d',
      eventCode: 'all',
      workspaceIntent: null,
    }, now)).toEqual([events[1]])
  })

  it('excludes invalid and future timestamps from operational filters', () => {
    expect(filterAuthHealthEvents([
      { ...events[0], created_at: 'not-a-date' },
      { ...events[0], created_at: '2026-09-12T13:00:00.000Z' },
    ], {
      period: '7d',
      eventCode: 'all',
      workspaceIntent: 'all',
    }, now)).toEqual([])
  })
})
