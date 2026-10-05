import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { notifyTeamTierLeadStaff } from '@/lib/team-tier/notify-staff'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { POST } from './route'

// ─── POST /api/team-tier-leads (261004-ttq Task 4) ────────────────────────
// Mirrors app/api/sync/register/route.test.ts's mocking convention.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
  createApiClient: jest.fn(),
}))

jest.mock('@/lib/team-tier/notify-staff', () => ({
  notifyTeamTierLeadStaff: jest.fn(),
}))

jest.mock('@/lib/security/rate-limit', () => ({
  ...jest.requireActual('@/lib/security/rate-limit'),
  checkRateLimit: jest.fn(),
}))

const LEAD_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://t.local/api/team-tier-leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function selfServeBody(overrides: Record<string, unknown> = {}) {
  return {
    seatAnswer: 'small_team',
    catalogueAnswer: 'from_25_to_200',
    painPoints: ['unsigned_splits'],
    ...overrides,
  }
}

function bdBody(overrides: Record<string, unknown> = {}) {
  return {
    seatAnswer: 'more_than_ten',
    catalogueAnswer: 'over_1000',
    painPoints: ['scattered_files'],
    contactName: 'Jamie Rivera',
    contactEmail: 'jamie@example.com',
    ...overrides,
  }
}

function mockService(options: { insertError?: { message: string } | null } = {}) {
  const { insertError = null } = options
  const insertSpy = jest.fn((row: Record<string, unknown>) => ({
    select: jest.fn(() => ({
      single: jest.fn(async () => ({
        data: insertError ? null : { id: LEAD_UUID, ...row },
        error: insertError,
      })),
    })),
  }))
  const from = jest.fn((table: string) => {
    if (table === 'team_tier_leads') return { insert: insertSpy }
    return {}
  })
  return { from, insertSpy }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(checkRateLimit as jest.Mock).mockResolvedValue(false)
  ;(createApiClient as jest.Mock).mockResolvedValue({
    auth: { getUser: jest.fn(async () => ({ data: { user: null } })) },
  })
  ;(notifyTeamTierLeadStaff as jest.Mock).mockResolvedValue(undefined)
})

describe('POST /api/team-tier-leads', () => {
  it('inserts a row and fires NO staff notification for a self-serve answer', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest(selfServeBody(), { 'x-forwarded-for': '1.1.1.1' }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toEqual({ ok: true, routingOutcome: 'self_serve' })

    expect(service.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        seat_answer: 'small_team',
        catalogue_answer: 'from_25_to_200',
        pain_points: ['unsigned_splits'],
        routing_outcome: 'self_serve',
        contact_name: null,
        contact_email: null,
      })
    )
    expect(notifyTeamTierLeadStaff).not.toHaveBeenCalled()
  })

  it('inserts a row AND fires the fan-out notification exactly once for a BD answer', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest(bdBody(), { 'x-forwarded-for': '2.2.2.2' }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toEqual({ ok: true, routingOutcome: 'bd' })

    expect(service.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        seat_answer: 'more_than_ten',
        routing_outcome: 'bd',
        contact_name: 'Jamie Rivera',
        contact_email: 'jamie@example.com',
      })
    )
    expect(notifyTeamTierLeadStaff).toHaveBeenCalledTimes(1)
    expect(notifyTeamTierLeadStaff).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ id: LEAD_UUID, seatAnswerLabel: 'More than ten' })
    )
  })

  it('returns 400 on an invalid payload (missing seatAnswer) and never inserts', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest({ catalogueAnswer: 'under_25' }, { 'x-forwarded-for': '3.3.3.3' })
    )

    expect(res.status).toBe(400)
    expect(service.insertSpy).not.toHaveBeenCalled()
  })

  it('returns 400 on a BD-routed payload missing contact info', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest(bdBody({ contactEmail: undefined }), { 'x-forwarded-for': '4.4.4.4' })
    )

    expect(res.status).toBe(400)
    expect(service.insertSpy).not.toHaveBeenCalled()
  })

  it('returns 429 when the rate limiter signals over-limit', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(checkRateLimit as jest.Mock).mockResolvedValue(true)

    const res = await POST(jsonRequest(selfServeBody(), { 'x-forwarded-for': '5.5.5.5' }))

    expect(res.status).toBe(429)
    expect(service.insertSpy).not.toHaveBeenCalled()
  })

  it('returns 500 (not a silent 201) when the insert itself errors', async () => {
    const service = mockService({ insertError: { message: 'db down' } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest(selfServeBody(), { 'x-forwarded-for': '6.6.6.6' }))

    expect(res.status).toBe(500)
    expect(notifyTeamTierLeadStaff).not.toHaveBeenCalled()
  })

  it('always uses the server-computed routingOutcome, ignoring a spoofed client value', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest(selfServeBody({ routingOutcome: 'bd' }), { 'x-forwarded-for': '7.7.7.7' })
    )

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.routingOutcome).toBe('self_serve')
    expect(service.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ routing_outcome: 'self_serve' })
    )
    expect(notifyTeamTierLeadStaff).not.toHaveBeenCalled()
  })

  it('populates submitted_by_user_id when a session exists, null otherwise', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'user-123' } } })) },
    })

    const res = await POST(jsonRequest(selfServeBody(), { 'x-forwarded-for': '8.8.8.8' }))

    expect(res.status).toBe(201)
    expect(service.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ submitted_by_user_id: 'user-123' })
    )
  })
})
