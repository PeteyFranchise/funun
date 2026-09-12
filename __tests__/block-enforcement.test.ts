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

jest.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => false),
}))

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
          if (table === 'user_profiles') return tableBuilder([])
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
        if (table === 'user_profiles') {
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
        if (table === 'user_profiles') return tableBuilder([])
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
        if (table === 'user_profiles') {
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
        if (table === 'user_profiles') {
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
//
// HISTORICAL AS OF PHASE 38.0.3 (migration 210) — READ THIS BEFORE TRUSTING A
// GREEN RUN OF THE BLOCK BELOW.
//
// Every pin in this describe reads migrations 038, 044, 057, 059 and 060.
// Those files are NOT edited by migration 210 and their assertions therefore
// stay literally true — but the policies they describe are NO LONGER THE LIVE
// ONES. Migration 210 dropped and recreated all eleven of them so the helper
// call points at `private.no_block` instead of the dropped `public.no_block`
// (owner decision D4, threat T-08-03). A reader who saw only this block would
// conclude from a green suite that nothing moved.
//
// The pins are kept, not deleted, and not rewritten. They remain a valid guard
// against somebody editing an ALREADY-APPLIED migration file, which is its own
// class of defect: an applied migration is a historical record, and changing
// it makes the repo disagree with the database silently.
//
// THE LIVE PICTURE IS PINNED SEPARATELY, in the
// "live block enforcement after the 38.0.3 relocation" describe further down.
// Add new enforcement pins THERE.
describe('migration content pins — already-enforced surfaces (HISTORICAL: superseded by migration 210)', () => {
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

  // Re-pointed by phase 38.0.3 plan 04, then tightened when review caught a
  // fail-open regression in that plan's first cut. This pin used to assert
  // the literal `service.rpc('no_block', { a: viewerId, b: ownerId })`. That
  // RPC form was removed so `no_block` could leave the PostgREST-exposed
  // schema (owner decision D4; PostgREST routes only to schemas in its
  // `db-schemas` config, so an unexposed function has no RPC route
  // regardless of EXECUTE grants).
  //
  // The pin guards the PROPERTY the 13-03 audit cared about — a
  // bidirectional, fail-closed block check — rather than the mechanism. It
  // now ALSO pins the PRIVILEGE the read runs with, because bidirectionality
  // is meaningless if RLS silently drops one direction: `blocks_select_own`
  // (migration 035) restricts SELECT to `blocker_id = auth.uid()`, and the
  // only caller that reaches this query passes a user-scoped client
  // (app/api/green-room/feed/route.ts -> ... -> filterVisiblePlacementRows).
  // Reading `blocks` off that client returns zero rows for the
  // owner-blocked-viewer direction and shows the placement to the blocked
  // party. The read must therefore use the service role — the privilege
  // equivalent of the SECURITY DEFINER function it replaced.
  it('blocks table placement destination checks gate bidirectionally, fail closed, and read `blocks` with the SERVICE role (lib/green-room/placements-admin.ts)', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'lib/green-room/placements-admin.ts'),
      'utf8'
    )
    // Strip line comments so the pin matches real code, not the explanatory
    // prose above the helper.
    const code = source
      .split('\n')
      .map(line => line.replace(/^\s*\/\/.*$/, ''))
      .join('\n')
    const helper = code.slice(code.indexOf('async function checkViewerBlock'))
    expect(helper).not.toBe('')

    // Reads the table directly — no RPC route dependency.
    expect(helper).toMatch(/\.from\('blocks'\)/)
    expect(code).not.toMatch(/rpc\('no_block'/)

    // BOTH directions of the pair. A block by EITHER party hides the
    // destination, matching no_block()'s symmetric definition (migration 035).
    expect(helper).toMatch(/and\(blocker_id\.eq\.\$\{viewerId\},blocked_id\.eq\.\$\{ownerId\}\)/)
    expect(helper).toMatch(/and\(blocker_id\.eq\.\$\{ownerId\},blocked_id\.eq\.\$\{viewerId\}\)/)

    // Fail closed: a query error hides the destination.
    expect(helper).toMatch(/if \(error\) return false/)

    // SERVICE ROLE, not the caller's client. The module imports
    // createServiceClient, the helper obtains a client from the memoized
    // accessor, fails closed when it cannot be built, and issues the read on
    // THAT client — never on the `client` parameter it was handed.
    expect(code).toMatch(/import \{ createServiceClient \} from '@\/lib\/supabase\/server'/)
    expect(code).toMatch(/function getBlockReadClient\(\)[\s\S]*?createServiceClient\(\)/)
    expect(helper).toMatch(/const service = getBlockReadClient\(\)/)
    expect(helper).toMatch(/if \(!service\) return false/)
    expect(helper).toMatch(/await service\s+\.from\('blocks'\)/)
    // The caller-supplied client is never awaited inside this helper — the
    // exact shape of the regression that was caught in review.
    expect(helper).not.toMatch(/await client\b/)
    expect(helper).not.toMatch(/client\s*\.from\(/)
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

// ─── LIVE block enforcement, after phase 38.0.3 migration 210 ────────────
//
// The pins above describe HISTORY. These describe what production actually
// runs. Owner decision D4 relocated `no_block` out of the PostgREST-exposed
// schema (threat T-08-03: `no_block(a, b)` is symmetric, so any HTTP route to
// it answers "did X block me?" for any X), which forced all eleven
// block-enforcing policies to be dropped and recreated in migration 210 with
// the helper re-qualified.
//
// Scope discipline: this block pins that the ELEVEN SURFACES STILL ENFORCE and
// that the helper is still BIDIRECTIONAL. It does NOT re-prove the relocation
// mechanics — section order, predicate drift, grant posture and the bare drop
// are `__tests__/migration-210-no-block-relocation.test.ts`, and behaviour is
// plan 06's owner-run `38.0.3-VERIFY-B2-NO-BLOCK.sql`. Neither this file nor
// that one proves what a live PostgreSQL does.
describe('live block enforcement after the 38.0.3 relocation (migration 210)', () => {
  const MIG_210 = '210_no_block_relocation.sql'

  // Line comments stripped so a pin matches real SQL, not the migration's
  // (extensive) explanatory prose about the very clauses being pinned.
  function code210(): string {
    return readMigration(MIG_210)
      .split('\n')
      .map(line => line.replace(/^\s*--.*$/, ''))
      .join('\n')
  }

  /** The single CREATE POLICY statement for `name`, up to its semicolon. */
  function policy(name: string): string {
    const sql = code210()
    const start = sql.indexOf(`CREATE POLICY "${name}"`)
    expect(start).toBeGreaterThan(-1)
    const end = sql.indexOf(';', start)
    expect(end).toBeGreaterThan(start)
    return sql.slice(start, end + 1)
  }

  // The eleven, with the exact helper argument pair each one passes. The
  // argument pair is the enforcement: a policy that calls the helper with the
  // wrong second argument is enforcing a block between the wrong two people.
  const LIVE: [string, string, RegExp][] = [
    ['follows_insert_own', 'follows', /private\.no_block\(auth\.uid\(\), followee_id\)/],
    ['wall_insert_author', 'wall_posts', /private\.no_block\(auth\.uid\(\), profile_id\)/],
    ['endo_insert_author', 'endorsements', /private\.no_block\(auth\.uid\(\), profile_id\)/],
    ['dmt_insert_participant', 'dm_threads', /private\.no_block\(auth\.uid\(\), CASE WHEN a_id = auth\.uid\(\) THEN b_id ELSE a_id END\)/],
    ['dmm_insert_sender', 'dm_messages', /private\.no_block\(auth\.uid\(\), CASE WHEN t\.a_id = auth\.uid\(\) THEN t\.b_id ELSE t\.a_id END\)/],
    ['connections_insert_own', 'connections', /private\.no_block\(auth\.uid\(\), addressee_id\)/],
    ['green_room_comments_select_visible', 'green_room_comments', /private\.no_block\(auth\.uid\(\), author_id\)/],
    ['green_room_reactions_select_visible', 'green_room_reactions', /private\.no_block\(auth\.uid\(\), user_id\)/],
    ['green_room_reposts_select_visible', 'green_room_reposts', /private\.no_block\(auth\.uid\(\), author_id\)/],
    ['rc_select_public', 'release_comments', /private\.no_block\(auth\.uid\(\), author_id\)/],
    ['rc_insert_author', 'release_comments', /private\.no_block\(auth\.uid\(\), p\.user_id\)/],
  ]

  it('all eleven block-enforcing surfaces are accounted for', () => {
    expect(LIVE).toHaveLength(11)
  })

  it.each(LIVE)('%s (public.%s) still gates on the relocated helper', (name, table, call) => {
    const stmt = policy(name)
    expect(stmt).toMatch(new RegExp(`ON public\\.${table}\\b`))
    expect(stmt).toMatch(call)
    // Region-scoped negative: no bare or `public.`-qualified call survives.
    // Either would resolve to a function migration 210 drops in its section 5.
    expect(stmt.replace(/private\.no_block/g, '')).not.toMatch(/no_block/)
  })

  it('rc_select_public keeps BOTH of its checks — viewer<->release owner AND viewer<->comment author', () => {
    const stmt = policy('rc_select_public')
    expect(stmt).toMatch(/private\.no_block\(auth\.uid\(\), p\.user_id\)/)
    expect(stmt).toMatch(/private\.no_block\(auth\.uid\(\), author_id\)/)
    expect(stmt.match(/private\.no_block\(/g)).toHaveLength(2)
  })

  it('the relocated helper is still BIDIRECTIONAL — the property this whole suite is about', () => {
    const sql = code210()
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION private.no_block')
    expect(start).toBeGreaterThan(-1)
    const body = sql.slice(start, sql.indexOf('$$;', start))

    // Migration 035's semantics, unchanged: a block placed by EITHER party
    // hides both directions. A relocation that quietly dropped one disjunct
    // would leave `blocks_select_own` (blocker_id = auth.uid()) as the only
    // thing standing, and the blocked party would stop being blocked.
    expect(body).toMatch(/blocker_id = a AND blocked_id = b/)
    expect(body).toMatch(/blocker_id = b AND blocked_id = a/)
    expect(body).toMatch(/SECURITY DEFINER/)
  })

  it('the public copy is dropped, so the "did X block me?" oracle has no HTTP route at all', () => {
    expect(code210()).toMatch(/DROP FUNCTION public\.no_block\(uuid, uuid\);/)
  })
})
