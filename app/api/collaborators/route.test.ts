import { createApiClient } from '@/lib/supabase/server'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
import { GET, POST } from './route'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
}))

jest.mock('@/lib/accounts/member-api-gate', () => ({
  requireMemberApiAccount: jest.fn(),
}))

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function postRequest(body: unknown) {
  return new Request('http://t.local/api/collaborators', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function auth() {
  return { getUser: jest.fn(async () => ({ data: { user: { id: USER_ID } } })) }
}

describe('/api/collaborators active roster identity', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(requireMemberApiAccount as jest.Mock).mockImplementation(async (_client: unknown, user: { id: string } | null) =>
      user
        ? { ok: true, user }
        : { ok: false, status: 401, error: 'Unauthorized' }
    )
  })

  it('GET returns only active rows by filtering archived_at before ordering', async () => {
    const rows = [{ id: 'active-1', user_id: USER_ID, name: 'Jamie', archived_at: null }]
    const orderSpy = jest.fn(async () => ({ data: rows, error: null }))
    const isSpy = jest.fn(() => ({ order: orderSpy }))
    const eqSpy = jest.fn(() => ({ is: isSpy }))
    const selectSpy = jest.fn(() => ({ eq: eqSpy }))

    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: auth(),
      from: jest.fn(() => ({ select: selectSpy })),
    })

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: rows })
    expect(isSpy).toHaveBeenCalledWith('archived_at', null)
  })

  it('POST reuses the active row with the same normalized email instead of inserting', async () => {
    const existing = {
      id: 'existing-1',
      user_id: USER_ID,
      name: 'Jamie Rivera',
      email: 'jamie@example.com',
      claimed_by: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      archived_at: null,
    }
    const maybeSingleSpy = jest.fn(async () => ({ data: existing, error: null }))
    const limitSpy = jest.fn(() => ({ maybeSingle: maybeSingleSpy }))
    const orderSpy = jest.fn(() => ({ limit: limitSpy }))
    const isSpy = jest.fn(() => ({ order: orderSpy }))
    const ilikeSpy = jest.fn(() => ({ is: isSpy }))
    const eqSpy = jest.fn(() => ({ ilike: ilikeSpy }))
    const selectSpy = jest.fn(() => ({ eq: eqSpy }))
    const insertSpy = jest.fn()

    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: auth(),
      from: jest.fn(() => ({ select: selectSpy, insert: insertSpy })),
    })

    const res = await POST(
      postRequest({ name: 'Jamie Rivera', email: '  JAMIE@Example.com  ' })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: existing, reused: true })
    expect(ilikeSpy).toHaveBeenCalledWith('email', 'jamie@example.com')
    expect(isSpy).toHaveBeenCalledWith('archived_at', null)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('POST refuses to insert when it cannot establish whether the email already exists', async () => {
    const maybeSingleSpy = jest.fn(async () => ({
      data: null,
      error: { message: 'lookup unavailable' },
    }))
    const limitSpy = jest.fn(() => ({ maybeSingle: maybeSingleSpy }))
    const orderSpy = jest.fn(() => ({ limit: limitSpy }))
    const isSpy = jest.fn(() => ({ order: orderSpy }))
    const ilikeSpy = jest.fn(() => ({ is: isSpy }))
    const eqSpy = jest.fn(() => ({ ilike: ilikeSpy }))
    const selectSpy = jest.fn(() => ({ eq: eqSpy }))
    const insertSpy = jest.fn()

    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: auth(),
      from: jest.fn(() => ({ select: selectSpy, insert: insertSpy })),
    })

    const res = await POST(postRequest({ name: 'Jamie Rivera', email: 'jamie@example.com' }))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Could not check the existing roster' })
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('POST inserts a new active identity when no matching email exists', async () => {
    const inserted = {
      id: 'new-1',
      user_id: USER_ID,
      name: 'Jamie Rivera',
      email: 'jamie@example.com',
    }
    const maybeSingleSpy = jest.fn(async () => ({ data: null, error: null }))
    const limitSpy = jest.fn(() => ({ maybeSingle: maybeSingleSpy }))
    const orderSpy = jest.fn(() => ({ limit: limitSpy }))
    const isSpy = jest.fn(() => ({ order: orderSpy }))
    const ilikeSpy = jest.fn(() => ({ is: isSpy }))
    const eqSpy = jest.fn(() => ({ ilike: ilikeSpy }))
    const selectSpy = jest.fn(() => ({ eq: eqSpy }))
    const singleSpy = jest.fn(async () => ({ data: inserted, error: null }))
    const insertSelectSpy = jest.fn(() => ({ single: singleSpy }))
    const insertSpy = jest.fn(() => ({ select: insertSelectSpy }))

    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: auth(),
      from: jest.fn(() => ({ select: selectSpy, insert: insertSpy })),
    })

    const res = await POST(postRequest({ name: 'Jamie Rivera', email: 'JAMIE@EXAMPLE.COM' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: inserted, reused: false })
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        name: 'Jamie Rivera',
        email: 'jamie@example.com',
      })
    )
  })
})
