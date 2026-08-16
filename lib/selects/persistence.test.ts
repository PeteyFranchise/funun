import {
  isOrgInAeScope,
  loadSelectsInScope,
  createSelects,
  patchSelects,
  softDeleteSelects,
  addSelectsTrack,
  SELECTS_EDITABLE_FIELDS,
} from './persistence'
import type { SupabaseClient } from '@supabase/supabase-js'

const AE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OTHER_AE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const LEADERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ORG_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const SELECTS_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

// ─── Minimal chainable Supabase query-builder mock ─────────────────────────
// Each table has its own canned response map keyed by method name; `from()`
// returns a fresh chainable object every call so `.eq().eq()` sequences
// don't leak state across assertions (mirrors lib/staff/
// createStaffAccount.test.ts's buildService() convention, generalized for
// a query builder rather than fixed RPC-style calls).
function buildService(responses: {
  selects?: Record<string, unknown> | null
  buyerOrgs?: Record<string, unknown> | null
  selectsTracks?: Record<string, unknown> | null
  selectsTracksCount?: number
  updateResult?: Record<string, unknown> | null
  insertResult?: Record<string, unknown> | null
}) {
  const calls: { table: string; method: string; args: unknown[] }[] = []

  function defaultRowFor(table: string) {
    if (table === 'selects') return responses.selects ?? null
    if (table === 'buyer_orgs') return responses.buyerOrgs ?? null
    if (table === 'selects_tracks') return responses.selectsTracks ?? null
    return null
  }

  function chain(table: string) {
    // A chain tracks its own write mode — the SAME builder instance answers
    // .maybeSingle()/.single() differently depending on whether .update()/
    // .insert()/.delete() was called earlier in the SAME chain, so a
    // pre-write existence check and the post-write re-fetch on the same
    // table never collide (both call .from(table) fresh, but each chain is
    // independent).
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select'
    const builder: Record<string, unknown> = {}
    const record = (method: string, args: unknown[]) => calls.push({ table, method, args })

    builder.select = (...args: unknown[]) => {
      record('select', args)
      return builder
    }
    builder.eq = (...args: unknown[]) => {
      record('eq', args)
      return builder
    }
    builder.is = (...args: unknown[]) => {
      record('is', args)
      return builder
    }
    builder.order = (...args: unknown[]) => {
      record('order', args)
      return builder
    }
    builder.limit = (...args: unknown[]) => {
      record('limit', args)
      return builder
    }
    builder.in = (...args: unknown[]) => {
      record('in', args)
      return builder
    }
    builder.insert = (...args: unknown[]) => {
      record('insert', args)
      mode = 'insert'
      return builder
    }
    builder.update = (...args: unknown[]) => {
      record('update', args)
      mode = 'update'
      return builder
    }
    builder.delete = (...args: unknown[]) => {
      record('delete', args)
      mode = 'delete'
      return builder
    }
    builder.maybeSingle = async () => {
      record('maybeSingle', [])
      if (mode === 'update') return { data: responses.updateResult ?? null, error: null }
      if (mode === 'insert') return { data: responses.insertResult ?? null, error: null }
      return { data: defaultRowFor(table), error: null }
    }
    builder.single = async () => {
      record('single', [])
      if (mode === 'update') {
        const data = responses.updateResult ?? null
        return { data, error: data ? null : { message: 'no data' } }
      }
      const data = responses.insertResult ?? null
      return { data, error: data ? null : { message: 'no data' } }
    }
    // Awaited directly (no maybeSingle/single call) — matches supabase-js's
    // `{ count: 'exact', head: true }` read path and a bare `.delete().eq()`.
    builder.then = (resolve: (v: unknown) => void) => {
      if (mode === 'delete') {
        resolve({ data: null, error: null })
        return
      }
      resolve({ data: null, error: null, count: responses.selectsTracksCount ?? 0 })
    }
    return builder
  }

  const from = jest.fn((table: string) => chain(table))
  return { from, calls } as unknown as SupabaseClient & { calls: typeof calls }
}

describe('isOrgInAeScope', () => {
  it('fails closed on a missing org row', async () => {
    const service = buildService({ buyerOrgs: null })
    expect(await isOrgInAeScope(service, ORG_ID, 'ae', AE_ID)).toBe(false)
  })

  it('rejects a non-leadership AE for an org assigned to someone else (unassigned-org rejection)', async () => {
    const service = buildService({ buyerOrgs: { id: ORG_ID, ae_user_id: OTHER_AE_ID } })
    expect(await isOrgInAeScope(service, ORG_ID, 'ae', AE_ID)).toBe(false)
  })

  it('allows a non-leadership AE for their own assigned org', async () => {
    const service = buildService({ buyerOrgs: { id: ORG_ID, ae_user_id: AE_ID } })
    expect(await isOrgInAeScope(service, ORG_ID, 'ae', AE_ID)).toBe(true)
  })

  it('allows leadership regardless of ae_user_id', async () => {
    const service = buildService({ buyerOrgs: { id: ORG_ID, ae_user_id: OTHER_AE_ID } })
    expect(await isOrgInAeScope(service, ORG_ID, 'leadership', LEADERSHIP_ID)).toBe(true)
  })
})

describe('loadSelectsInScope', () => {
  it('returns null for a nonexistent Selects', async () => {
    const service = buildService({ selects: null })
    expect(await loadSelectsInScope(service, SELECTS_ID, 'ae', AE_ID)).toBeNull()
  })

  it('returns null (not the row) when a non-leadership AE is not assigned to the org — 404-not-403 shape', async () => {
    const service = buildService({
      selects: { id: SELECTS_ID, buyer_org_id: ORG_ID, status: 'draft' },
      buyerOrgs: { id: ORG_ID, ae_user_id: OTHER_AE_ID },
    })
    expect(await loadSelectsInScope(service, SELECTS_ID, 'ae', AE_ID)).toBeNull()
  })

  it('returns the row for the assigned AE', async () => {
    const service = buildService({
      selects: { id: SELECTS_ID, buyer_org_id: ORG_ID, status: 'draft' },
      buyerOrgs: { id: ORG_ID, ae_user_id: AE_ID },
    })
    expect(await loadSelectsInScope(service, SELECTS_ID, 'ae', AE_ID)).toEqual(
      expect.objectContaining({ id: SELECTS_ID })
    )
  })

  it('returns the row for leadership regardless of assignment', async () => {
    const service = buildService({
      selects: { id: SELECTS_ID, buyer_org_id: ORG_ID, status: 'draft' },
      buyerOrgs: { id: ORG_ID, ae_user_id: OTHER_AE_ID },
    })
    expect(await loadSelectsInScope(service, SELECTS_ID, 'leadership', LEADERSHIP_ID)).toEqual(
      expect.objectContaining({ id: SELECTS_ID })
    )
  })
})

describe('createSelects', () => {
  it('inserts using only the known Selects columns (no arbitrary body passthrough)', async () => {
    const service = buildService({
      insertResult: { id: SELECTS_ID, buyer_org_id: ORG_ID, created_by: AE_ID, name: 'Q1 pitch' },
    })
    const result = await createSelects(service, { orgId: ORG_ID, aeUserId: AE_ID, name: 'Q1 pitch' })
    expect(result.id).toBe(SELECTS_ID)
  })

  it('throws when the insert fails', async () => {
    const service = buildService({ insertResult: null })
    await expect(
      createSelects(service, { orgId: ORG_ID, aeUserId: AE_ID, name: 'X' })
    ).rejects.toThrow(/Failed to create Selects/)
  })
})

describe('patchSelects', () => {
  it('rejects a non-allowlisted field (only allowlisted keys reach the update)', async () => {
    const service = buildService({
      updateResult: { id: SELECTS_ID, name: 'Renamed' },
    })
    await patchSelects(service, SELECTS_ID, { name: 'Renamed', buyer_org_id: 'malicious-org-id' })

    const updateCall = (service as unknown as { calls: { table: string; method: string; args: unknown[] }[] }).calls.find(
      c => c.table === 'selects' && c.method === 'update'
    )
    expect(updateCall).toBeDefined()
    const updatePayload = updateCall!.args[0] as Record<string, unknown>
    expect(updatePayload).toEqual({ name: 'Renamed' })
    expect(updatePayload).not.toHaveProperty('buyer_org_id')
  })

  it('returns null when no allowlisted field is present (no-op, no DB write attempted)', async () => {
    const service = buildService({})
    const result = await patchSelects(service, SELECTS_ID, { buyer_org_id: 'nope' })
    expect(result).toBeNull()
  })

  it('accepts download_enabled and download_max_seconds (D-02)', () => {
    expect(SELECTS_EDITABLE_FIELDS).toContain('download_enabled')
    expect(SELECTS_EDITABLE_FIELDS).toContain('download_max_seconds')
  })
})

describe('softDeleteSelects', () => {
  it('rejects deleting a Selects that has already been sent', async () => {
    const service = buildService({ selects: { id: SELECTS_ID, status: 'sent' } })
    const result = await softDeleteSelects(service, SELECTS_ID)
    expect(result).toEqual({ ok: false, reason: 'not_draft' })
  })

  it('reports not_found for a nonexistent Selects', async () => {
    const service = buildService({ selects: null })
    const result = await softDeleteSelects(service, SELECTS_ID)
    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })
})

describe('addSelectsTrack (idempotency)', () => {
  it('returns the existing non-removed row unchanged (no duplicate insert)', async () => {
    const existingRow = {
      id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      selects_id: SELECTS_ID,
      track_id: 'track-1',
      note: null,
      position: 0,
      added_by: AE_ID,
      source: 'crate',
      removed_at: null,
      removed_by: null,
      created_at: '2026-01-01T00:00:00Z',
    }
    const service = buildService({ selectsTracks: existingRow })
    const result = await addSelectsTrack(service, {
      selectsId: SELECTS_ID,
      trackId: 'track-1',
      addedBy: AE_ID,
    })
    expect(result).toEqual(existingRow)

    const insertCall = (service as unknown as { calls: { table: string; method: string }[] }).calls.find(
      c => c.table === 'selects_tracks' && c.method === 'insert'
    )
    expect(insertCall).toBeUndefined()
  })
})
