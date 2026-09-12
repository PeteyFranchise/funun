import { summarizeAuthHealth, type AuthHealthEvent } from '@/lib/auth/health'

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
})
