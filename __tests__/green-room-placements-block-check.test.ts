import { isDestinationVisible } from '@/lib/green-room/placements-admin'

// ─── Why the `no_block` RPC is gone from placements-admin (38.0.3 plan 04) ──
// `checkViewerBlock` used to call the `no_block` SECURITY DEFINER function
// over PostgREST. Owner decision D4 relocates `no_block` out of the
// PostgREST-exposed schema because an exposed symmetric helper is an oracle
// that answers "did X block me?" for any pair — threat T-08-03, which
// migration 035 deliberately closed at the table level by restricting
// `blocks` SELECT to `blocker_id = auth.uid()`. PostgREST introspects and
// routes ONLY to the schemas in its `db-schemas` config, so once the
// function moves, the RPC route stops existing no matter what EXECUTE
// grants `service_role` holds — routing and privilege are different
// questions. The replacement reads `public.blocks` directly with the
// service client (which bypasses RLS, the only way to see the direction
// where the OWNER blocked the VIEWER). Do NOT "simplify" this back to an
// RPC, and do NOT swap it for `loadBlockedIds` — that helper discards its
// error and would flip this gate from fail-closed to fail-open.
// ────────────────────────────────────────────────────────────────────────

const DEST = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const VIEWER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

// A chainable query-builder spy that records every call and is awaitable
// (thenable) so it stands in for a PostgREST builder no matter where the
// chain terminates. Mirrors __tests__/green-room-discover.test.ts's
// tableBuilder and lib/deals/catalog-query.test.ts.
function tableBuilder(result: { data: unknown; error: unknown }) {
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

// Service client stub: `user_profiles` always resolves to a PUBLIC
// destination so the block check is the only thing under test, and `blocks`
// resolves to whatever the individual test seeds.
function makeService(blocksResult: { data: unknown; error: unknown }) {
  const blocks = tableBuilder(blocksResult)
  const profiles = tableBuilder({ data: { id: DEST }, error: null })
  const tables: string[] = []
  const service = {
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
  return { service, blocks, tables }
}

describe('placement destination block check — direct bidirectional `blocks` read', () => {
  it('hides the destination when the VIEWER blocked the OWNER', async () => {
    const { service } = makeService({ data: [{ blocker_id: VIEWER }], error: null })
    await expect(
      isDestinationVisible(service as never, 'profile', DEST, null, VIEWER)
    ).resolves.toBe(false)
  })

  it('hides the destination when the OWNER blocked the VIEWER — the check is symmetric, as `no_block` was', async () => {
    const { service, blocks } = makeService({ data: [{ blocker_id: DEST }], error: null })

    await expect(
      isDestinationVisible(service as never, 'profile', DEST, null, VIEWER)
    ).resolves.toBe(false)

    // Assert the FILTER, not just the boolean: a query that only looked at
    // one direction would still return false against this seeded row.
    const filter = String(blocks.calls.or?.[0]?.[0] ?? '')
    expect(filter).toContain(`and(blocker_id.eq.${VIEWER},blocked_id.eq.${DEST})`)
    expect(filter).toContain(`and(blocker_id.eq.${DEST},blocked_id.eq.${VIEWER})`)
  })

  it('shows the destination when no block row exists between the pair', async () => {
    const { service } = makeService({ data: [], error: null })
    await expect(
      isDestinationVisible(service as never, 'profile', DEST, null, VIEWER)
    ).resolves.toBe(true)
  })

  it('FAILS CLOSED: a query error hides the destination', async () => {
    // The RPC version returned false on error. That must not regress into
    // fail-open, which is what reusing `loadBlockedIds` would give.
    const { service } = makeService({ data: null, error: { message: 'boom' } })
    await expect(
      isDestinationVisible(service as never, 'profile', DEST, null, VIEWER)
    ).resolves.toBe(false)
  })

  it('issues no block query at all for an anonymous viewer', async () => {
    // Interpolating `undefined` into a filter against a uuid column raises
    // `invalid input syntax for type uuid` — the pitfall recorded in
    // lib/deals/catalog-query.test.ts. An anonymous viewer can neither
    // block nor be blocked.
    const { service, tables, blocks } = makeService({ data: [], error: null })
    await expect(
      isDestinationVisible(service as never, 'profile', DEST, null, undefined)
    ).resolves.toBe(true)
    expect(tables).not.toContain('blocks')
    expect(blocks.calls.or).toBeUndefined()
  })

  it('issues no block query when the viewer IS the destination owner', async () => {
    const { service, tables, blocks } = makeService({ data: [], error: null })
    await expect(
      isDestinationVisible(service as never, 'profile', DEST, null, DEST)
    ).resolves.toBe(true)
    expect(tables).not.toContain('blocks')
    expect(blocks.calls.or).toBeUndefined()
  })

  it('looks up the specific pair and bounds the result set to one row', async () => {
    const { service, blocks } = makeService({ data: [], error: null })
    await isDestinationVisible(service as never, 'profile', DEST, null, VIEWER)

    // Single-pair lookup — not "every block involving the viewer", which is
    // unbounded for a heavy user.
    expect(blocks.calls.or?.length).toBe(1)
    expect(blocks.calls.limit).toContainEqual([1])
  })
})
