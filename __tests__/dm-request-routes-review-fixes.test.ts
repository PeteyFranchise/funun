import { POST as acceptRequest } from '@/app/api/dm/request/accept/[threadId]/route'
import { POST as declineRequest } from '@/app/api/dm/request/decline/[threadId]/route'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(),
}))

const USER_ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  jest.clearAllMocks()
})

function makeUpdateChain(data: unknown) {
  const chain = {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
  }
  return chain
}

describe('message request transition routes — review fixes', () => {
  it('accept route enforces requester exclusion inside the UPDATE filter', async () => {
    const chain = makeUpdateChain(null)
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }) },
      from: jest.fn(() => chain),
    })

    const res = await acceptRequest(new Request('http://test.local'), {
      params: Promise.resolve({ threadId: 'thread-1' }),
    })

    expect(res.status).toBe(404)
    expect(chain.update).toHaveBeenCalledWith({ status: 'direct' })
    expect(chain.eq).toHaveBeenCalledWith('id', 'thread-1')
    expect(chain.eq).toHaveBeenCalledWith('status', 'pending')
    expect(chain.neq).toHaveBeenCalledWith('requester_id', USER_ID)
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('decline route enforces requester exclusion inside the UPDATE filter', async () => {
    const chain = makeUpdateChain(null)
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }) },
      from: jest.fn(() => chain),
    })

    const res = await declineRequest(new Request('http://test.local'), {
      params: Promise.resolve({ threadId: 'thread-1' }),
    })

    expect(res.status).toBe(404)
    expect(chain.update).toHaveBeenCalledWith({ status: 'declined' })
    expect(chain.eq).toHaveBeenCalledWith('id', 'thread-1')
    expect(chain.eq).toHaveBeenCalledWith('status', 'pending')
    expect(chain.neq).toHaveBeenCalledWith('requester_id', USER_ID)
  })
})
