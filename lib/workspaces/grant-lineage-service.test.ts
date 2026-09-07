import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadRelationshipGrantChain,
  resolveConsentRootPermissions,
  resolveLivePermissionsForRelationship,
} from '@/lib/workspaces/grant-lineage-service'
import { MEMBER_CONSENT_SOURCE } from '@/lib/workspaces/grant-lineage'

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const RELATIONSHIP_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const PROJECT_A = '11111111-1111-1111-1111-111111111111'
const PROJECT_B = '22222222-2222-2222-2222-222222222222'

type Rows = Record<string, unknown>[]
type Res = { data: Rows | null; error: { message: string } | null }

type RawRow = {
  id: string
  parent_grant_id: string | null
  source: string
  permission: string
  project_id: string | null
  revoked_at: string | null
  relationship_id: string
}

function row(overrides: Partial<RawRow> = {}): RawRow {
  return {
    id: 'root',
    parent_grant_id: null,
    source: MEMBER_CONSENT_SOURCE,
    permission: 'view_metadata',
    project_id: null,
    revoked_at: null,
    relationship_id: RELATIONSHIP_ID,
    ...overrides,
  }
}

// Reads the CURRENT `respond` function on every invocation (not a captured
// one-time value) — this is what lets a test mutate the closed-over data
// between two calls to prove the resolvers re-derive rather than cache
// (D-49), mirroring grant-service.test.ts's createFakeSupabase convention.
function fakeSupabase(respond: () => Res) {
  const eq2 = jest.fn(async () => respond())
  const eq1 = jest.fn(() => ({ eq: eq2 }))
  const select = jest.fn(() => ({ eq: eq1 }))
  const from = jest.fn((table: string) => {
    if (table !== 'workspace_grants') throw new Error(`Unexpected table: ${table}`)
    return { select }
  })
  return { from, select, eq1, eq2 }
}

function asClient(fake: ReturnType<typeof fakeSupabase>): SupabaseClient {
  return fake as unknown as SupabaseClient
}

describe('loadRelationshipGrantChain', () => {
  it('issues exactly one query and maps snake_case columns to the camelCase GrantChainRow shape', async () => {
    const fake = fakeSupabase(() => ({ data: [row()], error: null }))

    const result = await loadRelationshipGrantChain(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
    })

    expect(fake.eq2).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          id: 'root',
          parentGrantId: null,
          source: MEMBER_CONSENT_SOURCE,
          permission: 'view_metadata',
          projectId: null,
          revokedAt: null,
          relationshipId: RELATIONSHIP_ID,
        },
      ],
    })
    expect(fake.eq1).toHaveBeenCalledWith('workspace_id', WORKSPACE_ID)
    expect(fake.eq2).toHaveBeenCalledWith('relationship_id', RELATIONSHIP_ID)
  })

  it('fails closed to a 500 on a select error, never a permissive default', async () => {
    const fake = fakeSupabase(() => ({ data: null, error: { message: 'db down' } }))

    const result = await loadRelationshipGrantChain(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
    })

    expect(result.ok).toBe(false)
  })

  it('does not filter out revoked rows — the walker needs to see a revoked ancestor to refuse the chain', async () => {
    const fake = fakeSupabase(() => ({
      data: [row({ id: 'root', revoked_at: '2020-01-01T00:00:00.000Z' })],
      error: null,
    }))

    const result = await loadRelationshipGrantChain(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.rows[0].revokedAt).not.toBeNull()
  })
})

describe('resolveLivePermissionsForRelationship', () => {
  it('a relationship with a consent root and no delegated rows returns the roots own permissions', async () => {
    const fake = fakeSupabase(() => ({
      data: [row({ id: 'root', permission: 'view_metadata' })],
      error: null,
    }))

    const result = await resolveLivePermissionsForRelationship(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
    })

    expect(result.has('view_metadata')).toBe(true)
  })

  it('keeps a delegated permission whose chain terminates at a live consent root', async () => {
    const fake = fakeSupabase(() => ({
      data: [
        row({ id: 'root', permission: 'view_metadata' }),
        row({
          id: 'child',
          parent_grant_id: 'root',
          source: 'individual',
          permission: 'view_metadata',
        }),
      ],
      error: null,
    }))

    const result = await resolveLivePermissionsForRelationship(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
    })

    expect(result.has('view_metadata')).toBe(true)
  })

  it('a revoked root removes every descendants permission from the returned set in the same call', async () => {
    const fake = fakeSupabase(() => ({
      data: [
        row({ id: 'root', permission: 'view_metadata', revoked_at: '2020-01-01T00:00:00.000Z' }),
        row({
          id: 'child',
          parent_grant_id: 'root',
          source: 'individual',
          permission: 'view_metadata',
        }),
      ],
      error: null,
    }))

    const result = await resolveLivePermissionsForRelationship(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
    })

    expect(result.size).toBe(0)
  })

  it('returns an empty set on a select error, never a permissive default', async () => {
    const fake = fakeSupabase(() => ({ data: null, error: { message: 'db down' } }))

    const result = await resolveLivePermissionsForRelationship(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
    })

    expect(result.size).toBe(0)
  })

  it('includes a matching per-project row and a relationship-wide row, excludes a non-matching project row', async () => {
    const fake = fakeSupabase(() => ({
      data: [
        row({ id: 'root-a', permission: 'upload_audio', project_id: PROJECT_A }),
        row({ id: 'root-wide', permission: 'view_metadata', project_id: null }),
        row({ id: 'root-b', permission: 'edit_metadata', project_id: PROJECT_B }),
      ],
      error: null,
    }))

    const result = await resolveLivePermissionsForRelationship(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      projectId: PROJECT_A,
    })

    expect(result.has('upload_audio')).toBe(true)
    expect(result.has('view_metadata')).toBe(true)
    expect(result.has('edit_metadata')).toBe(false)
  })

  it('is never memoised — two calls issue two queries, and a revocation between them changes the second result', async () => {
    let data: Rows = [row({ id: 'root', permission: 'view_metadata' })]
    const fake = fakeSupabase(() => ({ data, error: null }))

    const first = await resolveLivePermissionsForRelationship(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
    })
    expect(first.has('view_metadata')).toBe(true)

    data = [row({ id: 'root', permission: 'view_metadata', revoked_at: '2020-01-01T00:00:00.000Z' })]

    const second = await resolveLivePermissionsForRelationship(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
    })
    expect(second.has('view_metadata')).toBe(false)

    expect(fake.eq2).toHaveBeenCalledTimes(2)
  })
})

describe('resolveConsentRootPermissions', () => {
  it('returns only permissions carried by live member-consent root rows, excluding a delegated row', async () => {
    const fake = fakeSupabase(() => ({
      data: [
        row({ id: 'root', source: MEMBER_CONSENT_SOURCE, permission: 'view_metadata' }),
        row({
          id: 'child',
          parent_grant_id: 'root',
          source: 'individual',
          permission: 'upload_audio',
        }),
      ],
      error: null,
    }))

    const result = await resolveConsentRootPermissions(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
    })

    expect([...result]).toEqual(['view_metadata'])
  })

  it('excludes a revoked consent root', async () => {
    const fake = fakeSupabase(() => ({
      data: [
        row({
          id: 'root',
          source: MEMBER_CONSENT_SOURCE,
          permission: 'view_metadata',
          revoked_at: '2020-01-01T00:00:00.000Z',
        }),
      ],
      error: null,
    }))

    const result = await resolveConsentRootPermissions(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
    })

    expect(result.size).toBe(0)
  })

  it('[F6] the bootstrap case: a Member consent root with zero delegated rows still supplies granterHolds', async () => {
    const fake = fakeSupabase(() => ({
      data: [row({ id: 'root', source: MEMBER_CONSENT_SOURCE, permission: 'upload_audio' })],
      error: null,
    }))

    const result = await resolveConsentRootPermissions(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
    })

    expect(result.has('upload_audio')).toBe(true)
  })

  it('returns an empty set on a select error, never a permissive default', async () => {
    const fake = fakeSupabase(() => ({ data: null, error: { message: 'db down' } }))

    const result = await resolveConsentRootPermissions(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
    })

    expect(result.size).toBe(0)
  })

  it('is never memoised — two calls issue two queries', async () => {
    const fake = fakeSupabase(() => ({ data: [row()], error: null }))

    await resolveConsentRootPermissions(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
    })
    await resolveConsentRootPermissions(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
    })

    expect(fake.eq2).toHaveBeenCalledTimes(2)
  })
})
