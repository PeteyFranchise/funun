import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
import { GET, POST } from './route'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  // The pre-insert block gate resolves the supplied email through the
  // service-only find_auth_user_id_by_email RPC. Every case in THIS file is
  // an unblocked pair, so the RPC resolves to no account and the gate falls
  // through without reading `blocks` at all. The gate's own behaviour — both
  // block directions, the fail-closed lookup error, and the proof that no
  // row is created — lives in __tests__/collaborator-invite-block-gate.test.ts.
  createServiceClient: jest.fn(() => ({
    rpc: jest.fn(async () => ({ data: null, error: null })),
    from: jest.fn(() => {
      throw new Error('block gate must not read blocks when no account resolves')
    }),
  })),
}))

jest.mock('@/lib/accounts/member-api-gate', () => ({
  requireMemberApiAccount: jest.fn(),
}))

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MEMBER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const HIDDEN_MEMBER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

// A session client whose `collaborators` read returns `rows`, and whose
// profile/connection reads back the identity-hint resolver.
function rosterReadClient(rows: unknown[]) {
  return jest.fn((table: string) => {
    if (table === 'collaborators') {
      return {
        select: () => ({
          eq: () => ({ is: () => ({ order: async () => ({ data: rows, error: null }) }) }),
        }),
      }
    }
    if (table === 'user_profiles') {
      return {
        select: () => ({
          in: async () => ({
            data: [
              { id: MEMBER_ID, handle: 'ericsmith', is_public: true, profile_visibility: 'public' },
              { id: HIDDEN_MEMBER_ID, handle: 'erichan', is_public: false, profile_visibility: 'public' },
            ],
            error: null,
          }),
        }),
      }
    }
    if (table === 'connections') {
      return { select: () => ({ eq: () => ({ or: async () => ({ data: [], error: null }) }) }) }
    }
    throw new Error(`unexpected read of ${table}`)
  })
}

// The service client the resolver uses for the bidirectional block set.
function blocksClient(result: { data: unknown; error: { message: string } | null }) {
  return {
    rpc: jest.fn(async () => ({ data: null, error: null })),
    from: jest.fn((table: string) => {
      if (table !== 'blocks') throw new Error(`service client must only read blocks, got ${table}`)
      return { select: () => ({ or: async () => result }) }
    }),
  }
}

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
    // jest.clearAllMocks() clears calls but NOT a mockReturnValue, so the two
    // GET cases below would otherwise leak their service client into the POST
    // cases. Re-assert the strict default every test: the POST block gate must
    // still never read `blocks` when no account resolves from the email.
    ;(createServiceClient as jest.Mock).mockReturnValue({
      rpc: jest.fn(async () => ({ data: null, error: null })),
      from: jest.fn(() => {
        throw new Error('block gate must not read blocks when no account resolves')
      }),
    })
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
    // identityHints is additive: `data` is unchanged, and an unclaimed roster
    // resolves no handles without touching a profile, connection or block.
    expect(await res.json()).toEqual({ data: rows, identityHints: {} })
    expect(isSpy).toHaveBeenCalledWith('archived_at', null)
  })

  it('GET adds only privacy-filtered identity hints alongside the untouched roster', async () => {
    const rows = [
      { id: 'row-1', user_id: USER_ID, name: 'Eric Smith', claimed_by: MEMBER_ID, archived_at: null },
      { id: 'row-2', user_id: USER_ID, name: 'Eric Chan', claimed_by: HIDDEN_MEMBER_ID, archived_at: null },
      { id: 'row-3', user_id: USER_ID, name: 'Eric', claimed_by: null, archived_at: null },
    ]

    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: auth(),
      from: rosterReadClient(rows),
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(blocksClient({ data: [], error: null }))

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: rows,
      // row-2's member is is_public = false and row-3 is unclaimed, so only
      // the public member contributes a handle — and the hint carries the
      // handle alone, never an email, legal name or rights identifier.
      identityHints: { 'row-1': { handle: 'ericsmith' } },
    })
  })

  it('GET still returns the roster, with no handles, when the block lookup fails', async () => {
    const rows = [
      { id: 'row-1', user_id: USER_ID, name: 'Eric Smith', claimed_by: MEMBER_ID, archived_at: null },
    ]

    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: auth(),
      from: rosterReadClient(rows),
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(
      blocksClient({ data: null, error: { message: 'blocks unavailable' } })
    )

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: rows, identityHints: {} })
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
