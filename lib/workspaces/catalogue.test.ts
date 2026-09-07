import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadWorkspaceCatalogue,
  summariseCatalogue,
  WORKSPACE_CATALOGUE_PAGE_DEFAULT,
  WORKSPACE_CATALOGUE_PAGE_MAX,
  type WorkspaceCatalogueEntry,
} from '@/lib/workspaces/catalogue'

// ─── The catalogue reader, after R-10 / WSR-20 ────────────────────────────
// Every field-visibility case below is inherited from the loop-based
// version of this suite and retargeted at the RPC-shaped fake: the DECIDER
// changed (two booleans returned by `public.workspace_catalogue_page`
// instead of a per-project `resolveEffectivePermissions` call), the
// BEHAVIOUR did not. Three cases are new and are the actual point of the
// change: the statement count does not grow with the size of the page, two
// identical calls issue two RPC calls (nothing is memoised — D-49, R-10),
// and an RPC error yields an empty page rather than a partial one.

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ACTOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const HOLDER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const PROJECT_A = '11111111-1111-1111-1111-111111111111'
const PROJECT_B = '22222222-2222-2222-2222-222222222222'

/** One row exactly as `public.workspace_catalogue_page` declares it. The
 * conditionally-exposed columns arrive already NULLed out by the function
 * when the matching flag is false — this fixture mirrors that, so the test
 * cannot pass by having the TypeScript re-filter values the database was
 * supposed to have withheld. */
type PageRowFixture = {
  project_id: string
  holder_user_id: string
  title: string
  type: string
  release_date: string | null
  vault_readiness_score: number
  can_view_metadata: boolean
  can_view_private_rights_identifiers: boolean
  genre: string | null
  sub_genre: string | null
  label: string | null
  publisher: string | null
  c_line: string | null
  p_line: string | null
  copyright_year: number | null
  primary_language: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  upc: string | null
}

const METADATA_VALUES = {
  genre: 'R&B',
  sub_genre: null,
  label: 'Rise Records',
  publisher: 'Rise Publishing',
  c_line: '2026 Rise Records',
  p_line: '2026 Rise Records',
  copyright_year: 2026,
  primary_language: 'en',
  contact_name: 'Jordan Vale',
  contact_email: 'jordan@example.com',
  contact_phone: '555-0100',
} as const

const WITHHELD_METADATA = {
  genre: null,
  sub_genre: null,
  label: null,
  publisher: null,
  c_line: null,
  p_line: null,
  copyright_year: null,
  primary_language: null,
  contact_name: null,
  contact_email: null,
  contact_phone: null,
} as const

function makeRow(
  overrides: Partial<PageRowFixture> & {
    metadataVisible?: boolean
    identifiersVisible?: boolean
  } = {}
): PageRowFixture {
  const { metadataVisible = false, identifiersVisible = false, ...rest } = overrides
  return {
    project_id: PROJECT_A,
    holder_user_id: HOLDER_ID,
    title: 'Midnight Run',
    type: 'single',
    release_date: '2026-10-01',
    vault_readiness_score: 62,
    can_view_metadata: metadataVisible,
    can_view_private_rights_identifiers: identifiersVisible,
    ...(metadataVisible ? METADATA_VALUES : WITHHELD_METADATA),
    upc: identifiersVisible ? '012345678905' : null,
    ...rest,
  }
}

// The same small, faithful-enough in-memory table the loop-based suite
// used: `.eq`/`.in` narrow an in-flight row set exactly like a real Postgres
// filter would, and the terminal `.then` makes the builder itself awaitable,
// matching supabase-js's thenable query-builder shape.
function makeFilterableTable<T extends Record<string, unknown>>(rows: T[]) {
  const selectMock = jest.fn(() => makeBuilder(rows))
  return { select: selectMock }

  function makeBuilder(current: T[]): any {
    const builder: any = {
      eq: jest.fn((col: string, val: unknown) => makeBuilder(current.filter((r) => r[col] === val))),
      is: jest.fn((col: string, val: null) => makeBuilder(current.filter((r) => r[col] === val))),
      in: jest.fn((col: string, vals: unknown[]) =>
        makeBuilder(current.filter((r) => vals.includes(r[col])))
      ),
      maybeSingle: jest.fn(async () => ({ data: current[0] ?? null, error: null })),
      then: (resolve: (res: { data: T[]; error: null }) => unknown) =>
        resolve({ data: current, error: null }),
    }
    return builder
  }
}

function createFakeSupabase(args: {
  membershipStatus: string | null
  rows?: PageRowFixture[]
  rpcError?: { message: string } | null
  rpcData?: unknown
  holders?: { id: string; artist_name: string | null }[]
}) {
  const membershipRows =
    args.membershipStatus === null
      ? []
      : [{ workspace_id: WORKSPACE_ID, user_id: ACTOR_ID, status: args.membershipStatus }]
  const membershipTable = makeFilterableTable(membershipRows)
  const profilesTable = makeFilterableTable(
    args.holders ?? [{ id: HOLDER_ID, artist_name: 'Jordan Vale' }]
  )

  const from = jest.fn((table: string) => {
    if (table === 'workspace_members') return membershipTable
    if (table === 'user_profiles') return profilesTable
    throw new Error(`Unexpected table: ${table}`)
  })

  const rpc = jest.fn(async (_fn: string, _params: Record<string, unknown>) => ({
    data: args.rpcError ? null : ('rpcData' in args ? args.rpcData : (args.rows ?? [])),
    error: args.rpcError ?? null,
  }))

  return { from, rpc, membershipTable, profilesTable }
}

function asClient(fake: { from: jest.Mock; rpc: jest.Mock }): SupabaseClient {
  return fake as unknown as SupabaseClient
}

/** Every statement the module issued: one entry per `.from(table)` and one
 * per `.rpc(fn)`. This is the number that must NOT grow with the size of the
 * page. */
function statementCount(fake: { from: jest.Mock; rpc: jest.Mock }): number {
  return fake.from.mock.calls.length + fake.rpc.mock.calls.length
}

const baseArgs = { workspaceId: WORKSPACE_ID, actorUserId: ACTOR_ID }

describe('loadWorkspaceCatalogue', () => {
  // ══ Fail-closed gates ═══════════════════════════════════════════════════
  it('returns an empty list, without ever calling the RPC, when the caller has no active membership', async () => {
    const fake = createFakeSupabase({ membershipStatus: null })

    const result = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(result).toEqual([])
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it('returns an empty list when membership exists but is not active', async () => {
    const fake = createFakeSupabase({ membershipStatus: 'suspended' })

    const result = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(result).toEqual([])
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it('returns an empty array — never a partially populated one — when the RPC errors', async () => {
    const fake = createFakeSupabase({
      membershipStatus: 'active',
      rows: [makeRow(), makeRow({ project_id: PROJECT_B })],
      rpcError: { message: 'function public.workspace_catalogue_page does not exist' },
    })

    const result = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(result).toEqual([])
  })

  it('returns an empty array when the RPC returns no rows at all', async () => {
    const fake = createFakeSupabase({ membershipStatus: 'active', rpcData: null })

    const result = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(result).toEqual([])
  })

  it('returns an empty array when the RPC returns something that is not an array', async () => {
    const fake = createFakeSupabase({ membershipStatus: 'active', rpcData: { unexpected: true } })

    const result = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(result).toEqual([])
  })

  // ══ The RPC call itself ═════════════════════════════════════════════════
  it('calls public.workspace_catalogue_page exactly once, with the workspace, the actor and the page window', async () => {
    const fake = createFakeSupabase({ membershipStatus: 'active', rows: [makeRow()] })

    await loadWorkspaceCatalogue(asClient(fake), { ...baseArgs, limit: 25, offset: 50 })

    expect(fake.rpc).toHaveBeenCalledTimes(1)
    expect(fake.rpc).toHaveBeenCalledWith('workspace_catalogue_page', {
      p_workspace_id: WORKSPACE_ID,
      p_uid: ACTOR_ID,
      p_limit: 25,
      p_offset: 50,
      p_project_id: null,
    })
  })

  it('passes an explicit project id through as p_project_id', async () => {
    const fake = createFakeSupabase({ membershipStatus: 'active', rows: [makeRow()] })

    await loadWorkspaceCatalogue(asClient(fake), { ...baseArgs, projectId: PROJECT_B })

    expect(fake.rpc.mock.calls[0][1]).toMatchObject({ p_project_id: PROJECT_B })
  })

  it('defaults the page size and offset when the caller supplies neither', async () => {
    const fake = createFakeSupabase({ membershipStatus: 'active', rows: [makeRow()] })

    await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(fake.rpc.mock.calls[0][1]).toMatchObject({
      p_limit: WORKSPACE_CATALOGUE_PAGE_DEFAULT,
      p_offset: 0,
    })
  })

  it('reduces a caller-supplied limit above the page maximum rather than passing it through', async () => {
    const fake = createFakeSupabase({ membershipStatus: 'active', rows: [makeRow()] })

    await loadWorkspaceCatalogue(asClient(fake), { ...baseArgs, limit: 10_000 })

    expect(fake.rpc.mock.calls[0][1]).toMatchObject({ p_limit: WORKSPACE_CATALOGUE_PAGE_MAX })
  })

  it('floors a nonsensical limit or offset instead of forwarding it', async () => {
    const fake = createFakeSupabase({ membershipStatus: 'active', rows: [makeRow()] })

    await loadWorkspaceCatalogue(asClient(fake), { ...baseArgs, limit: -5, offset: -20 })

    expect(fake.rpc.mock.calls[0][1]).toMatchObject({ p_limit: 1, p_offset: 0 })
  })

  it('never reads workspace_grants, workspace_attachments or vault_projects itself', async () => {
    const fake = createFakeSupabase({ membershipStatus: 'active', rows: [makeRow()] })

    await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    const tables = fake.from.mock.calls.map((call) => call[0])
    expect(tables).toEqual(['workspace_members', 'user_profiles'])
  })

  // ══ R-10 / WSR-20: bounded, and not by caching ══════════════════════════
  it('issues the SAME number of statements for a fifty-project page as for a one-project page', async () => {
    const onePage = createFakeSupabase({ membershipStatus: 'active', rows: [makeRow()] })
    await loadWorkspaceCatalogue(asClient(onePage), baseArgs)

    const fiftyRows = Array.from({ length: 50 }, (_, i) =>
      makeRow({ project_id: `project-${i}`, title: `Track ${String(i).padStart(3, '0')}` })
    )
    const fiftyPage = createFakeSupabase({ membershipStatus: 'active', rows: fiftyRows })
    const entries = await loadWorkspaceCatalogue(asClient(fiftyPage), baseArgs)

    expect(entries).toHaveLength(50)
    // membership + RPC + the one batched holder-name lookup = 3, either way.
    expect(statementCount(onePage)).toBe(3)
    expect(statementCount(fiftyPage)).toBe(statementCount(onePage))
    expect(fiftyPage.rpc).toHaveBeenCalledTimes(1)
  })

  it('issues the same three statements whether the page holds one holder or fifty distinct holders', async () => {
    const rows = Array.from({ length: 50 }, (_, i) =>
      makeRow({ project_id: `project-${i}`, holder_user_id: `holder-${i}` })
    )
    const fake = createFakeSupabase({ membershipStatus: 'active', rows, holders: [] })

    await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(statementCount(fake)).toBe(3)
    expect(fake.profilesTable.select).toHaveBeenCalledTimes(1)
  })

  it('[D-49, R-10] memoises nothing — two identical consecutive calls issue two RPC calls', async () => {
    const fake = createFakeSupabase({ membershipStatus: 'active', rows: [makeRow()] })

    const first = await loadWorkspaceCatalogue(asClient(fake), baseArgs)
    const second = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(fake.rpc).toHaveBeenCalledTimes(2)
    expect(fake.rpc.mock.calls[0]).toEqual(fake.rpc.mock.calls[1])
    // Both calls re-derived the answer; neither was served from a cache.
    expect(first).toEqual(second)
    expect(statementCount(fake)).toBe(6)
  })

  it('[D-49] a permission revoked between two calls is reflected on the second, with no cache to clear', async () => {
    const fake = createFakeSupabase({ membershipStatus: 'active', rows: [] })
    fake.rpc
      .mockResolvedValueOnce({ data: [makeRow({ metadataVisible: true })], error: null })
      .mockResolvedValueOnce({ data: [makeRow({ metadataVisible: false })], error: null })

    const [before] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)
    const [after] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(before.fields.metadata).toBeDefined()
    expect(after.fields.metadata).toBeUndefined()
  })

  // ══ Entry shape ═════════════════════════════════════════════════════════
  it('carries id, title, type, release date, readiness score and holder display name unconditionally', async () => {
    const fake = createFakeSupabase({ membershipStatus: 'active', rows: [makeRow()] })

    const [entry] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(entry.projectId).toBe(PROJECT_A)
    expect(entry.title).toBe('Midnight Run')
    expect(entry.type).toBe('single')
    expect(entry.releaseDate).toBe('2026-10-01')
    expect(entry.readinessScore).toBe(62)
    expect(entry.holderDisplayName).toBe('Jordan Vale')
  })

  it('preserves the deterministic order the function returned rows in', async () => {
    const rows = [
      makeRow({ project_id: PROJECT_B, title: 'Aurora' }),
      makeRow({ project_id: PROJECT_A, title: 'Midnight Run' }),
    ]
    const fake = createFakeSupabase({ membershipStatus: 'active', rows })

    const entries = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(entries.map((e) => e.projectId)).toEqual([PROJECT_B, PROJECT_A])
  })

  it('reports a null holder display name rather than dropping an entry whose holder has no profile row', async () => {
    const fake = createFakeSupabase({ membershipStatus: 'active', rows: [makeRow()], holders: [] })

    const [entry] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(entry.projectId).toBe(PROJECT_A)
    expect(entry.holderDisplayName).toBeNull()
  })

  it('never exposes the holder user id on the returned entry', async () => {
    const fake = createFakeSupabase({ membershipStatus: 'active', rows: [makeRow()] })

    const [entry] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(JSON.stringify(entry)).not.toContain(HOLDER_ID)
  })

  // ══ Field-level exposure — now decided by the function's two flags ══════
  it('omits `fields.metadata` when the row reports can_view_metadata false', async () => {
    const fake = createFakeSupabase({
      membershipStatus: 'active',
      rows: [makeRow({ metadataVisible: false })],
    })

    const [entry] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(entry.fields.metadata).toBeUndefined()
  })

  it('includes `fields.metadata` when the row reports can_view_metadata true', async () => {
    const fake = createFakeSupabase({
      membershipStatus: 'active',
      rows: [makeRow({ metadataVisible: true })],
    })

    const [entry] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(entry.fields.metadata).toEqual({
      genre: 'R&B',
      subGenre: null,
      label: 'Rise Records',
      publisher: 'Rise Publishing',
      cLine: '2026 Rise Records',
      pLine: '2026 Rise Records',
      copyrightYear: 2026,
      primaryLanguage: 'en',
      contactName: 'Jordan Vale',
      contactEmail: 'jordan@example.com',
      contactPhone: '555-0100',
    })
  })

  it('omits `fields.privateRightsIdentifiers` unless the row reports its own flag true', async () => {
    const fake = createFakeSupabase({
      membershipStatus: 'active',
      rows: [makeRow({ metadataVisible: true, identifiersVisible: false })],
    })

    const [entry] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(entry.fields.privateRightsIdentifiers).toBeUndefined()
  })

  it('includes `fields.privateRightsIdentifiers` when the row reports its own flag true', async () => {
    const fake = createFakeSupabase({
      membershipStatus: 'active',
      rows: [makeRow({ identifiersVisible: true })],
    })

    const [entry] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(entry.fields.privateRightsIdentifiers).toEqual({ upc: '012345678905' })
  })

  it('the two flags are independent — metadata without identifiers, and identifiers without metadata', async () => {
    const fake = createFakeSupabase({
      membershipStatus: 'active',
      rows: [
        makeRow({ project_id: PROJECT_A, metadataVisible: true, identifiersVisible: false }),
        makeRow({ project_id: PROJECT_B, metadataVisible: false, identifiersVisible: true }),
      ],
    })

    const [first, second] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(Object.keys(first.fields)).toEqual(['metadata'])
    expect(Object.keys(second.fields)).toEqual(['privateRightsIdentifiers'])
  })

  it('never populates an `earnings` key on `fields`, even with both flags set', async () => {
    const fake = createFakeSupabase({
      membershipStatus: 'active',
      rows: [makeRow({ metadataVisible: true, identifiersVisible: true })],
    })

    const [entry] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect('earnings' in entry.fields).toBe(false)
  })

  it('never returns a value at any flag combination that looks like a URL or a storage path', async () => {
    const fake = createFakeSupabase({
      membershipStatus: 'active',
      rows: [makeRow({ metadataVisible: true, identifiersVisible: true })],
    })

    const [entry] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    const flat = JSON.stringify(entry)
    expect(flat).not.toMatch(/https?:\/\//i)
    expect(flat).not.toMatch(/\.(mp3|wav|flac|pdf|png|jpg|jpeg)/i)
    expect(flat).not.toMatch(/storage|signed[-_]?url/i)
    for (const key of Object.keys(entry.fields)) {
      expect(key.toLowerCase()).not.toMatch(/url|path|signed/)
    }
  })

  it('[D-26] returns an identical entry shape across two flag sets, differing only in populated `fields` keys — one canonical row, two views', async () => {
    const holderFake = createFakeSupabase({
      membershipStatus: 'active',
      rows: [makeRow({ metadataVisible: false, identifiersVisible: false })],
    })
    const workspaceFake = createFakeSupabase({
      membershipStatus: 'active',
      rows: [makeRow({ metadataVisible: true, identifiersVisible: true })],
    })

    const [holderView] = await loadWorkspaceCatalogue(asClient(holderFake), baseArgs)
    const [workspaceView] = await loadWorkspaceCatalogue(asClient(workspaceFake), baseArgs)

    expect(Object.keys(holderView).sort()).toEqual(Object.keys(workspaceView).sort())
    expect(holderView.projectId).toBe(workspaceView.projectId)
    expect(holderView.title).toBe(workspaceView.title)
    expect(holderView.holderDisplayName).toBe(workspaceView.holderDisplayName)
    expect(Object.keys(holderView.fields)).toEqual([])
    expect(Object.keys(workspaceView.fields).sort()).toEqual(
      ['metadata', 'privateRightsIdentifiers'].sort()
    )
  })
})

describe('summariseCatalogue', () => {
  function entry(overrides: Partial<WorkspaceCatalogueEntry> = {}): WorkspaceCatalogueEntry {
    return {
      projectId: PROJECT_A,
      title: 'Midnight Run',
      type: 'single',
      releaseDate: null,
      readinessScore: 50,
      holderDisplayName: 'Jordan Vale',
      fields: {},
      ...overrides,
    }
  }

  it('counts every entry exactly once by type and by readiness band, excluding nothing', () => {
    const entries = [
      entry({ projectId: '1', type: 'single', readinessScore: 10 }),
      entry({ projectId: '2', type: 'ep', readinessScore: 50 }),
      entry({ projectId: '3', type: 'ep', readinessScore: 90 }),
    ]

    const summary = summariseCatalogue(entries)

    expect(summary.total).toBe(3)
    expect(summary.byType.single).toBe(1)
    expect(summary.byType.ep).toBe(2)
    expect(summary.byReadinessBand).toEqual({ low: 1, medium: 1, high: 1 })
  })

  it('counts the same project once per workspace catalogue it appears in, never merging across calls', () => {
    const workspaceOneCatalogue = [entry({ projectId: PROJECT_A })]
    const workspaceTwoCatalogue = [entry({ projectId: PROJECT_A })]

    const summaryOne = summariseCatalogue(workspaceOneCatalogue)
    const summaryTwo = summariseCatalogue(workspaceTwoCatalogue)

    expect(summaryOne.total).toBe(1)
    expect(summaryTwo.total).toBe(1)
  })
})
