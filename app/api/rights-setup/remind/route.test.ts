import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { POST } from './route'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

function mockAuth(user: { id: string } | null) {
  ;(createApiClient as jest.Mock).mockResolvedValue({
    auth: { getUser: jest.fn(async () => ({ data: { user } })) },
  })
}

function mockService(result: { data: { id: string } | null; error: { message: string } | null }) {
  const maybeSingle = jest.fn(async () => result)
  const select = jest.fn(() => ({ maybeSingle }))
  const eq = jest.fn(() => ({ select }))
  const update = jest.fn(() => ({ eq }))
  const from = jest.fn(() => ({ update }))
  const service = { from, update, eq, select, maybeSingle }
  ;(createServiceClient as jest.Mock).mockReturnValue(service)
  return service
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers().setSystemTime(new Date('2026-09-02T12:00:00.000Z'))
})

afterEach(() => jest.useRealTimers())

describe('POST /api/rights-setup/remind', () => {
  it('requires authentication before creating a service client', async () => {
    mockAuth(null)

    const response = await POST()

    expect(response.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('sets a server-owned seven-day reminder for only the verified user', async () => {
    mockAuth({ id: 'user-1' })
    const service = mockService({ data: { id: 'user-1' }, error: null })

    const response = await POST()

    expect(response.status).toBe(200)
    expect(service.from).toHaveBeenCalledWith('user_profiles')
    expect(service.update).toHaveBeenCalledWith({
      rights_setup_remind_at: '2026-09-09T12:00:00.000Z',
    })
    expect(service.eq).toHaveBeenCalledWith('id', 'user-1')
    await expect(response.json()).resolves.toEqual({
      ok: true,
      remindAt: '2026-09-09T12:00:00.000Z',
    })
  })

  it('does not report success when no profile row was updated', async () => {
    mockAuth({ id: 'user-2' })
    mockService({ data: null, error: null })

    const response = await POST()

    expect(response.status).toBe(500)
  })
})
