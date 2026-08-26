import { PATCH } from '@/app/api/connections/route'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(),
}))

function jsonRequest(body: unknown) {
  return new Request('http://test.local/api/connections', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('PATCH /api/connections pending-state guard', () => {
  it('does not re-accept a non-pending connection or run notification side effects', async () => {
    const connectionQuery: {
      eq: jest.Mock
      select: jest.Mock
      maybeSingle: jest.Mock
    } = {
      eq: jest.fn(),
      select: jest.fn(),
      maybeSingle: jest.fn(),
    }
    connectionQuery.eq.mockReturnValue(connectionQuery)
    connectionQuery.select.mockReturnValue(connectionQuery)
    connectionQuery.maybeSingle.mockResolvedValue({ data: null, error: null })

    const update = jest.fn(() => connectionQuery)
    const from = jest.fn((table: string) => {
      if (table === 'connections') return { update }
      throw new Error(`Unexpected table: ${table}`)
    })

    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: {
        getUser: jest.fn(async () => ({ data: { user: { id: 'addressee-1' } } })),
      },
      from,
    })

    const res = await PATCH(jsonRequest({ connectionId: 'connection-1', action: 'accept' }))

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Connection not found or not permitted' })
    expect(update).toHaveBeenCalledWith({ status: 'accepted' })
    expect(connectionQuery.eq).toHaveBeenCalledWith('id', 'connection-1')
    expect(connectionQuery.eq).toHaveBeenCalledWith('status', 'pending')
    expect(connectionQuery.select).toHaveBeenCalledWith('id, requester_id, addressee_id')
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
  })
})
