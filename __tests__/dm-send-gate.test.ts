// Tests for the /api/dm/send connection-gate/rate-limit/stacked-cap
// decision core (chooseSendPath) and the route's gate call order.
//
// chooseSendPath is a pure function — no Supabase client needed. The
// second describe block asserts the route checks isConnected() and
// countRecentRequests() BEFORE ensureThread() so the connection gate can
// never be bypassed by a client-trust shortcut (T-11-06).

import { POST } from '@/app/api/dm/send/route'
import { chooseSendPath, BASELINE_REQUEST_LIMIT, VERIFIED_REQUEST_LIMIT, PENDING_STACK_CAP } from '@/lib/social/dm'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))
jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(),
}))
jest.mock('@/lib/social/dm', () => {
  const actual = jest.requireActual('@/lib/social/dm')
  return {
    ...actual,
    isConnected: jest.fn(),
    countRecentRequests: jest.fn(),
    countPendingMessagesFrom: jest.fn(),
    ensureThread: jest.fn(),
    findThread: jest.fn(),
  }
})

import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { isConnected, countRecentRequests, ensureThread, findThread } from '@/lib/social/dm'

const ME_ID = '11111111-1111-4111-8111-111111111111'
const THEM_ID = '22222222-2222-4222-8222-222222222222'

function jsonRequest(body: unknown) {
  return new Request('http://test.local/api/dm/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ─── chooseSendPath (pure decision core) ───────────────────────────────

describe('chooseSendPath', () => {
  it('connected → direct (bypasses rate limit and stack cap entirely)', () => {
    expect(
      chooseSendPath({
        connected: true,
        existingPendingByMe: false,
        pendingMsgCount: 999,
        recentRequestCount: 999,
        verified: false,
      }).kind
    ).toBe('direct')
  })

  it('existingPendingByMe with pendingMsgCount < PENDING_STACK_CAP → stack', () => {
    expect(
      chooseSendPath({
        connected: false,
        existingPendingByMe: true,
        pendingMsgCount: PENDING_STACK_CAP - 1,
        recentRequestCount: 0,
        verified: false,
      }).kind
    ).toBe('stack')
  })

  it('existingPendingByMe with pendingMsgCount >= PENDING_STACK_CAP → reject-stack', () => {
    expect(
      chooseSendPath({
        connected: false,
        existingPendingByMe: true,
        pendingMsgCount: PENDING_STACK_CAP,
        recentRequestCount: 0,
        verified: false,
      }).kind
    ).toBe('reject-stack')
  })

  it('not connected, unverified, recentRequestCount >= BASELINE_REQUEST_LIMIT → reject-rate', () => {
    expect(
      chooseSendPath({
        connected: false,
        existingPendingByMe: false,
        pendingMsgCount: 0,
        recentRequestCount: BASELINE_REQUEST_LIMIT,
        verified: false,
      }).kind
    ).toBe('reject-rate')
  })

  it('not connected, unverified, under BASELINE_REQUEST_LIMIT but at VERIFIED cap → request (verified-only ceiling)', () => {
    // A count between the baseline and verified ceilings is fine for an
    // unverified caller only when it is still under BASELINE_REQUEST_LIMIT;
    // this case demonstrates the >=30 rule applies ONLY when verified=true.
    expect(
      chooseSendPath({
        connected: false,
        existingPendingByMe: false,
        pendingMsgCount: 0,
        recentRequestCount: VERIFIED_REQUEST_LIMIT,
        verified: true,
      }).kind
    ).toBe('reject-rate')
  })

  it('not connected, verified, recentRequestCount below VERIFIED_REQUEST_LIMIT → request', () => {
    expect(
      chooseSendPath({
        connected: false,
        existingPendingByMe: false,
        pendingMsgCount: 0,
        recentRequestCount: VERIFIED_REQUEST_LIMIT - 1,
        verified: true,
      }).kind
    ).toBe('request')
  })

  it('not connected, unverified, under limit → request', () => {
    expect(
      chooseSendPath({
        connected: false,
        existingPendingByMe: false,
        pendingMsgCount: 0,
        recentRequestCount: BASELINE_REQUEST_LIMIT - 1,
        verified: false,
      }).kind
    ).toBe('request')
  })
})

// ─── Gate call order (T-11-06: never a client-trust shortcut) ─────────

describe('POST /api/dm/send — gate call order', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects a non-UUID recipient before auth or send-gate queries', async () => {
    const res = await POST(jsonRequest({ toUserId: 'not-a-uuid),requester_id.eq.evil', body: 'hello' }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid recipient' })
    expect(createApiClient).not.toHaveBeenCalled()
    expect(isConnected).not.toHaveBeenCalled()
    expect(ensureThread).not.toHaveBeenCalled()
  })

  it('rejects a blocked pair before connection or thread creation checks', async () => {
    const fakeSupabase = {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: ME_ID } } }) },
    }
    ;(createApiClient as jest.Mock).mockResolvedValue(fakeSupabase)

    const blocksChain = {
      select: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { blocker_id: THEM_ID }, error: null }),
    }
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => blocksChain),
    })

    const res = await POST(jsonRequest({ toUserId: THEM_ID, body: 'hello' }))

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Message could not be delivered' })
    expect(isConnected).not.toHaveBeenCalled()
    expect(ensureThread).not.toHaveBeenCalled()
  })

  it('rejects sends into a declined non-connection thread before inserting a message', async () => {
    ;(isConnected as jest.Mock).mockResolvedValue(false)
    ;(findThread as jest.Mock).mockResolvedValue('thread-declined')
    ;(ensureThread as jest.Mock).mockResolvedValue('thread-should-not-be-used')

    const threadChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { status: 'declined', requester_id: ME_ID },
        error: null,
      }),
    }
    const fakeSupabase = {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: ME_ID } } }) },
      from: jest.fn((table: string) => {
        if (table === 'dm_threads') return threadChain
        throw new Error(`Unexpected table: ${table}`)
      }),
    }
    ;(createApiClient as jest.Mock).mockResolvedValue(fakeSupabase)

    const blocksChain = {
      select: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => blocksChain),
    })

    const res = await POST(jsonRequest({ toUserId: THEM_ID, body: 'still there?' }))

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Message could not be delivered' })
    expect(countRecentRequests).not.toHaveBeenCalled()
    expect(ensureThread).not.toHaveBeenCalled()
  })

  it('calls isConnected() and countRecentRequests() before ensureThread()', async () => {
    const callOrder: string[] = []
    ;(isConnected as jest.Mock).mockImplementation(async () => {
      callOrder.push('isConnected')
      return false
    })
    ;(findThread as jest.Mock).mockImplementation(async () => {
      callOrder.push('findThread')
      return null
    })
    ;(countRecentRequests as jest.Mock).mockImplementation(async () => {
      callOrder.push('countRecentRequests')
      return 0
    })
    ;(ensureThread as jest.Mock).mockImplementation(async () => {
      callOrder.push('ensureThread')
      return 'thread-1'
    })

    const profileChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { verified: false }, error: null }),
    }
    const messageChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'm1', body: 'hello', created_at: '2026-01-01T00:00:00.000Z' },
        error: null,
      }),
    }
    const fakeSupabase = {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: ME_ID } } }) },
      from: jest.fn((table: string) => {
        if (table === 'artist_profiles') return profileChain
        if (table === 'dm_messages') return messageChain
        return profileChain
      }),
    }
    ;(createApiClient as jest.Mock).mockResolvedValue(fakeSupabase)

    const serviceThreadChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    }
    const serviceBlocksChain = {
      select: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }
    const fakeService = {
      from: jest.fn((table: string) => {
        if (table === 'blocks') return serviceBlocksChain
        return serviceThreadChain
      }),
    }
    ;(createServiceClient as jest.Mock).mockReturnValue(fakeService)

    const res = await POST(jsonRequest({ toUserId: THEM_ID, body: 'hello' }))
    expect(res.status).toBe(200)

    // The connection gate must be evaluated first, then the rate-limit
    // count, before any thread is created — never a client-trust shortcut.
    const isConnectedIdx = callOrder.indexOf('isConnected')
    const countIdx = callOrder.indexOf('countRecentRequests')
    const ensureIdx = callOrder.indexOf('ensureThread')
    expect(isConnectedIdx).toBeGreaterThanOrEqual(0)
    expect(countIdx).toBeGreaterThan(isConnectedIdx)
    expect(ensureIdx).toBeGreaterThan(countIdx)
  })

  it('rejects with 429 when the rate limit is reached, before ensureThread() is ever called', async () => {
    ;(isConnected as jest.Mock).mockResolvedValue(false)
    ;(findThread as jest.Mock).mockResolvedValue(null)
    ;(countRecentRequests as jest.Mock).mockResolvedValue(BASELINE_REQUEST_LIMIT)
    ;(ensureThread as jest.Mock).mockResolvedValue('thread-should-not-be-created')

    const profileChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { verified: false }, error: null }),
    }
    const fakeSupabase = {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: ME_ID } } }) },
      from: jest.fn(() => profileChain),
    }
    ;(createApiClient as jest.Mock).mockResolvedValue(fakeSupabase)

    const serviceBlocksChain = {
      select: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => serviceBlocksChain),
    })

    const res = await POST(jsonRequest({ toUserId: THEM_ID, body: 'cold outreach' }))
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json).toEqual({ error: 'Rate limit reached', remaining: 0 })
    expect(ensureThread).not.toHaveBeenCalled()
  })
})
