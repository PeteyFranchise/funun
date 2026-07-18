// Plan 13-03: Hard Block Enforcement Audit.
//
// This suite pins the audit's findings across every surface listed in the
// plan: it does NOT re-test what 13-02 (block/unblock API), migrations
// 059/060 (Green Room feed/interaction reads), or dm-send-gate.test.ts (DM
// send) already cover — it covers the NEW app-layer gates this plan added
// (follows/connections/wall/endorsements/release-comments) plus content
// pins confirming which DB policies already enforce no_block() and which
// (release_comments) still do not.

import { readFileSync } from 'fs'
import path from 'path'
import { isBlockedRelativeTo, BLOCKED_ACTION_ERROR, BLOCKED_ACTION_STATUS } from '@/lib/trust-safety/block-check'
import { loadWall } from '@/lib/social/wall'
import { loadEndorsements } from '@/lib/social/endorsements'
import { loadReleaseComments } from '@/lib/social/comments'

function readMigration(file: string): string {
  return readFileSync(path.join(process.cwd(), 'supabase/migrations', file), 'utf8')
}

// A chainable query-builder spy mirroring the pattern already used in
// __tests__/green-room-discover.test.ts — thenable so it can stand in for a
// PostgREST builder no matter where the chain terminates.
function tableBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'or', 'order', 'limit', 'in']) {
    builder[m] = jest.fn(() => builder)
  }
  builder.maybeSingle = jest.fn(async () => ({ data: rows[0] ?? null, error: null }))
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null })
  return builder
}

describe('lib/trust-safety/block-check — isBlockedRelativeTo', () => {
  it('returns false for the same id without querying', async () => {
    const service = { from: jest.fn() }
    const result = await isBlockedRelativeTo(service as never, 'me', 'me')
    expect(result).toBe(false)
    expect(service.from).not.toHaveBeenCalled()
  })

  it('returns true when the other id appears in the bidirectional blocked set', async () => {
    const service = {
      from: jest.fn(() =>
        tableBuilder([{ blocker_id: 'me', blocked_id: 'them' }])
      ),
    }
    const result = await isBlockedRelativeTo(service as never, 'me', 'them')
    expect(result).toBe(true)
  })

  it('returns true when the OTHER party placed the block (viewer never sees that direction elsewhere)', async () => {
    const service = {
      from: jest.fn(() =>
        tableBuilder([{ blocker_id: 'them', blocked_id: 'me' }])
      ),
    }
    const result = await isBlockedRelativeTo(service as never, 'me', 'them')
    expect(result).toBe(true)
  })

  it('returns false when no block row exists either direction', async () => {
    const service = { from: jest.fn(() => tableBuilder([])) }
    const result = await isBlockedRelativeTo(service as never, 'me', 'them')
    expect(result).toBe(false)
  })

  it('never mentions "block" in the shared generic error, and uses a 400', () => {
    expect(BLOCKED_ACTION_ERROR.toLowerCase()).not.toContain('block')
    expect(BLOCKED_ACTION_STATUS).toBe(400)
  })
})

describe('app/api/follows/route.ts — block gate', () => {
  const ORIGINAL_ENV = process.env.NEXT_PUBLIC_VAULT_DEMO

  beforeEach(() => {
    jest.resetModules()
    process.env.NEXT_PUBLIC_VAULT_DEMO = 'false'
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_VAULT_DEMO = ORIGINAL_ENV
  })

  function jsonRequest(body: unknown) {
    return new Request('http://test.local/api/follows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('rejects a follow across a block with the shared generic error, before touching the follows table', async () => {
    jest.doMock('@/lib/supabase/server', () => ({
      createApiClient: jest.fn().mockResolvedValue({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'me' } } }) },
      }),
      createServiceClient: jest.fn(() => ({
        from: jest.fn(() => tableBuilder([{ blocker_id: 'them', blocked_id: 'me' }])),
      })),
    }))
    jest.doMock('@/lib/notifications', () => ({ createNotification: jest.fn() }))

    const { POST } = await import('@/app/api/follows/route')
    const res = await POST(jsonRequest({ followeeId: 'them' }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: BLOCKED_ACTION_ERROR })
  })

  it('allows a follow when no block exists', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null })
    jest.doMock('@/lib/supabase/server', () => ({
      createApiClient: jest.fn().mockResolvedValue({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'me' } } }) },
        from: jest.fn((table: string) => {
          if (table === 'follows') return { upsert }
          if (table === 'artist_profiles') return tableBuilder([])
          throw new Error(`Unexpected table: ${table}`)
        }),
      }),
      createServiceClient: jest.fn(() => ({ from: jest.fn(() => tableBuilder([])) })),
    }))
    jest.doMock('@/lib/notifications', () => ({ createNotification: jest.fn() }))

    const { POST } = await import('@/app/api/follows/route')
    const res = await POST(jsonRequest({ followeeId: 'them' }))

    expect(res.status).toBe(200)
    expect(upsert).toHaveBeenCalled()
  })
})

describe('app/api/connections/route.ts POST — block gate', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env.NEXT_PUBLIC_VAULT_DEMO = 'false'
  })

  function jsonRequest(body: unknown) {
    return new Request('http://test.local/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('rejects a connection request across a block before the existingActive precheck runs', async () => {
    const existingActiveQuery = jest.fn()
    jest.doMock('@/lib/supabase/server', () => ({
      createApiClient: jest.fn().mockResolvedValue({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'me' } } }) },
        from: jest.fn((table: string) => {
          if (table === 'connections') {
            existingActiveQuery()
            return tableBuilder([])
          }
          throw new Error(`Unexpected table: ${table}`)
        }),
      }),
      createServiceClient: jest.fn(() => ({
        from: jest.fn(() => tableBuilder([{ blocker_id: 'me', blocked_id: 'them' }])),
      })),
    }))
    jest.doMock('@/lib/notifications', () => ({ createNotification: jest.fn() }))

    const { POST } = await import('@/app/api/connections/route')
    const res = await POST(jsonRequest({ addresseeId: 'them' }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: BLOCKED_ACTION_ERROR })
    expect(existingActiveQuery).not.toHaveBeenCalled()
  })
})

describe('app/api/wall/route.ts POST — block gate', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env.NEXT_PUBLIC_VAULT_DEMO = 'false'
  })

  function jsonRequest(body: unknown) {
    return new Request('http://test.local/api/wall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('rejects a wall post across a block before inserting', async () => {
    const insert = jest.fn()
    jest.doMock('@/lib/supabase/server', () => ({
      createApiClient: jest.fn().mockResolvedValue({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'me' } } }) },
        from: jest.fn((table: string) => {
          if (table === 'wall_posts') return { insert }
          throw new Error(`Unexpected table: ${table}`)
        }),
      }),
      createServiceClient: jest.fn(() => ({
        from: jest.fn(() => tableBuilder([{ blocker_id: 'them', blocked_id: 'me' }])),
      })),
    }))
    jest.doMock('@/lib/notifications', () => ({ createNotification: jest.fn() }))

    const { POST } = await import('@/app/api/wall/route')
    const res = await POST(jsonRequest({ profileId: 'them', body: 'hey!' }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: BLOCKED_ACTION_ERROR })
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('app/api/endorsements/route.ts POST — block gate', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env.NEXT_PUBLIC_VAULT_DEMO = 'false'
  })

  function jsonRequest(body: unknown) {
    return new Request('http://test.local/api/endorsements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('rejects an endorsement across a block before upserting', async () => {
    const upsert = jest.fn()
    jest.doMock('@/lib/supabase/server', () => ({
      createApiClient: jest.fn().mockResolvedValue({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'me' } } }) },
        from: jest.fn((table: string) => {
          if (table === 'endorsements') return { upsert }
          throw new Error(`Unexpected table: ${table}`)
        }),
      }),
      createServiceClient: jest.fn(() => ({
        from: jest.fn(() => tableBuilder([{ blocker_id: 'me', blocked_id: 'them' }])),
      })),
    }))
    jest.doMock('@/lib/notifications', () => ({ createNotification: jest.fn() }))

    const { POST } = await import('@/app/api/endorsements/route')
    const res = await POST(jsonRequest({ profileId: 'them', body: 'Great collaborator!' }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: BLOCKED_ACTION_ERROR })
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('app/api/release-comments/route.ts POST — block gate (app-layer only; see migration content pin below)', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env.NEXT_PUBLIC_VAULT_DEMO = 'false'
  })

  function jsonRequest(body: unknown) {
    return new Request('http://test.local/api/release-comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('rejects a comment on a blocked project owner\'s release before inserting', async () => {
    const insert = jest.fn()
    jest.doMock('@/lib/supabase/server', () => ({
      createApiClient: jest.fn().mockResolvedValue({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'me' } } }) },
        from: jest.fn((table: string) => {
          if (table === 'vault_projects') {
            return tableBuilder([{ user_id: 'owner-1', title: 'My Release' }])
          }
          if (table === 'release_comments') return { insert }
          throw new Error(`Unexpected table: ${table}`)
        }),
      }),
      createServiceClient: jest.fn(() => ({
        from: jest.fn(() => tableBuilder([{ blocker_id: 'owner-1', blocked_id: 'me' }])),
      })),
    }))
    jest.doMock('@/lib/notifications', () => ({ createNotification: jest.fn() }))

    const { POST } = await import('@/app/api/release-comments/route')
    const res = await POST(jsonRequest({ projectId: 'proj-1', body: 'Loved this!' }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: BLOCKED_ACTION_ERROR })
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('lib/social/wall.ts loadWall — read-side block filter', () => {
  it('excludes posts authored by a blocked-relative id', async () => {
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'wall_posts') {
          return tableBuilder([
            { id: 'w1', body: 'hi', created_at: '2026-01-01T00:00:00Z', author_id: 'them' },
            { id: 'w2', body: 'hello', created_at: '2026-01-02T00:00:00Z', author_id: 'friend' },
          ])
        }
        if (table === 'artist_profiles') {
          return tableBuilder([{ id: 'friend', artist_name: 'Friend', avatar_url: null, roles: [] }])
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }
    const result = await loadWall(supabase as never, 'owner-1', new Set(['them']))
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('w2')
  })

  it('defaults to no filtering when blockedIds is omitted (back-compat)', async () => {
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'wall_posts') {
          return tableBuilder([{ id: 'w1', body: 'hi', created_at: '2026-01-01T00:00:00Z', author_id: 'them' }])
        }
        if (table === 'artist_profiles') return tableBuilder([])
        throw new Error(`Unexpected table: ${table}`)
      }),
    }
    const result = await loadWall(supabase as never, 'owner-1')
    expect(result).toHaveLength(1)
  })
})

describe('lib/social/endorsements.ts loadEndorsements — read-side block filter', () => {
  it('excludes endorsements authored by a blocked-relative id but preserves viewerHasEndorsed', async () => {
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'endorsements') {
          return tableBuilder([
            { id: 'e1', body: 'great!', created_at: '2026-01-01T00:00:00Z', author_id: 'them' },
            { id: 'e2', body: 'nice work', created_at: '2026-01-02T00:00:00Z', author_id: 'me' },
          ])
        }
        if (table === 'artist_profiles') {
          return tableBuilder([{ id: 'me', artist_name: 'Me', avatar_url: null, roles: [] }])
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }
    const result = await loadEndorsements(supabase as never, 'owner-1', 'me', new Set(['them']))
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('e2')
    expect(result.viewerHasEndorsed).toBe(true)
  })
})

describe('lib/social/comments.ts loadReleaseComments — read-side block filter', () => {
  it('excludes comments authored by a blocked-relative id', async () => {
    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'release_comments') {
          return tableBuilder([
            { id: 'c1', parent_id: null, body: 'nice', created_at: '2026-01-01T00:00:00Z', author_id: 'them' },
            { id: 'c2', parent_id: null, body: 'thanks', created_at: '2026-01-02T00:00:00Z', author_id: 'friend' },
          ])
        }
        if (table === 'artist_profiles') {
          return tableBuilder([{ id: 'friend', artist_name: 'Friend', avatar_url: null, roles: [] }])
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }
    const result = await loadReleaseComments(supabase as never, 'proj-1', new Set(['them']))
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('c2')
  })
})

// ─── Content pins: which DB policies already enforce no_block() ──────────
// These assertions turn the audit's per-surface findings into a regression
// guard: if a future migration accidentally drops one of these clauses, the
// suite fails instead of the gap going unnoticed again.
describe('migration content pins — already-enforced surfaces (verified, not patched)', () => {
  it('follows_insert_own already gates on no_block() (migration 038)', () => {
    const migration = readMigration('038_block_enforcement_existing_tables.sql')
    expect(migration).toMatch(/CREATE POLICY "follows_insert_own"[\s\S]*?no_block\(auth\.uid\(\), followee_id\)/)
  })

  it('wall_insert_author already gates on no_block() (migration 038)', () => {
    const migration = readMigration('038_block_enforcement_existing_tables.sql')
    expect(migration).toMatch(/CREATE POLICY "wall_insert_author"[\s\S]*?no_block\(auth\.uid\(\), profile_id\)/)
  })

  it('endo_insert_author already gates on no_block() (migration 038)', () => {
    const migration = readMigration('038_block_enforcement_existing_tables.sql')
    expect(migration).toMatch(/CREATE POLICY "endo_insert_author"[\s\S]*?no_block\(auth\.uid\(\), profile_id\)/)
  })

  it('dm_messages insert already gates on no_block() via its parent thread (migration 038)', () => {
    const migration = readMigration('038_block_enforcement_existing_tables.sql')
    expect(migration).toMatch(/CREATE POLICY "dmm_insert_sender"[\s\S]*?no_block\(/)
  })

  it('connections_insert_own already gates on no_block() (migration 044)', () => {
    const migration = readMigration('044_connections_note.sql')
    expect(migration).toMatch(/CREATE POLICY "connections_insert_own"[\s\S]*?no_block\(auth\.uid\(\), addressee_id\)/)
  })

  it('Green Room post/comment/reaction/repost SELECT policies already gate on no_block() (migrations 057/059/060)', () => {
    const m059 = readMigration('059_green_room_feed_author_publicness.sql')
    expect(m059).toMatch(/green_room_can_view_post[\s\S]*?no_block\(p_viewer, p\.author_id\)/)

    const m060 = readMigration('060_green_room_block_visibility_and_audience_roles.sql')
    expect(m060).toMatch(/CREATE POLICY "green_room_comments_select_visible"[\s\S]*?no_block\(auth\.uid\(\), author_id\)/)
    expect(m060).toMatch(/CREATE POLICY "green_room_reactions_select_visible"[\s\S]*?no_block\(auth\.uid\(\), user_id\)/)
    expect(m060).toMatch(/CREATE POLICY "green_room_reposts_select_visible"[\s\S]*?no_block\(auth\.uid\(\), author_id\)/)
  })

  it('Green Room comment/reaction/repost INSERT policies gate on post visibility only — a viewer blocked by a THIRD-PARTY co-commenter is hidden at read time, not rejected at write time (documented design, not a gap)', () => {
    const migration = readMigration('057_green_room_feed.sql')
    // Each INSERT WITH CHECK only re-derives green_room_can_view_post(post_id, ...)
    // for the POST's author — there is no cross-check against every other
    // existing comment/reaction/repost author on that same post.
    expect(migration).toMatch(
      /CREATE POLICY "green_room_comments_insert_visible_post"[\s\S]*?green_room_can_view_post\(post_id, auth\.uid\(\)\)/
    )
    expect(migration).toMatch(
      /CREATE POLICY "green_room_reactions_insert_own_visible_post"[\s\S]*?green_room_can_view_post\(post_id, auth\.uid\(\)\)/
    )
  })

  it('blocks table placement destination checks already gate on no_block() via checkViewerBlock (lib/green-room/placements-admin.ts)', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'lib/green-room/placements-admin.ts'),
      'utf8'
    )
    expect(source).toMatch(/service\.rpc\('no_block', \{ a: viewerId, b: ownerId \}\)/)
  })
})

describe('migration content pin — known gap (documented, not applied this plan)', () => {
  it('rc_insert_author (release_comments) has NO no_block() wiring at the DB layer — enforced app-side only in app/api/release-comments/route.ts', () => {
    const migration = readMigration('012_social_layer.sql')
    const codeOnly = migration
      .split('\n')
      .map(line => line.replace(/--.*$/, ''))
      .join('\n')
    const section = codeOnly.slice(codeOnly.indexOf('CREATE POLICY "rc_insert_author"'))
    expect(section.slice(0, section.indexOf(';'))).not.toMatch(/no_block\(/)
  })
})
