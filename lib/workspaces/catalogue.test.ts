import type { SupabaseClient } from '@supabase/supabase-js'
import { loadWorkspaceCatalogue, summariseCatalogue, type WorkspaceCatalogueEntry } from '@/lib/workspaces/catalogue'
import { resolveEffectivePermissions } from '@/lib/workspaces/grant-service'

jest.mock('@/lib/workspaces/grant-service', () => ({
  resolveEffectivePermissions: jest.fn(),
}))

const mockedResolve = resolveEffectivePermissions as jest.MockedFunction<typeof resolveEffectivePermissions>

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ACTOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const HOLDER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const PROJECT_A = '11111111-1111-1111-1111-111111111111'
const PROJECT_B = '22222222-2222-2222-2222-222222222222'

type ProjectFixture = {
  id: string
  user_id: string
  title: string
  type: string
  release_date: string | null
  vault_readiness_score: number
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

function makeProject(overrides: Partial<ProjectFixture> = {}): ProjectFixture {
  return {
    id: PROJECT_A,
    user_id: HOLDER_ID,
    title: 'Midnight Run',
    type: 'single',
    release_date: '2026-10-01',
    vault_readiness_score: 62,
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
    upc: '012345678905',
    ...overrides,
  }
}

type AttachmentFixture = {
  workspace_id: string
  project_id: string
  detached_at: string | null
  vault_projects: ProjectFixture | null
}

// A small, faithful-enough in-memory table: `.eq`/`.is` narrow an in-flight
// row set exactly like a real Postgres filter would, and the terminal
// `.then` makes the builder itself awaitable — matching supabase-js's own
// thenable query-builder shape (mirrors lib/workspaces/grant-service.test.ts's
// stubbing convention, extended here to actually filter by predicate rather
// than only recording calls, since two behaviors under test here — "a
// detached row produces no entry" and "membership gates the query at all" —
// depend on real filtering rather than only call assertions).
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
  attachments: AttachmentFixture[]
  holders?: { id: string; artist_name: string | null }[]
}) {
  const membershipRows =
    args.membershipStatus === null
      ? []
      : [{ workspace_id: WORKSPACE_ID, user_id: ACTOR_ID, status: args.membershipStatus }]
  const membershipTable = makeFilterableTable(membershipRows)
  const attachmentsTable = makeFilterableTable(args.attachments)
  const profilesTable = makeFilterableTable(args.holders ?? [{ id: HOLDER_ID, artist_name: 'Jordan Vale' }])

  const from = jest.fn((table: string) => {
    if (table === 'workspace_members') return membershipTable
    if (table === 'workspace_attachments') return attachmentsTable
    if (table === 'user_profiles') return profilesTable
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from, membershipTable, attachmentsTable, profilesTable }
}

function asClient(fake: { from: jest.Mock }): SupabaseClient {
  return fake as unknown as SupabaseClient
}

const baseArgs = { workspaceId: WORKSPACE_ID, actorUserId: ACTOR_ID }

beforeEach(() => {
  mockedResolve.mockReset()
  mockedResolve.mockResolvedValue(new Set())
})

describe('loadWorkspaceCatalogue', () => {
  it('returns an empty list, without querying attachments or projects, when the caller has no active membership', async () => {
    const fake = createFakeSupabase({ membershipStatus: null, attachments: [] })

    const result = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(result).toEqual([])
    expect(fake.attachmentsTable.select).not.toHaveBeenCalled()
  })

  it('returns an empty list when membership exists but is not active', async () => {
    const fake = createFakeSupabase({ membershipStatus: 'suspended', attachments: [] })

    const result = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(result).toEqual([])
    expect(fake.attachmentsTable.select).not.toHaveBeenCalled()
  })

  it('returns one entry per live attachment and never an entry for a detached attachment', async () => {
    const liveProject = makeProject({ id: PROJECT_A })
    const detachedProject = makeProject({ id: PROJECT_B, title: 'Shelved Idea' })

    const fake = createFakeSupabase({
      membershipStatus: 'active',
      attachments: [
        { workspace_id: WORKSPACE_ID, project_id: PROJECT_A, detached_at: null, vault_projects: liveProject },
        {
          workspace_id: WORKSPACE_ID,
          project_id: PROJECT_B,
          detached_at: '2026-01-01T00:00:00.000Z',
          vault_projects: detachedProject,
        },
      ],
    })

    const result = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(result).toHaveLength(1)
    expect(result[0].projectId).toBe(PROJECT_A)
    expect(result.some((e) => e.projectId === PROJECT_B)).toBe(false)
  })

  it('produces no entry for an attachment whose project row RLS declined to join (null nested project)', async () => {
    const fake = createFakeSupabase({
      membershipStatus: 'active',
      attachments: [
        { workspace_id: WORKSPACE_ID, project_id: PROJECT_A, detached_at: null, vault_projects: null },
      ],
    })

    const result = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(result).toEqual([])
  })

  it('carries id, title, type, release date, readiness score and holder display name unconditionally', async () => {
    const fake = createFakeSupabase({
      membershipStatus: 'active',
      attachments: [
        { workspace_id: WORKSPACE_ID, project_id: PROJECT_A, detached_at: null, vault_projects: makeProject() },
      ],
    })

    const [entry] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(entry.projectId).toBe(PROJECT_A)
    expect(entry.title).toBe('Midnight Run')
    expect(entry.type).toBe('single')
    expect(entry.releaseDate).toBe('2026-10-01')
    expect(entry.readinessScore).toBe(62)
    expect(entry.holderDisplayName).toBe('Jordan Vale')
  })

  it('omits `fields.metadata` when view_metadata is not in the resolved permission set', async () => {
    mockedResolve.mockResolvedValue(new Set())
    const fake = createFakeSupabase({
      membershipStatus: 'active',
      attachments: [
        { workspace_id: WORKSPACE_ID, project_id: PROJECT_A, detached_at: null, vault_projects: makeProject() },
      ],
    })

    const [entry] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(entry.fields.metadata).toBeUndefined()
  })

  it('includes `fields.metadata` when view_metadata is in the resolved permission set', async () => {
    mockedResolve.mockResolvedValue(new Set(['view_metadata']) as any)
    const fake = createFakeSupabase({
      membershipStatus: 'active',
      attachments: [
        { workspace_id: WORKSPACE_ID, project_id: PROJECT_A, detached_at: null, vault_projects: makeProject() },
      ],
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

  it('omits `fields.privateRightsIdentifiers` unless view_private_rights_identifiers is present', async () => {
    mockedResolve.mockResolvedValue(new Set(['view_metadata']) as any)
    const fake = createFakeSupabase({
      membershipStatus: 'active',
      attachments: [
        { workspace_id: WORKSPACE_ID, project_id: PROJECT_A, detached_at: null, vault_projects: makeProject() },
      ],
    })

    const [entry] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(entry.fields.privateRightsIdentifiers).toBeUndefined()
  })

  it('includes `fields.privateRightsIdentifiers` when view_private_rights_identifiers is present', async () => {
    mockedResolve.mockResolvedValue(new Set(['view_private_rights_identifiers']) as any)
    const fake = createFakeSupabase({
      membershipStatus: 'active',
      attachments: [
        { workspace_id: WORKSPACE_ID, project_id: PROJECT_A, detached_at: null, vault_projects: makeProject() },
      ],
    })

    const [entry] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(entry.fields.privateRightsIdentifiers).toEqual({ upc: '012345678905' })
  })

  it('never populates an `earnings` key on `fields`, even when every permission is granted', async () => {
    mockedResolve.mockResolvedValue(
      new Set([
        'view_summaries',
        'view_metadata',
        'edit_metadata',
        'access_writers_room',
        'upload_audio',
        'download_protected_audio',
        'access_clean_masters',
        'invite_collaborators',
        'view_split_sheets',
        'view_contracts',
        'upload_contracts',
        'request_signatures',
        'view_private_rights_identifiers',
        'edit_rights_information',
        'manage_registrations',
        'approve_releases',
        'deliver_assets',
        'view_earnings',
        'act_on_behalf',
      ]) as any
    )
    const fake = createFakeSupabase({
      membershipStatus: 'active',
      attachments: [
        { workspace_id: WORKSPACE_ID, project_id: PROJECT_A, detached_at: null, vault_projects: makeProject() },
      ],
    })

    const [entry] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect('earnings' in entry.fields).toBe(false)
  })

  it('never returns a value at any permission level that looks like a URL or a storage path', async () => {
    mockedResolve.mockResolvedValue(
      new Set(['view_metadata', 'view_private_rights_identifiers', 'access_clean_masters']) as any
    )
    const fake = createFakeSupabase({
      membershipStatus: 'active',
      attachments: [
        { workspace_id: WORKSPACE_ID, project_id: PROJECT_A, detached_at: null, vault_projects: makeProject() },
      ],
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

  it('[D-26] returns an identical entry shape across two different resolved permission sets, differing only in populated `fields` keys — one canonical row, two views', async () => {
    const fake = createFakeSupabase({
      membershipStatus: 'active',
      attachments: [
        { workspace_id: WORKSPACE_ID, project_id: PROJECT_A, detached_at: null, vault_projects: makeProject() },
      ],
    })

    mockedResolve.mockResolvedValue(new Set() as any)
    const [holderView] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    mockedResolve.mockResolvedValue(new Set(['view_metadata', 'view_private_rights_identifiers']) as any)
    const [workspaceView] = await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    // Same top-level shape (same key set) for both callers.
    expect(Object.keys(holderView).sort()).toEqual(Object.keys(workspaceView).sort())
    // Same identifying values — one canonical project row underneath both.
    expect(holderView.projectId).toBe(workspaceView.projectId)
    expect(holderView.title).toBe(workspaceView.title)
    expect(holderView.holderDisplayName).toBe(workspaceView.holderDisplayName)
    // Only the populated `fields` keys differ.
    expect(Object.keys(holderView.fields)).toEqual([])
    expect(Object.keys(workspaceView.fields).sort()).toEqual(
      ['metadata', 'privateRightsIdentifiers'].sort()
    )
  })

  it('resolves permissions through resolveEffectivePermissions and never reads workspace_grants directly', async () => {
    const fake = createFakeSupabase({
      membershipStatus: 'active',
      attachments: [
        { workspace_id: WORKSPACE_ID, project_id: PROJECT_A, detached_at: null, vault_projects: makeProject() },
      ],
    })

    await loadWorkspaceCatalogue(asClient(fake), baseArgs)

    expect(mockedResolve).toHaveBeenCalledWith(
      asClient(fake),
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        actorUserId: ACTOR_ID,
        subjectMemberId: HOLDER_ID,
        projectId: PROJECT_A,
      })
    )
    // No call in this module ever names the raw grants table.
    for (const call of fake.from.mock.calls) {
      expect(call[0]).not.toBe('workspace_grants')
    }
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
