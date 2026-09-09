// ─── Why the `no_block` RPC is gone, and why the replacement read MUST run
//     with the service role (38.0.3 plan 04 + its review fix) ───────────────
//
// `checkViewerBlock` used to call the `no_block` SECURITY DEFINER function
// over PostgREST. Owner decision D4 relocates `no_block` out of the
// PostgREST-exposed schema because an exposed symmetric helper is an oracle
// that answers "did X block me?" for any pair — threat T-08-03, which
// migration 035 deliberately closed at the table level by restricting
// `blocks` SELECT to `blocker_id = auth.uid()` (policy `blocks_select_own`).
// PostgREST introspects and routes ONLY to the schemas in its `db-schemas`
// config, so once the function moves, the RPC route stops existing no matter
// what EXECUTE grants `service_role` holds — routing and privilege are
// different questions.
//
// THE REGRESSION THIS FILE NOW GUARDS. The first cut of the replacement read
// `public.blocks` off the client the CALLER passed in. On the only path that
// actually reaches the query — app/api/green-room/feed/route.ts ->
// loadGreenRoomFeed -> loadPlacementCards -> filterVisiblePlacementRows ->
// isDestinationVisible — that client is `createApiClient()`: cookie-scoped,
// RLS APPLIES. Under `blocks_select_own` the "OWNER blocked the VIEWER"
// disjunct returns nothing, the query degrades to zero rows, and the gate
// FAILS OPEN toward exactly the person the owner blocked. The read must
// therefore use the service role — the privilege equivalent of the
// SECURITY DEFINER function it replaced.
//
// WHY A UNIT TEST ALMOST MISSED IT. A mocked Supabase client has no RLS, so
// no amount of behaviour mocking on a single client reproduces the policy.
// Two things stand in for it below:
//   1. The caller client here EMULATES `blocks_select_own` explicitly — it
//      only ever returns rows where blocker_id === VIEWER. Point the read at
//      it and the owner-blocked-viewer case goes green-when-it-should-be-red.
//   2. Structural assertions on WHICH client saw WHICH table.
// ────────────────────────────────────────────────────────────────────────

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

const DEST = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const VIEWER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

type QueryResult = { data: unknown; error: unknown }
type BlockRow = { blocker_id: string; blocked_id: string }

// A chainable query-builder spy that records every call and is awaitable
// (thenable) so it stands in for a PostgREST builder no matter where the
// chain terminates. Mirrors __tests__/green-room-discover.test.ts's
// tableBuilder and lib/deals/catalog-query.test.ts.
function tableBuilder(result: QueryResult) {
  const calls: Record<string, unknown[][]> = {}
  const record = (name: string) => (...args: unknown[]) => {
    ;(calls[name] ??= []).push(args)
    return builder
  }
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'or', 'limit', 'in', 'not', 'is', 'order']) {
    builder[m] = record(m)
  }
  builder.maybeSingle = async () => result
  builder.then = (resolve: (v: unknown) => void) => resolve(result)
  return { builder, calls }
}

// The client the CALLER hands to isDestinationVisible. On the feed path this
// is the request's user-scoped client. `user_profiles` always resolves to a
// PUBLIC destination so the block check is the only thing under test.
//
// Its `blocks` table deliberately emulates migration 035's
// `blocks_select_own` (USING blocker_id = auth.uid()): rows where somebody
// ELSE blocked the viewer are simply not returned. That is the RLS behaviour
// a mock cannot otherwise reproduce.
function makeCallerClient(rows: BlockRow[]) {
  const tables: string[] = []
  const visibleUnderRls = rows.filter(row => row.blocker_id === VIEWER)
  const blocks = tableBuilder({ data: visibleUnderRls, error: null })
  const profiles = tableBuilder({ data: { id: DEST }, error: null })
  const client = {
    from: jest.fn((table: string) => {
      tables.push(table)
      if (table === 'blocks') return blocks.builder
      return profiles.builder
    }),
    // Deliberately throws: if anything ever re-introduces the RPC call this
    // suite fails loudly instead of silently passing.
    rpc: jest.fn(() => {
      throw new Error('placements-admin must not call an RPC for the block check')
    }),
  }
  return { client, tables, blocks }
}

// The service-role client. Bypasses RLS, so it sees BOTH directions. It must
// be used for `blocks` and for nothing else — the destination `is_public`
// reads stay on the caller's client, where RLS hiding a row correctly means
// "not visible".
function makeServiceClient(result: QueryResult) {
  const tables: string[] = []
  const blocks = tableBuilder(result)
  const client = {
    from: jest.fn((table: string) => {
      tables.push(table)
      if (table !== 'blocks') {
        throw new Error(
          `the service client must only be used for the blocks read, got: ${table}`
        )
      }
      return blocks.builder
    }),
    rpc: jest.fn(() => {
      throw new Error('placements-admin must not call an RPC for the block check')
    }),
  }
  return { client, tables, blocks }
}

// `rows` are the TRUE contents of public.blocks. The service client sees all
// of them; the caller client sees only what `blocks_select_own` permits.
async function setup(rows: BlockRow[], error: unknown = null) {
  // The block read client is memoized at module scope (one service client per
  // process, not one per placement row), so each test needs a fresh registry.
  jest.resetModules()
  const server = await import('@/lib/supabase/server')
  const createServiceClient = server.createServiceClient as jest.Mock

  const caller = makeCallerClient(rows)
  const service = makeServiceClient({ data: error ? null : rows.slice(0, 1), error })
  createServiceClient.mockReturnValue(service.client)

  const { isDestinationVisible } = await import('@/lib/green-room/placements-admin')
  return { isDestinationVisible, caller, service, createServiceClient }
}

describe('placement destination block check — direct bidirectional `blocks` read', () => {
  it('hides the destination when the VIEWER blocked the OWNER', async () => {
    const { isDestinationVisible, caller } = await setup([
      { blocker_id: VIEWER, blocked_id: DEST },
    ])
    await expect(
      isDestinationVisible(caller.client as never, 'profile', DEST, null, VIEWER)
    ).resolves.toBe(false)
  })

  it('hides the destination when the OWNER blocked the VIEWER — the check is symmetric, as `no_block` was, and RLS must not be able to hide that direction', async () => {
    // THE REGRESSION CASE. The caller client cannot see this row (it emulates
    // `blocks_select_own`), so a read issued on the caller client returns []
    // and this resolves to `true` — the destination shown to the blocked
    // party. Only the RLS-bypassing service client gets the right answer.
    const { isDestinationVisible, caller, service } = await setup([
      { blocker_id: DEST, blocked_id: VIEWER },
    ])

    await expect(
      isDestinationVisible(caller.client as never, 'profile', DEST, null, VIEWER)
    ).resolves.toBe(false)

    // Assert the FILTER, not just the boolean: a query that only looked at
    // one direction would still return false against this seeded row.
    const filter = String(service.blocks.calls.or?.[0]?.[0] ?? '')
    expect(filter).toContain(`and(blocker_id.eq.${VIEWER},blocked_id.eq.${DEST})`)
    expect(filter).toContain(`and(blocker_id.eq.${DEST},blocked_id.eq.${VIEWER})`)
  })

  it('reads `blocks` on the SERVICE client and never on the caller-supplied one, while destination publicness stays on the caller client', async () => {
    // The structural half of the guard above. A mocked client has no RLS, so
    // "which client issued the query" is the only thing a unit test can pin
    // directly; the behavioural half is the owner-blocked-viewer case.
    const { isDestinationVisible, caller, service, createServiceClient } = await setup([])

    await expect(
      isDestinationVisible(caller.client as never, 'profile', DEST, null, VIEWER)
    ).resolves.toBe(true)

    expect(createServiceClient).toHaveBeenCalled()

    // The block read landed on the service client...
    expect(service.tables).toEqual(['blocks'])
    expect(service.blocks.calls.or?.length).toBe(1)

    // ...and NOT on the caller's client, which only saw the publicness read.
    expect(caller.tables).toContain('user_profiles')
    expect(caller.tables).not.toContain('blocks')
    expect(caller.blocks.calls.or).toBeUndefined()
  })

  it('creates at most one service client no matter how many destinations are checked', async () => {
    // filterVisiblePlacementRows fans this out across every placement row via
    // Promise.all; a per-call createClient would build one client per row.
    const { isDestinationVisible, caller, createServiceClient } = await setup([])
    await Promise.all([
      isDestinationVisible(caller.client as never, 'profile', DEST, null, VIEWER),
      isDestinationVisible(caller.client as never, 'profile', DEST, null, VIEWER),
      isDestinationVisible(caller.client as never, 'profile', DEST, null, VIEWER),
    ])
    expect(createServiceClient).toHaveBeenCalledTimes(1)
  })

  it('shows the destination when no block row exists between the pair', async () => {
    const { isDestinationVisible, caller } = await setup([])
    await expect(
      isDestinationVisible(caller.client as never, 'profile', DEST, null, VIEWER)
    ).resolves.toBe(true)
  })

  it('FAILS CLOSED: a query error hides the destination', async () => {
    // The RPC version returned false on error. That must not regress into
    // fail-open, which is what reusing `loadBlockedIds` would give.
    const { isDestinationVisible, caller } = await setup([], { message: 'boom' })
    await expect(
      isDestinationVisible(caller.client as never, 'profile', DEST, null, VIEWER)
    ).resolves.toBe(false)
  })

  it('FAILS CLOSED when the service client cannot be constructed (SUPABASE_SERVICE_ROLE_KEY unset)', async () => {
    // createClient() throws synchronously on a missing key. Hiding the
    // destination is the correct degradation; returning true would reinstate
    // the fail-open bug by another route.
    jest.resetModules()
    const server = await import('@/lib/supabase/server')
    ;(server.createServiceClient as jest.Mock).mockImplementation(() => {
      throw new Error('supabaseKey is required.')
    })
    const caller = makeCallerClient([{ blocker_id: DEST, blocked_id: VIEWER }])
    const { isDestinationVisible } = await import('@/lib/green-room/placements-admin')

    await expect(
      isDestinationVisible(caller.client as never, 'profile', DEST, null, VIEWER)
    ).resolves.toBe(false)
    expect(caller.tables).not.toContain('blocks')
  })

  it('issues no block query at all for an anonymous viewer', async () => {
    // Interpolating `undefined` into a filter against a uuid column raises
    // `invalid input syntax for type uuid` — the pitfall recorded in
    // lib/deals/catalog-query.test.ts. An anonymous viewer can neither
    // block nor be blocked.
    const { isDestinationVisible, caller, service, createServiceClient } = await setup([])
    await expect(
      isDestinationVisible(caller.client as never, 'profile', DEST, null, undefined)
    ).resolves.toBe(true)
    expect(caller.tables).not.toContain('blocks')
    expect(service.tables).toEqual([])
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('issues no block query when the viewer IS the destination owner', async () => {
    const { isDestinationVisible, caller, service, createServiceClient } = await setup([])
    await expect(
      isDestinationVisible(caller.client as never, 'profile', DEST, null, DEST)
    ).resolves.toBe(true)
    expect(caller.tables).not.toContain('blocks')
    expect(service.tables).toEqual([])
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('looks up the specific pair and bounds the result set to one row', async () => {
    const { isDestinationVisible, service } = await setup([])
    const { client } = makeCallerClient([])
    await isDestinationVisible(client as never, 'profile', DEST, null, VIEWER)

    // Single-pair lookup — not "every block involving the viewer", which is
    // unbounded for a heavy user.
    expect(service.blocks.calls.or?.length).toBe(1)
    expect(service.blocks.calls.limit).toContainEqual([1])
  })
})
