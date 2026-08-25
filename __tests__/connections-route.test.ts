import { PATCH } from '@/app/api/connections/route'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { linkClaimedCollaborators } from '@/lib/collaborators/link-claim'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(),
}))

jest.mock('@/lib/collaborators/link-claim', () => ({
  linkClaimedCollaborators: jest.fn(),
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

// ─── PATCH accept-hook: linkClaimedCollaborators (260825-m2k Task 3) ──────
const REQUESTER_ID = 'requester-1'
const MEMBER_ID = 'member-1'
const MEMBER_EMAIL = 'jamie@example.com'

function mockAcceptSupabase(targetStatus: 'accepted' | 'declined') {
  const connectionQuery: any = {
    eq: jest.fn(),
    select: jest.fn(),
    maybeSingle: jest.fn(),
  }
  connectionQuery.eq.mockReturnValue(connectionQuery)
  connectionQuery.select.mockReturnValue(connectionQuery)
  connectionQuery.maybeSingle.mockResolvedValue({
    data: { id: 'connection-1', requester_id: REQUESTER_ID, addressee_id: MEMBER_ID },
    error: null,
  })

  const update = jest.fn(() => connectionQuery)

  const actorQuery: any = { eq: jest.fn(), maybeSingle: jest.fn() }
  actorQuery.eq.mockReturnValue(actorQuery)
  actorQuery.maybeSingle.mockResolvedValue({
    data: { artist_name: 'Jamie Rivera', avatar_url: null, handle: 'jamie' },
    error: null,
  })
  const actorSelect = jest.fn(() => actorQuery)

  const from = jest.fn((table: string) => {
    if (table === 'connections') return { update }
    if (table === 'user_profiles') return { select: actorSelect }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: MEMBER_ID, email: MEMBER_EMAIL } } })),
    },
    from,
  }
}

function mockService() {
  const notifQuery: any = { eq: jest.fn() }
  notifQuery.eq.mockReturnValue(notifQuery)
  const update = jest.fn(() => notifQuery)
  const from = jest.fn((table: string) => {
    if (table === 'notifications') return { update }
    throw new Error(`Unexpected table: ${table}`)
  })
  return { from }
}

describe('PATCH /api/connections accept hook — linkClaimedCollaborators', () => {
  it('calls linkClaimedCollaborators exactly once with session-derived values on accept', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockAcceptSupabase('accepted'))
    ;(createServiceClient as jest.Mock).mockReturnValue(mockService())
    ;(linkClaimedCollaborators as jest.Mock).mockResolvedValue(1)

    const res = await PATCH(jsonRequest({ connectionId: 'connection-1', action: 'accept' }))

    expect(res.status).toBe(200)
    expect(linkClaimedCollaborators).toHaveBeenCalledTimes(1)
    expect(linkClaimedCollaborators).toHaveBeenCalledWith(
      expect.anything(),
      { ownerUserId: REQUESTER_ID, memberUserId: MEMBER_ID, memberEmail: MEMBER_EMAIL }
    )
  })

  it('calls it zero times on decline', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockAcceptSupabase('declined'))
    ;(createServiceClient as jest.Mock).mockReturnValue(mockService())

    const res = await PATCH(jsonRequest({ connectionId: 'connection-1', action: 'decline' }))

    expect(res.status).toBe(200)
    expect(linkClaimedCollaborators).not.toHaveBeenCalled()
  })

  it('a throwing linker leaves the accept response unchanged', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockAcceptSupabase('accepted'))
    ;(createServiceClient as jest.Mock).mockReturnValue(mockService())
    ;(linkClaimedCollaborators as jest.Mock).mockRejectedValue(new Error('boom'))

    const res = await PATCH(jsonRequest({ connectionId: 'connection-1', action: 'accept' }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { ok: true, status: 'accepted' } })
  })
})
