import type { SupabaseClient } from '@supabase/supabase-js'
import { createConnectionRequest } from '@/lib/social/connect-request'
import { createNotification } from '@/lib/notifications'
import { isBlockedRelativeTo } from '@/lib/trust-safety/block-check'

// ─── lib/social/connect-request.ts ─────────────────────────────────────────
// Extracted out of app/api/connections/route.ts's POST handler (260825-m2k
// Task 1). Follows the chainable query-builder mock style already used in
// app/api/collaborators/quick-invite/route.test.ts.

jest.mock('@/lib/trust-safety/block-check', () => ({
  ...jest.requireActual('@/lib/trust-safety/block-check'),
  isBlockedRelativeTo: jest.fn(async () => false),
}))

jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(async () => undefined),
}))

const REQUESTER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ADDRESSEE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const CONNECTION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

// A chainable query-builder mock covering the exact call shape the module
// uses: .select().eq().maybeSingle() for the actor read, .select().or().in()
// .limit().maybeSingle() for the duplicate-active pre-check, and
// .insert().select().single() for the insert path.
function mockSupabase(
  options: {
    existingActive?: { id: string; status: string } | null
    existingError?: { message: string } | null
    insertResult?: { data: { id: string } | null; error: { message: string; code?: string } | null }
    actorRow?: Record<string, unknown> | null
  } = {}
) {
  const {
    existingActive = null,
    existingError = null,
    insertResult = { data: { id: CONNECTION_ID }, error: null },
    actorRow = { artist_name: 'Jordan Ellis', avatar_url: null, handle: 'jordan' },
  } = options

  const singleSpy = jest.fn(async () => insertResult)
  const insertSelectSpy = jest.fn(() => ({ single: singleSpy }))
  const insertSpy = jest.fn(() => ({ select: insertSelectSpy }))

  const dupMaybeSingleSpy = jest.fn(async () => ({ data: existingActive, error: existingError }))
  const limitSpy = jest.fn(() => ({ maybeSingle: dupMaybeSingleSpy }))
  const inSpy = jest.fn(() => ({ limit: limitSpy }))
  const orSpy = jest.fn(() => ({ in: inSpy }))
  const dupSelectSpy = jest.fn(() => ({ or: orSpy }))

  const actorMaybeSingleSpy = jest.fn(async () => ({ data: actorRow, error: null }))
  const actorEqSpy = jest.fn(() => ({ maybeSingle: actorMaybeSingleSpy }))
  const actorSelectSpy = jest.fn(() => ({ eq: actorEqSpy }))

  const from = jest.fn((table: string) => {
    if (table === 'connections') return { select: dupSelectSpy, insert: insertSpy }
    if (table === 'user_profiles') return { select: actorSelectSpy }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from, insertSpy, singleSpy } as unknown as SupabaseClient & {
    insertSpy: jest.Mock
    singleSpy: jest.Mock
  }
}

function fakeService(): SupabaseClient {
  return { from: jest.fn() } as unknown as SupabaseClient
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(isBlockedRelativeTo as jest.Mock).mockResolvedValue(false)
})

describe('createConnectionRequest', () => {
  it('returns kind self when requester equals addressee', async () => {
    const supabase = mockSupabase()
    const service = fakeService()

    const result = await createConnectionRequest(supabase, service, {
      requesterId: REQUESTER_ID,
      addresseeId: REQUESTER_ID,
    })

    expect(result).toEqual({ kind: 'self' })
    expect(isBlockedRelativeTo).not.toHaveBeenCalled()
  })

  it('returns kind blocked when isBlockedRelativeTo is true, before the duplicate-active lookup runs', async () => {
    ;(isBlockedRelativeTo as jest.Mock).mockResolvedValue(true)
    const supabase = mockSupabase()
    const service = fakeService()

    const result = await createConnectionRequest(supabase, service, {
      requesterId: REQUESTER_ID,
      addresseeId: ADDRESSEE_ID,
    })

    expect(result).toEqual({ kind: 'blocked' })
    expect(supabase.from).not.toHaveBeenCalledWith('connections')
  })

  it('returns kind pending when an active row exists with status pending', async () => {
    const supabase = mockSupabase({ existingActive: { id: 'x', status: 'pending' } })
    const service = fakeService()

    const result = await createConnectionRequest(supabase, service, {
      requesterId: REQUESTER_ID,
      addresseeId: ADDRESSEE_ID,
    })

    expect(result).toEqual({ kind: 'pending' })
  })

  it('returns kind connected when an active row exists with status accepted', async () => {
    const supabase = mockSupabase({ existingActive: { id: 'x', status: 'accepted' } })
    const service = fakeService()

    const result = await createConnectionRequest(supabase, service, {
      requesterId: REQUESTER_ID,
      addresseeId: ADDRESSEE_ID,
    })

    expect(result).toEqual({ kind: 'connected' })
  })

  it('returns kind created with the new connection id and the actor name on the happy path', async () => {
    const supabase = mockSupabase()
    const service = fakeService()

    const result = await createConnectionRequest(supabase, service, {
      requesterId: REQUESTER_ID,
      addresseeId: ADDRESSEE_ID,
      note: 'Would love to add you as a collaborator',
    })

    expect(result).toEqual({ kind: 'created', connectionId: CONNECTION_ID, actorName: 'Jordan Ellis' })
    expect(supabase.insertSpy).toHaveBeenCalledWith({
      requester_id: REQUESTER_ID,
      addressee_id: ADDRESSEE_ID,
      note: 'Would love to add you as a collaborator',
    })
    expect(createNotification).toHaveBeenCalledTimes(1)
  })

  it('maps a 23505 insert error to kind connected-conflict', async () => {
    const supabase = mockSupabase({
      insertResult: { data: null, error: { message: 'duplicate key', code: '23505' } },
    })
    const service = fakeService()

    const result = await createConnectionRequest(supabase, service, {
      requesterId: REQUESTER_ID,
      addresseeId: ADDRESSEE_ID,
    })

    expect(result).toEqual({ kind: 'connected-conflict' })
  })

  it('maps any other insert error to kind error', async () => {
    const supabase = mockSupabase({
      insertResult: { data: null, error: { message: 'insert boom' } },
    })
    const service = fakeService()

    const result = await createConnectionRequest(supabase, service, {
      requesterId: REQUESTER_ID,
      addresseeId: ADDRESSEE_ID,
    })

    expect(result).toEqual({ kind: 'error', message: 'insert boom' })
  })

  it('a thrown notification failure does not change a created outcome', async () => {
    ;(createNotification as jest.Mock).mockRejectedValue(new Error('notif down'))
    const supabase = mockSupabase()
    const service = fakeService()

    const result = await createConnectionRequest(supabase, service, {
      requesterId: REQUESTER_ID,
      addresseeId: ADDRESSEE_ID,
    })

    expect(result).toEqual({ kind: 'created', connectionId: CONNECTION_ID, actorName: 'Jordan Ellis' })
  })
})
