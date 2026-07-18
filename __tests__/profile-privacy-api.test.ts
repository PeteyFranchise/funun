import { validateProfileVisibilityUpdate } from '@/lib/trust-safety/visibility'
import { PATCH as visibilityPATCH } from '@/app/api/profile/visibility/route'
import { PATCH as profilePATCH } from '@/app/api/profile/route'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import {
  isDiscoverRowVisible,
  loadDiscoverResults,
  DISCOVER_PUBLIC_COLUMNS,
} from '@/lib/green-room/discover'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const OWNER_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function jsonRequest(url: string, body: unknown, method = 'PATCH') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('validateProfileVisibilityUpdate', () => {
  it('accepts a valid profileVisibility', () => {
    expect(validateProfileVisibilityUpdate({ profileVisibility: 'connections_only' })).toEqual({
      ok: true,
      value: { profile_visibility: 'connections_only' },
    })
  })

  it('accepts a valid openToVisibility', () => {
    expect(validateProfileVisibilityUpdate({ openToVisibility: 'hidden' })).toEqual({
      ok: true,
      value: { open_to_visibility: 'hidden' },
    })
  })

  it('accepts both fields together', () => {
    expect(
      validateProfileVisibilityUpdate({ profileVisibility: 'public', openToVisibility: 'connections' })
    ).toEqual({ ok: true, value: { profile_visibility: 'public', open_to_visibility: 'connections' } })
  })

  it('rejects an invalid profileVisibility value', () => {
    expect(validateProfileVisibilityUpdate({ profileVisibility: 'friends_only' }).ok).toBe(false)
  })

  it('rejects an invalid openToVisibility value', () => {
    expect(validateProfileVisibilityUpdate({ openToVisibility: 'everyone' }).ok).toBe(false)
  })

  it('rejects an empty body', () => {
    expect(validateProfileVisibilityUpdate({}).ok).toBe(false)
  })
})

describe('PATCH /api/profile/visibility', () => {
  it('requires authentication', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: null } })) },
    })
    const res = await visibilityPATCH(jsonRequest('http://t.local/api/profile/visibility', { profileVisibility: 'public' }))
    expect(res.status).toBe(401)
  })

  it('rejects an invalid body before touching the service client', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: OWNER_UUID } } })) },
    })
    const res = await visibilityPATCH(
      jsonRequest('http://t.local/api/profile/visibility', { profileVisibility: 'nonsense' })
    )
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('writes only the two visibility columns for the authenticated owner', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: OWNER_UUID } } })) },
    })
    const eqSpy = jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(async () => ({
          data: { id: OWNER_UUID, profile_visibility: 'connections_only', open_to_visibility: 'hidden' },
          error: null,
        })),
      })),
    }))
    const updateSpy = jest.fn((update: unknown) => {
      expect(update).toEqual({ profile_visibility: 'connections_only', open_to_visibility: 'hidden' })
      return { eq: eqSpy }
    })
    ;(createServiceClient as jest.Mock).mockReturnValue({ from: jest.fn(() => ({ update: updateSpy })) })

    const res = await visibilityPATCH(
      jsonRequest('http://t.local/api/profile/visibility', {
        profileVisibility: 'connections_only',
        openToVisibility: 'hidden',
      })
    )
    expect(res.status).toBe(200)
    expect(eqSpy).toHaveBeenCalledWith('id', OWNER_UUID)
    const body = await res.json()
    expect(body.data).toEqual({ id: OWNER_UUID, profile_visibility: 'connections_only', open_to_visibility: 'hidden' })
  })
})

describe('PATCH /api/profile — member-owned route cannot modify verification/visibility fields', () => {
  it('silently drops verified/verified_at/verified_by/profile_visibility/open_to_visibility from the body', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: OWNER_UUID } } })) },
    })
    let capturedUpdate: Record<string, unknown> | null = null
    const singleSpy = jest.fn(async () => ({ data: { id: OWNER_UUID, artist_name: 'Nova' }, error: null }))
    const selectSpy = jest.fn(() => ({ single: singleSpy }))
    const eqSpy = jest.fn(() => ({ select: selectSpy }))
    const updateSpy = jest.fn((update: Record<string, unknown>) => {
      capturedUpdate = update
      return { eq: eqSpy }
    })
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({ update: updateSpy })),
    })

    const res = await profilePATCH(
      jsonRequest('http://t.local/api/profile', {
        artist_name: 'Nova',
        verified: true,
        verified_at: '2026-07-18T00:00:00Z',
        verified_by: OWNER_UUID,
        profile_visibility: 'connections_only',
        open_to_visibility: 'hidden',
      })
    )
    expect(res.status).toBe(200)
    expect(capturedUpdate).toEqual({ artist_name: 'Nova' })
    expect(capturedUpdate).not.toHaveProperty('verified')
    expect(capturedUpdate).not.toHaveProperty('verified_at')
    expect(capturedUpdate).not.toHaveProperty('verified_by')
    expect(capturedUpdate).not.toHaveProperty('profile_visibility')
    expect(capturedUpdate).not.toHaveProperty('open_to_visibility')
  })
})

// ─── SAFETY-04: People Search enforcement (lib/green-room/discover.ts) ─────

function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    artist_name: 'Nova',
    handle: 'nova',
    avatar_url: null,
    bio: 'Producer and engineer',
    genre: 'House',
    genres: ['house'],
    location: 'Berlin',
    industry_roles: [],
    roles: [],
    open_to: ['collabs'],
    member_type: 'artist',
    verified: false,
    is_public: true,
    profile_visibility: 'public',
    open_to_visibility: 'public',
    created_at: '2026-07-10T00:00:00.000Z',
    ...overrides,
  }
}

describe('isDiscoverRowVisible', () => {
  it('is visible when public regardless of connection', () => {
    expect(isDiscoverRowVisible(profileRow() as never, false)).toBe(true)
    expect(isDiscoverRowVisible(profileRow() as never, true)).toBe(true)
  })

  it('is hidden from a non-connection when connections_only', () => {
    expect(isDiscoverRowVisible(profileRow({ profile_visibility: 'connections_only' }) as never, false)).toBe(false)
  })

  it('is visible to an accepted connection when connections_only', () => {
    expect(isDiscoverRowVisible(profileRow({ profile_visibility: 'connections_only' }) as never, true)).toBe(true)
  })
})

describe('loadDiscoverResults — SAFETY-04 visibility filtering', () => {
  function tableBuilder(rows: unknown[]) {
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'neq', 'order', 'limit', 'in', 'not', 'contains', 'ilike', 'textSearch', 'or']) {
      builder[m] = jest.fn(() => builder)
    }
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null })
    return builder
  }

  function makeClients(mainRows: unknown[], opts: { connections?: unknown[] } = {}) {
    const session = {
      from: jest.fn((table: string) => {
        if (table === 'connections') return tableBuilder(opts.connections ?? [])
        if (table === 'follows') return tableBuilder([])
        if (table === 'artist_profiles') return tableBuilder(mainRows)
        return tableBuilder([])
      }),
    }
    const service = { from: jest.fn(() => tableBuilder([])) }
    return { session, service }
  }

  const BASE_FILTERS = {
    q: null,
    role: null,
    openTo: null,
    genre: null,
    location: null,
    relationship: null,
    capability: null,
  }

  it('excludes a connections_only profile for a non-connection viewer', async () => {
    const { session, service } = makeClients([profileRow({ profile_visibility: 'connections_only' })])
    const out = await loadDiscoverResults(session as never, service as never, 'me', BASE_FILTERS as never, null, 20)
    expect(out.results).toEqual([])
  })

  it('includes a connections_only profile for an accepted connection', async () => {
    const row = profileRow({ id: 'friend-1', profile_visibility: 'connections_only' })
    const { session, service } = makeClients([row], {
      connections: [{ requester_id: 'me', addressee_id: 'friend-1' }],
    })
    const out = await loadDiscoverResults(session as never, service as never, 'me', BASE_FILTERS as never, null, 20)
    expect(out.results.map(r => r.id)).toEqual(['friend-1'])
  })

  it('blanks openTo in the result when open_to_visibility is hidden', async () => {
    const row = profileRow({ open_to_visibility: 'hidden' })
    const { session, service } = makeClients([row])
    const out = await loadDiscoverResults(session as never, service as never, 'me', BASE_FILTERS as never, null, 20)
    expect(out.results).toHaveLength(1)
    expect(out.results[0].openTo).toEqual([])
  })

  it('DISCOVER_PUBLIC_COLUMNS includes the two visibility columns', () => {
    expect(DISCOVER_PUBLIC_COLUMNS).toContain('profile_visibility')
    expect(DISCOVER_PUBLIC_COLUMNS).toContain('open_to_visibility')
  })
})
