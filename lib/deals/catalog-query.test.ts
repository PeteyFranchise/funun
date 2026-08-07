import { loadCatalogPage } from './catalog-query'
import { buildCatalogFilter } from './catalog'
import { loadBlockedIds } from '@/lib/green-room/discover'

// ─── loadCatalogPage — anonymous-safe branch (23-03 Task 1) ──────────────
// RESEARCH Pitfall 3: passing an anonymous visitor's null id straight into
// loadBlockedIds's .or(`blocker_id.eq.${id},...`) against a uuid column
// throws `invalid input syntax for type uuid`. loadCatalogPage must skip
// the block-exclusion call entirely for a null buyerUserId (a visitor with
// no account can neither block nor be blocked) while leaving the
// authenticated block-exclusion path unchanged.

jest.mock('@/lib/green-room/discover', () => ({
  loadBlockedIds: jest.fn(),
}))

const mockedLoadBlockedIds = loadBlockedIds as jest.MockedFunction<typeof loadBlockedIds>

// Chainable query-builder spy — mirrors __tests__/green-room-discover.test.ts's
// tableBuilder so it can stand in for a PostgREST builder no matter where the
// chain terminates (awaitable via `.then`).
function tableBuilder(rows: unknown[]) {
  const calls: Record<string, unknown[][]> = {}
  const record = (name: string) => (...args: unknown[]) => {
    ;(calls[name] ??= []).push(args)
    return builder
  }
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'range', 'in']) {
    builder[m] = record(m)
  }
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null })
  return { builder, calls }
}

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    title: 'Test Track',
    type: 'single',
    genre: 'House',
    is_public: true,
    vault_readiness_score: 100,
    user_id: 'owner-1',
    cover_art_url: null,
    content_id_registered: false,
    content_id_dismissed_until: null,
    tracks: [],
    vault_documents: [],
    ...overrides,
  }
}

function makeService(projects: unknown[], ownerRows: unknown[]) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'vault_projects') return tableBuilder(projects).builder
      if (table === 'user_profiles') return tableBuilder(ownerRows).builder
      if (table === 'project_license_terms') return tableBuilder([]).builder
      return tableBuilder([]).builder
    }),
  }
}

const BASE_FILTER = buildCatalogFilter({})

beforeEach(() => {
  mockedLoadBlockedIds.mockReset()
  mockedLoadBlockedIds.mockResolvedValue(new Set())
})

describe('loadCatalogPage — anonymous visitor (buyerUserId = null)', () => {
  it('does not call loadBlockedIds and returns the rights-ready public cards', async () => {
    const project = projectRow()
    const service = makeService(
      [project],
      [{ id: 'owner-1', profile_visibility: 'public' }]
    )

    const result = await loadCatalogPage(service as never, null, BASE_FILTER, 1)

    expect(mockedLoadBlockedIds).not.toHaveBeenCalled()
    expect(result.data).toHaveLength(1)
    expect(result.data[0].id).toBe('proj-1')
  })

  it('never throws for an anonymous caller', async () => {
    const project = projectRow()
    const service = makeService(
      [project],
      [{ id: 'owner-1', profile_visibility: 'public' }]
    )

    await expect(loadCatalogPage(service as never, null, BASE_FILTER, 1)).resolves.not.toThrow()
  })

  it('preserves the empty-projects short-circuit for an anonymous caller', async () => {
    const service = makeService([], [])
    const result = await loadCatalogPage(service as never, null, BASE_FILTER, 1)
    expect(mockedLoadBlockedIds).not.toHaveBeenCalled()
    expect(result.data).toEqual([])
  })
})

describe('loadCatalogPage — authenticated buyer (buyerUserId = real id)', () => {
  it('calls loadBlockedIds with the real buyer id and still applies block exclusion', async () => {
    const project = projectRow({ user_id: 'blocked-owner' })
    const service = makeService(
      [project],
      [{ id: 'blocked-owner', profile_visibility: 'public' }]
    )
    mockedLoadBlockedIds.mockResolvedValue(new Set(['blocked-owner']))

    const result = await loadCatalogPage(service as never, 'buyer-1', BASE_FILTER, 1)

    expect(mockedLoadBlockedIds).toHaveBeenCalledWith(service, 'buyer-1')
    expect(result.data).toEqual([])
  })

  it('returns cards for a non-blocked owner (authenticated behavior unchanged)', async () => {
    const project = projectRow({ user_id: 'owner-1' })
    const service = makeService(
      [project],
      [{ id: 'owner-1', profile_visibility: 'public' }]
    )
    mockedLoadBlockedIds.mockResolvedValue(new Set())

    const result = await loadCatalogPage(service as never, 'buyer-1', BASE_FILTER, 1)

    expect(mockedLoadBlockedIds).toHaveBeenCalledWith(service, 'buyer-1')
    expect(result.data).toHaveLength(1)
  })
})
