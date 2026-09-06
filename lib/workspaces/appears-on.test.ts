import type { SupabaseClient } from '@supabase/supabase-js'
import * as AppearsOn from '@/lib/workspaces/appears-on'
import { partitionVaultLanes, resolveAppearsOnRows } from '@/lib/workspaces/appears-on'

const CALLER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const HOLDER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const OTHER_HOLDER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const WORKSPACE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

type Result<T> = { data: T | null; error: { message: string } | null }

// A single chainable stub per table: every chain method (`select`, `neq`,
// `not`, `eq`, `in`, `is`) returns the SAME object, which also resolves
// (via `.then`) to the fixed result it was built with. This module's own
// filtering happens in JS after the query resolves (see appears-on.ts's own
// header), so the stub never needs to interpret what a filter argument
// means — it only needs to hand back the row set the test wants to prove
// the JS-side filter against.
function chainable<T>(result: Result<T>) {
  const obj: Record<string, unknown> = {
    then: (resolve: (value: Result<T>) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }
  for (const method of ['select', 'neq', 'not', 'eq', 'in', 'is', 'order']) {
    obj[method] = jest.fn(() => obj)
  }
  return obj
}

function createFakeSupabase(responses: {
  projects?: Result<Record<string, unknown>[]>
  attachments?: Result<Record<string, unknown>[]>
  profiles?: Result<Record<string, unknown>[]>
  relationships?: Result<Record<string, unknown>[]>
}) {
  const projectsChain = chainable(responses.projects ?? { data: [], error: null })
  const attachmentsChain = chainable(responses.attachments ?? { data: [], error: null })
  const profilesChain = chainable(responses.profiles ?? { data: [], error: null })
  const relationshipsChain = chainable(responses.relationships ?? { data: [], error: null })

  const from = jest.fn((table: string) => {
    if (table === 'vault_projects') return projectsChain
    if (table === 'workspace_attachments') return attachmentsChain
    if (table === 'user_profiles') return profilesChain
    if (table === 'workspace_roster_relationships') return relationshipsChain
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from, projectsChain, attachmentsChain, profilesChain, relationshipsChain }
}

function asClient(fake: { from: jest.Mock }): SupabaseClient {
  return { from: fake.from } as unknown as SupabaseClient
}

describe('resolveAppearsOnRows', () => {
  it('excludes a project where the caller is the custodian, even if the stubbed query returns one', async () => {
    const fake = createFakeSupabase({
      projects: {
        data: [
          { id: 'p1', title: 'Own Song', user_id: CALLER_ID },
          { id: 'p2', title: 'Producer Credit', user_id: HOLDER_ID },
        ],
        error: null,
      },
      attachments: { data: [{ project_id: 'p2', workspace_id: WORKSPACE_ID }], error: null },
      profiles: { data: [{ id: HOLDER_ID, artist_name: 'Holder Name' }], error: null },
      relationships: { data: [{ workspace_id: WORKSPACE_ID, professional_role: 'Producer' }], error: null },
    })

    const rows = await resolveAppearsOnRows(asClient(fake), { userId: CALLER_ID, excludeProjectIds: [] })
    expect(rows.map((r) => r.projectId)).toEqual(['p2'])
  })

  it('excludes a project already resolved by the owned/shared lanes (surfaces once, not twice)', async () => {
    const fake = createFakeSupabase({
      projects: {
        data: [
          { id: 'p2', title: 'Already Shared', user_id: HOLDER_ID },
          { id: 'p3', title: 'Genuinely Workspace-Only', user_id: HOLDER_ID },
        ],
        error: null,
      },
      attachments: { data: [{ project_id: 'p3', workspace_id: WORKSPACE_ID }], error: null },
      profiles: { data: [{ id: HOLDER_ID, artist_name: 'Holder Name' }], error: null },
      relationships: { data: [{ workspace_id: WORKSPACE_ID, professional_role: 'Engineer' }], error: null },
    })

    const rows = await resolveAppearsOnRows(asClient(fake), {
      userId: CALLER_ID,
      excludeProjectIds: ['p2'],
    })
    expect(rows.map((r) => r.projectId)).toEqual(['p3'])
  })

  it('carries the holding Member’s display name and the caller’s contribution role', async () => {
    const fake = createFakeSupabase({
      projects: { data: [{ id: 'p1', title: 'Rough Mix', user_id: HOLDER_ID }], error: null },
      attachments: { data: [{ project_id: 'p1', workspace_id: WORKSPACE_ID }], error: null },
      profiles: { data: [{ id: HOLDER_ID, artist_name: 'Maya Reyes' }], error: null },
      relationships: { data: [{ workspace_id: WORKSPACE_ID, professional_role: 'Mix Engineer' }], error: null },
    })

    const rows = await resolveAppearsOnRows(asClient(fake), { userId: CALLER_ID, excludeProjectIds: [] })
    expect(rows).toEqual([
      {
        projectId: 'p1',
        title: 'Rough Mix',
        holderUserId: HOLDER_ID,
        holderName: 'Maya Reyes',
        contributionRole: 'Mix Engineer',
        readOnly: true,
      },
    ])
  })

  it('every returned row is marked read-only', async () => {
    const fake = createFakeSupabase({
      projects: {
        data: [
          { id: 'p1', title: 'A', user_id: HOLDER_ID },
          { id: 'p2', title: 'B', user_id: OTHER_HOLDER_ID },
        ],
        error: null,
      },
    })

    const rows = await resolveAppearsOnRows(asClient(fake), { userId: CALLER_ID, excludeProjectIds: [] })
    expect(rows.length).toBe(2)
    for (const row of rows) expect(row.readOnly).toBe(true)
  })

  it('degrades to a null holder name and null contribution role when no attachment/profile row resolves', async () => {
    const fake = createFakeSupabase({
      projects: { data: [{ id: 'p1', title: 'Orphaned Row', user_id: HOLDER_ID }], error: null },
    })

    const rows = await resolveAppearsOnRows(asClient(fake), { userId: CALLER_ID, excludeProjectIds: [] })
    expect(rows).toEqual([
      {
        projectId: 'p1',
        title: 'Orphaned Row',
        holderUserId: HOLDER_ID,
        holderName: null,
        contributionRole: null,
        readOnly: true,
      },
    ])
  })

  it('returns an empty array on a query error rather than throwing', async () => {
    const fake = createFakeSupabase({ projects: { data: null, error: { message: 'db down' } } })
    await expect(
      resolveAppearsOnRows(asClient(fake), { userId: CALLER_ID, excludeProjectIds: [] })
    ).resolves.toEqual([])
  })

  it('returns an empty array for a missing userId without querying', async () => {
    const fake = createFakeSupabase({})
    const rows = await resolveAppearsOnRows(asClient(fake), { userId: '', excludeProjectIds: [] })
    expect(rows).toEqual([])
    expect(fake.from).not.toHaveBeenCalled()
  })

  it('exports no write helper — no function name begins with update, create, delete or save', () => {
    for (const key of Object.keys(AppearsOn)) {
      expect(key).not.toMatch(/^(update|create|delete|save)/i)
    }
  })
})

describe('partitionVaultLanes', () => {
  it('returns three pairwise-disjoint sets', () => {
    const { owned, shared, appearsOn } = partitionVaultLanes({
      ownedIds: ['o1', 'o2'],
      sharedIds: ['s1'],
      appearsOnIds: ['a1'],
    })

    for (const id of owned) {
      expect(shared.has(id)).toBe(false)
      expect(appearsOn.has(id)).toBe(false)
    }
    for (const id of shared) {
      expect(owned.has(id)).toBe(false)
      expect(appearsOn.has(id)).toBe(false)
    }
    for (const id of appearsOn) {
      expect(owned.has(id)).toBe(false)
      expect(shared.has(id)).toBe(false)
    }
  })

  it('resolves a project id fed into two lanes to exactly one lane (owned wins over shared)', () => {
    const { owned, shared, appearsOn } = partitionVaultLanes({
      ownedIds: ['dup'],
      sharedIds: ['dup'],
      appearsOnIds: [],
    })
    expect(owned.has('dup')).toBe(true)
    expect(shared.has('dup')).toBe(false)
    expect(appearsOn.has('dup')).toBe(false)
  })

  it('resolves a project id fed into two lanes to exactly one lane (shared wins over appears-on)', () => {
    const { shared, appearsOn } = partitionVaultLanes({
      ownedIds: [],
      sharedIds: ['dup'],
      appearsOnIds: ['dup'],
    })
    expect(shared.has('dup')).toBe(true)
    expect(appearsOn.has('dup')).toBe(false)
  })

  it('a project id reachable via all three inputs still surfaces in exactly one lane', () => {
    const { owned, shared, appearsOn } = partitionVaultLanes({
      ownedIds: ['dup'],
      sharedIds: ['dup'],
      appearsOnIds: ['dup'],
    })
    const membership = [owned.has('dup'), shared.has('dup'), appearsOn.has('dup')].filter(Boolean)
    expect(membership.length).toBe(1)
  })

  it('excludes appears-on ids from the owned set used for scoreboard math, matching the existing shared-row exclusion', () => {
    const { owned } = partitionVaultLanes({
      ownedIds: ['o1'],
      sharedIds: ['s1'],
      appearsOnIds: ['a1'],
    })
    expect(owned.has('a1')).toBe(false)
    expect(owned.has('s1')).toBe(false)
    expect(Array.from(owned)).toEqual(['o1'])
  })
})
