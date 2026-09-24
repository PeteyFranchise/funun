// Quick task 260923-block-lookup-fail-open.
//
// The defect: `loadBlockedIds` (lib/green-room/discover.ts) destructured only
// `{ data }` and `(data ?? [])` turned a FAILED `blocks` query into an empty
// set — "nobody is blocked". Every gate built on it therefore PERMITTED the
// action the moment the query failed: nine write routes, the buyer
// catalogue, People Search, and both profile renders.
//
// These assertions are deliberately about the SURFACED BEHAVIOUR of each
// caller, not about the return shape of the helper:
//
//   1. `loadBlockedIds` throws — and its message can never carry a Postgres
//      string, because for every caller that simply lets it propagate that
//      message is the only thing a client can see.
//   2. Each gated write route answers with the byte-identical generic
//      BLOCKED_ACTION_ERROR body a real block produces (13-03's rule: no
//      distinguishable "you are blocked" state anywhere — and a database
//      error string is distinguishable), and
//   3. THE WRITE IS NEVER PERFORMED. Same reasoning as the #96 suite: a
//      route that inserts and then apologises has already done the thing.
//   4. Both server components refuse in their own already-established
//      refusal shape — /u/[handle] with the same notFound() a real block
//      renders, /profile by rendering nothing at all — and neither names a
//      block nor leaks database text.

import { loadBlockedIds, BLOCK_LOOKUP_FAILED } from '@/lib/green-room/discover'
import {
  mustBlockActionBetween,
  mustBlockActionForEmail,
  BLOCKED_ACTION_ERROR,
  BLOCKED_ACTION_STATUS,
} from '@/lib/trust-safety/block-check'

// The wall route rate-limits before its block gate; mirror the same stub
// __tests__/block-enforcement.test.ts uses so the gate is what is exercised.
jest.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => false),
}))

// A real Postgres error string, chosen because it is one `blocks` can
// actually produce (see the Pitfall 3 note in lib/deals/catalog-query.ts).
// Every "did anything leak?" assertion below greps for these fragments.
const PG_ERROR = { message: 'invalid input syntax for type uuid: "not-a-uuid"' }
const PG_FRAGMENTS = ['invalid input syntax', 'uuid', 'row-level security', 'postgres']

const VIEWER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function expectDiscloseNothing(surfaced: string) {
  const lowered = surfaced.toLowerCase()
  expect(lowered).not.toContain('block')
  for (const fragment of PG_FRAGMENTS) {
    expect(lowered).not.toContain(fragment)
  }
}

// Chainable, thenable PostgREST builder spy — same shape as
// __tests__/block-enforcement.test.ts's, with an error channel added.
function tableBuilder(rows: unknown[], error: { message: string } | null = null) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'or', 'order', 'limit', 'in', 'is', 'ilike']) {
    builder[m] = jest.fn(() => builder)
  }
  builder.maybeSingle = jest.fn(async () => ({ data: error ? null : rows[0] ?? null, error }))
  builder.single = jest.fn(async () => ({ data: error ? null : rows[0] ?? null, error }))
  builder.then = (resolve: (v: unknown) => void) =>
    resolve({ data: error ? null : rows, error })
  return builder
}

const failingBlocksClient = () => ({ from: jest.fn(() => tableBuilder([], PG_ERROR)) })

// ─────────────────────────────────────────────────────────────────────────
// 1. The helper itself
// ─────────────────────────────────────────────────────────────────────────
describe('lib/green-room/discover — loadBlockedIds', () => {
  it('THROWS when the blocks query errors — it must not answer "nobody is blocked"', async () => {
    await expect(loadBlockedIds(failingBlocksClient() as never, VIEWER)).rejects.toThrow()
  })

  it('throws a generic message that names no block and carries no database text', async () => {
    // Every caller that simply propagates surfaces THIS string, so the
    // no-disclosure rule has to hold at the source, not only per-caller.
    await expect(loadBlockedIds(failingBlocksClient() as never, VIEWER)).rejects.toThrow(
      BLOCK_LOOKUP_FAILED
    )
    expectDiscloseNothing(BLOCK_LOOKUP_FAILED)
  })

  it('keeps the driver error on .cause so the failure is still debuggable server-side', async () => {
    const caught: unknown = await loadBlockedIds(failingBlocksClient() as never, VIEWER).then(
      () => null,
      (e: unknown) => e
    )
    expect((caught as Error & { cause?: unknown }).cause).toEqual(PG_ERROR)
  })

  it('still returns the bidirectional union on the happy path (unchanged)', async () => {
    const service = {
      from: jest.fn(() =>
        tableBuilder([
          { blocker_id: VIEWER, blocked_id: OTHER },
          { blocker_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', blocked_id: VIEWER },
        ])
      ),
    }
    const ids = await loadBlockedIds(service as never, VIEWER)
    expect(ids).toEqual(new Set([OTHER, 'cccccccc-cccc-cccc-cccc-cccccccccccc']))
  })

  it('still returns an empty set when the query SUCCEEDS with no rows', async () => {
    // The distinction the old code destroyed: "queried, nobody is blocked"
    // and "could not query" must not be the same answer.
    const service = { from: jest.fn(() => tableBuilder([])) }
    await expect(loadBlockedIds(service as never, VIEWER)).resolves.toEqual(new Set())
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 2. The shared write gate
// ─────────────────────────────────────────────────────────────────────────
describe('lib/trust-safety/block-check — mustBlockActionBetween', () => {
  it('fails CLOSED when the block lookup cannot be completed', async () => {
    await expect(
      mustBlockActionBetween(failingBlocksClient() as never, VIEWER, OTHER)
    ).resolves.toBe(true)
  })

  it('does not propagate the throw — the route must answer, not 500', async () => {
    // The route-level assertions in section 3 depend on this: a propagated
    // throw would surface as an Internal Server Error, a DIFFERENT shape
    // from the generic 400 a real block returns.
    await expect(
      mustBlockActionBetween(failingBlocksClient() as never, VIEWER, OTHER)
    ).resolves.not.toThrow()
  })

  it('still answers false when the lookup succeeds with no block', async () => {
    const service = { from: jest.fn(() => tableBuilder([])) }
    await expect(mustBlockActionBetween(service as never, VIEWER, OTHER)).resolves.toBe(false)
  })

  it('fails CLOSED through the email entry point too', async () => {
    const service = {
      rpc: jest.fn(async () => ({ data: OTHER, error: null })),
      from: jest.fn(() => tableBuilder([], PG_ERROR)),
    }
    await expect(
      mustBlockActionForEmail(service as never, VIEWER, 'target@example.com')
    ).resolves.toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 3. The gated write routes — generic body, and no write
// ─────────────────────────────────────────────────────────────────────────
const GENERIC_BODY = JSON.stringify({ error: BLOCKED_ACTION_ERROR })

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function expectGenericRefusal(res: Response) {
  expect(res.status).toBe(BLOCKED_ACTION_STATUS)
  const raw = await res.text()
  // Byte-identical to the body a REAL block produces — not merely "an error".
  expect(raw).toBe(GENERIC_BODY)
  expectDiscloseNothing(raw)
}

describe('gated write routes — a failed block lookup refuses without writing', () => {
  const ORIGINAL_DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO

  beforeEach(() => {
    jest.resetModules()
    process.env.NEXT_PUBLIC_VAULT_DEMO = 'false'
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_VAULT_DEMO = ORIGINAL_DEMO
  })

  it('POST /api/follows does not upsert the follow', async () => {
    const upsert = jest.fn()
    jest.doMock('@/lib/supabase/server', () => ({
      createApiClient: jest.fn().mockResolvedValue({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: VIEWER } } }) },
        from: jest.fn((table: string) => {
          if (table === 'follows') return { upsert }
          throw new Error(`Unexpected table: ${table}`)
        }),
      }),
      createServiceClient: jest.fn(failingBlocksClient),
    }))
    jest.doMock('@/lib/notifications', () => ({ createNotification: jest.fn() }))

    const { POST } = await import('@/app/api/follows/route')
    await expectGenericRefusal(await POST(jsonRequest('http://test.local/api/follows', { followeeId: OTHER })))
    expect(upsert).not.toHaveBeenCalled()
  })

  it('POST /api/connections does not reach the connections table at all', async () => {
    const connectionsQuery = jest.fn()
    jest.doMock('@/lib/supabase/server', () => ({
      createApiClient: jest.fn().mockResolvedValue({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: VIEWER } } }) },
        from: jest.fn((table: string) => {
          if (table === 'connections') {
            connectionsQuery()
            return tableBuilder([])
          }
          throw new Error(`Unexpected table: ${table}`)
        }),
      }),
      createServiceClient: jest.fn(failingBlocksClient),
    }))
    jest.doMock('@/lib/notifications', () => ({ createNotification: jest.fn() }))

    const { POST } = await import('@/app/api/connections/route')
    await expectGenericRefusal(
      await POST(jsonRequest('http://test.local/api/connections', { addresseeId: OTHER }))
    )
    expect(connectionsQuery).not.toHaveBeenCalled()
  })

  it('POST /api/wall does not insert the post', async () => {
    const insert = jest.fn()
    jest.doMock('@/lib/supabase/server', () => ({
      createApiClient: jest.fn().mockResolvedValue({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: VIEWER } } }) },
        from: jest.fn((table: string) => {
          if (table === 'wall_posts') return { insert }
          throw new Error(`Unexpected table: ${table}`)
        }),
      }),
      createServiceClient: jest.fn(failingBlocksClient),
    }))
    jest.doMock('@/lib/notifications', () => ({ createNotification: jest.fn() }))

    const { POST } = await import('@/app/api/wall/route')
    await expectGenericRefusal(
      await POST(jsonRequest('http://test.local/api/wall', { profileId: OTHER, body: 'hey!' }))
    )
    expect(insert).not.toHaveBeenCalled()
  })

  it('POST /api/endorsements does not upsert the endorsement', async () => {
    const upsert = jest.fn()
    jest.doMock('@/lib/supabase/server', () => ({
      createApiClient: jest.fn().mockResolvedValue({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: VIEWER } } }) },
        from: jest.fn((table: string) => {
          if (table === 'endorsements') return { upsert }
          throw new Error(`Unexpected table: ${table}`)
        }),
      }),
      createServiceClient: jest.fn(failingBlocksClient),
    }))
    jest.doMock('@/lib/notifications', () => ({ createNotification: jest.fn() }))

    const { POST } = await import('@/app/api/endorsements/route')
    await expectGenericRefusal(
      await POST(
        jsonRequest('http://test.local/api/endorsements', {
          profileId: OTHER,
          body: 'Great collaborator!',
        })
      )
    )
    expect(upsert).not.toHaveBeenCalled()
  })

  it('POST /api/release-comments does not insert the comment', async () => {
    const insert = jest.fn()
    jest.doMock('@/lib/supabase/server', () => ({
      createApiClient: jest.fn().mockResolvedValue({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: VIEWER } } }) },
        from: jest.fn((table: string) => {
          if (table === 'vault_projects') return tableBuilder([{ user_id: OTHER, title: 'My Release' }])
          if (table === 'release_comments') return { insert }
          throw new Error(`Unexpected table: ${table}`)
        }),
      }),
      createServiceClient: jest.fn(failingBlocksClient),
    }))
    jest.doMock('@/lib/notifications', () => ({ createNotification: jest.fn() }))

    const { POST } = await import('@/app/api/release-comments/route')
    await expectGenericRefusal(
      await POST(
        jsonRequest('http://test.local/api/release-comments', {
          projectId: 'proj-1',
          body: 'Loved this!',
        })
      )
    )
    expect(insert).not.toHaveBeenCalled()
  })

  it('POST /api/collaborators (the email-shaped gate) does not insert the roster row', async () => {
    // The #96 path: migration 179's BEFORE INSERT trigger stamps claimed_by
    // with no block predicate, so an insert IS the disclosure.
    const insert = jest.fn()
    const lookupChain: Record<string, unknown> = {}
    for (const m of ['eq', 'ilike', 'is', 'order', 'limit']) {
      lookupChain[m] = jest.fn(() => lookupChain)
    }
    lookupChain.maybeSingle = jest.fn(async () => ({ data: null, error: null }))

    jest.doMock('@/lib/supabase/server', () => ({
      createApiClient: jest.fn().mockResolvedValue({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: VIEWER } } }) },
        from: jest.fn((table: string) => {
          if (table === 'collaborators') {
            return { select: jest.fn(() => lookupChain), insert }
          }
          return tableBuilder([])
        }),
      }),
      createServiceClient: jest.fn(() => ({
        rpc: jest.fn(async () => ({ data: OTHER, error: null })),
        from: jest.fn(() => tableBuilder([], PG_ERROR)),
      })),
    }))
    jest.doMock('@/lib/accounts/member-api-gate', () => ({
      requireMemberApiAccount: jest.fn(async () => ({ ok: true, user: { id: VIEWER } })),
    }))

    const { POST } = await import('@/app/api/collaborators/route')
    await expectGenericRefusal(
      await POST(
        jsonRequest('http://test.local/api/collaborators', {
          name: 'Blocked Person',
          email: 'blocked@example.com',
        })
      )
    )
    expect(insert).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 4. People Search — propagates into the route's existing generic 500
// ─────────────────────────────────────────────────────────────────────────
describe('GET /api/green-room/discover — a failed block lookup returns no people', () => {
  const ORIGINAL_DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO

  beforeEach(() => {
    jest.resetModules()
    process.env.NEXT_PUBLIC_VAULT_DEMO = 'false'
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_VAULT_DEMO = ORIGINAL_DEMO
  })

  it('answers with the route\'s own generic failure, never a result page', async () => {
    jest.doMock('@/lib/supabase/server', () => ({
      createApiClient: jest.fn().mockResolvedValue({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: VIEWER } } }) },
        from: jest.fn(() => tableBuilder([])),
      }),
      createServiceClient: jest.fn(failingBlocksClient),
    }))
    jest.doMock('@/lib/green-room/access', () => ({
      loadGreenRoomPrincipal: jest.fn(async () => ({})),
      greenRoomViewerGate: jest.fn(() => ({ ok: true })),
    }))

    const { GET } = await import('@/app/api/green-room/discover/route')
    const res = await GET(new Request('http://test.local/api/green-room/discover?q=jane'))

    expect(res.status).toBe(500)
    const raw = await res.text()
    // No `results` array: a failed lookup must not degrade into a page that
    // silently includes people this viewer must not see.
    expect(raw).not.toContain('results')
    expectDiscloseNothing(raw)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 5. The two server components
// ─────────────────────────────────────────────────────────────────────────
describe('app/u/[handle]/page.tsx — a failed block lookup renders the same notFound()', () => {
  const ORIGINAL_DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO
  const ORIGINAL_URL = process.env.NEXT_PUBLIC_APP_URL

  beforeEach(() => {
    jest.resetModules()
    process.env.NEXT_PUBLIC_VAULT_DEMO = 'false'
    process.env.NEXT_PUBLIC_APP_URL = 'https://test.local'
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_VAULT_DEMO = ORIGINAL_DEMO
    process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_URL
  })

  function mockPage(blocksError: { message: string } | null, opts: { connectionsSpy: jest.Mock }) {
    jest.doMock('next/navigation', () => ({
      notFound: jest.fn(() => {
        throw new Error('NEXT_NOT_FOUND')
      }),
      permanentRedirect: jest.fn(() => {
        throw new Error('NEXT_REDIRECT')
      }),
    }))
    jest.doMock('@/lib/handles/resolve', () => ({
      resolveHandle: jest.fn(async () => ({ kind: 'ok', profileId: OTHER, handle: 'artist' })),
    }))
    jest.doMock('@/lib/supabase/server', () => ({
      createServerClient: jest.fn().mockResolvedValue({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: VIEWER } } }) },
        from: jest.fn((table: string) => {
          if (table === 'user_profiles') {
            return tableBuilder([{ id: OTHER, is_public: true, artist_name: 'Artist' }])
          }
          if (table === 'connections') {
            opts.connectionsSpy()
            return tableBuilder([])
          }
          return tableBuilder([])
        }),
      }),
      createServiceClient: jest.fn(() => ({
        from: jest.fn(() => tableBuilder([], blocksError)),
      })),
    }))
  }

  async function renderPage() {
    const mod = await import('@/app/u/[handle]/page')
    return (mod.default as (args: {
      params: Promise<{ handle: string }>
      searchParams: Promise<Record<string, string>>
    }) => Promise<unknown>)({
      params: Promise.resolve({ handle: 'artist' }),
      searchParams: Promise.resolve({}),
    })
  }

  it('404s instead of rendering the profile, and never runs the queries below the gate', async () => {
    const connectionsSpy = jest.fn()
    mockPage(PG_ERROR, { connectionsSpy })

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    // The gate's whole point: nothing below it — connections, wall,
    // endorsements, comments, activity — may run for an unresolved viewer.
    expect(connectionsSpy).not.toHaveBeenCalled()
  })

  it('renders the profile normally when the lookup succeeds (unchanged)', async () => {
    const connectionsSpy = jest.fn()
    mockPage(null, { connectionsSpy })

    // Not a notFound: the page proceeds past the gate and queries onward.
    await renderPage().catch(() => undefined)
    expect(connectionsSpy).toHaveBeenCalled()
  })
})

describe('app/profile/page.tsx — a failed block lookup renders nothing', () => {
  const ORIGINAL_DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO

  beforeEach(() => {
    jest.resetModules()
    process.env.NEXT_PUBLIC_VAULT_DEMO = 'false'
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_VAULT_DEMO = ORIGINAL_DEMO
  })

  it('rejects with the generic message and never loads the wall it could not filter', async () => {
    const loadWall = jest.fn(async () => [])
    const loadEndorsements = jest.fn(async () => ({ items: [] }))
    const loadReleaseComments = jest.fn(async () => [])

    jest.doMock('next/navigation', () => ({
      redirect: jest.fn(() => {
        throw new Error('NEXT_REDIRECT')
      }),
    }))
    jest.doMock('@/lib/social/wall', () => ({ loadWall }))
    jest.doMock('@/lib/social/endorsements', () => ({ loadEndorsements }))
    jest.doMock('@/lib/social/comments', () => ({ loadReleaseComments }))
    jest.doMock('@/lib/social/activity', () => ({ loadActivity: jest.fn(async () => []) }))
    jest.doMock('@/lib/supabase/server', () => ({
      createServerClient: jest.fn().mockResolvedValue({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: VIEWER } } }) },
        from: jest.fn(() => tableBuilder([])),
      }),
      createServiceClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'blocks') return tableBuilder([], PG_ERROR)
          return tableBuilder([{ id: VIEWER, artist_name: 'Me' }])
        }),
      })),
    }))

    const mod = await import('@/app/profile/page')
    const rendered = (mod.default as () => Promise<unknown>)()

    await expect(rendered).rejects.toThrow(BLOCK_LOOKUP_FAILED)
    // Every social surface on this page is filtered by blockedIds — none of
    // them may render from an unknown block state.
    expect(loadWall).not.toHaveBeenCalled()
    expect(loadEndorsements).not.toHaveBeenCalled()
    expect(loadReleaseComments).not.toHaveBeenCalled()

    const surfaced = await rendered.then(
      () => '',
      (e: Error) => e.message
    )
    expectDiscloseNothing(surfaced)
  })
})
