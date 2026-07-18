import {
  validateReportPatch,
  applyContentAction,
  parseReportFilters,
  loadReportsForAdmin,
} from '@/lib/trust-safety/admin-reports'

const UUID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('validateReportPatch', () => {
  it('rejects an invalid status', () => {
    const result = validateReportPatch({ status: 'submitted' }, 'profile')
    expect(result.ok).toBe(false)
  })

  it('rejects adminNotes over the max length', () => {
    const result = validateReportPatch({ adminNotes: 'x'.repeat(2001) }, 'profile')
    expect(result.ok).toBe(false)
  })

  it('rejects an unsupported contentAction for the target_type', () => {
    const result = validateReportPatch({ contentAction: 'hide' }, 'profile')
    expect(result.ok).toBe(false)
  })

  it('rejects an empty patch (nothing to update)', () => {
    const result = validateReportPatch({}, 'profile')
    expect(result.ok).toBe(false)
  })

  it('accepts status + adminNotes together', () => {
    const result = validateReportPatch({ status: 'dismissed', adminNotes: 'not credible' }, 'message')
    expect(result).toEqual({
      ok: true,
      value: { update: { status: 'dismissed', admin_notes: 'not credible' }, contentAction: null },
    })
  })

  it('accepts a supported contentAction for green_room_post', () => {
    const result = validateReportPatch({ contentAction: 'hide' }, 'green_room_post')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.contentAction).toBe('hide')
  })

  it('accepts remove for green_room_repost but rejects hide/pause', () => {
    expect(validateReportPatch({ contentAction: 'remove' }, 'green_room_repost').ok).toBe(true)
    expect(validateReportPatch({ contentAction: 'hide' }, 'green_room_repost').ok).toBe(false)
    expect(validateReportPatch({ contentAction: 'pause' }, 'green_room_repost').ok).toBe(false)
  })

  it('accepts pause and remove for green_room_placement but rejects hide', () => {
    expect(validateReportPatch({ contentAction: 'pause' }, 'green_room_placement').ok).toBe(true)
    expect(validateReportPatch({ contentAction: 'remove' }, 'green_room_placement').ok).toBe(true)
    expect(validateReportPatch({ contentAction: 'hide' }, 'green_room_placement').ok).toBe(false)
  })

  it('clears adminNotes when given an empty string', () => {
    const result = validateReportPatch({ adminNotes: '' }, 'profile')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.update.admin_notes).toBeNull()
  })
})

function updateEq(error: unknown = null) {
  const eq = jest.fn(async () => ({ error }))
  return { update: jest.fn((_patch: Record<string, unknown>) => ({ eq })), eq }
}

describe('applyContentAction', () => {
  it('sets moderation_status=hidden for a hide action on green_room_post', async () => {
    const chain = updateEq()
    const service = { from: jest.fn(() => chain) } as unknown as import('@supabase/supabase-js').SupabaseClient
    const result = await applyContentAction(service, 'green_room_post', UUID_A, 'hide')
    expect(result).toEqual({ ok: true })
    expect(service.from).toHaveBeenCalledWith('green_room_posts')
    expect(chain.update).toHaveBeenCalledWith({ moderation_status: 'hidden' })
  })

  it('sets moderation_status=removed for a remove action on green_room_comment', async () => {
    const chain = updateEq()
    const service = { from: jest.fn(() => chain) } as unknown as import('@supabase/supabase-js').SupabaseClient
    const result = await applyContentAction(service, 'green_room_comment', UUID_A, 'remove')
    expect(result).toEqual({ ok: true })
    expect(service.from).toHaveBeenCalledWith('green_room_comments')
    expect(chain.update).toHaveBeenCalledWith({ moderation_status: 'removed' })
  })

  it('soft-deletes a repost via deleted_at on remove', async () => {
    const chain = updateEq()
    const service = { from: jest.fn(() => chain) } as unknown as import('@supabase/supabase-js').SupabaseClient
    const result = await applyContentAction(service, 'green_room_repost', UUID_A, 'remove')
    expect(result).toEqual({ ok: true })
    expect(service.from).toHaveBeenCalledWith('green_room_reposts')
    const call = chain.update.mock.calls[0][0] as { deleted_at: string }
    expect(typeof call.deleted_at).toBe('string')
  })

  it('pauses a placement', async () => {
    const chain = updateEq()
    const service = { from: jest.fn(() => chain) } as unknown as import('@supabase/supabase-js').SupabaseClient
    const result = await applyContentAction(service, 'green_room_placement', UUID_A, 'pause')
    expect(result).toEqual({ ok: true })
    expect(chain.update).toHaveBeenCalledWith({ status: 'paused' })
  })

  it('archives a placement on remove', async () => {
    const chain = updateEq()
    const service = { from: jest.fn(() => chain) } as unknown as import('@supabase/supabase-js').SupabaseClient
    const result = await applyContentAction(service, 'green_room_placement', UUID_A, 'remove')
    expect(chain.update).toHaveBeenCalledWith({ status: 'archived' })
  })

  it('surfaces a DB error as { ok: false }', async () => {
    const chain = updateEq({ message: 'db exploded' })
    const service = { from: jest.fn(() => chain) } as unknown as import('@supabase/supabase-js').SupabaseClient
    const result = await applyContentAction(service, 'green_room_post', UUID_A, 'hide')
    expect(result).toEqual({ ok: false, error: 'db exploded' })
  })

  it('rejects a content action for a target_type with no takedown mechanism', async () => {
    const service = { from: jest.fn() } as unknown as import('@supabase/supabase-js').SupabaseClient
    // Cast through unknown: profile/message never reach here in practice
    // because validateReportPatch already rejects them — this exercises the
    // defensive fallback branch directly.
    const result = await applyContentAction(service, 'profile' as never, UUID_A, 'hide' as never)
    expect(result.ok).toBe(false)
  })
})

describe('parseReportFilters', () => {
  it('accepts an empty filter set', () => {
    const result = parseReportFilters(new URLSearchParams())
    expect(result).toEqual({
      ok: true,
      value: { status: null, reason: null, targetType: null, since: null, until: null },
    })
  })

  it('rejects an invalid status', () => {
    const result = parseReportFilters(new URLSearchParams('status=bogus'))
    expect(result.ok).toBe(false)
  })

  it('rejects an invalid reason', () => {
    const result = parseReportFilters(new URLSearchParams('reason=bogus'))
    expect(result.ok).toBe(false)
  })

  it('rejects an invalid targetType', () => {
    const result = parseReportFilters(new URLSearchParams('targetType=bogus'))
    expect(result.ok).toBe(false)
  })

  it('rejects an unparseable since/until date', () => {
    expect(parseReportFilters(new URLSearchParams('since=not-a-date')).ok).toBe(false)
    expect(parseReportFilters(new URLSearchParams('until=not-a-date')).ok).toBe(false)
  })

  it('accepts a full valid filter set', () => {
    const result = parseReportFilters(
      new URLSearchParams('status=submitted&reason=spam&targetType=profile&since=2026-01-01&until=2026-12-31')
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.status).toBe('submitted')
      expect(result.value.reason).toBe('spam')
      expect(result.value.targetType).toBe('profile')
    }
  })
})

describe('loadReportsForAdmin', () => {
  it('applies each provided filter and enriches rows with a reporter projection', async () => {
    const eqCalls: [string, unknown][] = []
    const query: Record<string, unknown> = {}
    query.select = jest.fn(() => query)
    query.order = jest.fn(() => query)
    query.eq = jest.fn((col: string, val: unknown) => {
      eqCalls.push([col, val])
      return query
    })
    query.gte = jest.fn(() => query)
    query.lte = jest.fn(() => query)
    // Awaiting the query object itself resolves the terminal query result.
    ;(query as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) =>
      resolve({ data: [{ id: 'r1', reporter_id: UUID_A }], error: null })

    const reportersQuery: { select: jest.Mock; in: jest.Mock } = {
      select: jest.fn(() => reportersQuery),
      in: jest.fn(async () => ({ data: [{ id: UUID_A, artist_name: 'Rin', handle: 'rin', avatar_url: null }] })),
    }

    const service = {
      from: jest.fn((table: string) => (table === 'reports' ? query : reportersQuery)),
    } as unknown as import('@supabase/supabase-js').SupabaseClient

    const rows = await loadReportsForAdmin(service, {
      status: 'submitted',
      reason: 'spam',
      targetType: 'profile',
      since: '2026-01-01T00:00:00Z',
      until: '2026-12-31T00:00:00Z',
    })

    expect(eqCalls).toEqual([
      ['status', 'submitted'],
      ['reason', 'spam'],
      ['target_type', 'profile'],
    ])
    expect(rows).toEqual([
      { id: 'r1', reporter_id: UUID_A, reporter: { id: UUID_A, artist_name: 'Rin', handle: 'rin', avatar_url: null } },
    ])
  })

  it('throws when the underlying query errors', async () => {
    const query: Record<string, unknown> = {}
    query.select = jest.fn(() => query)
    query.order = jest.fn(() => query)
    ;(query as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) =>
      resolve({ data: null, error: { message: 'db down' } })
    const service = { from: jest.fn(() => query) } as unknown as import('@supabase/supabase-js').SupabaseClient

    await expect(
      loadReportsForAdmin(service, { status: null, reason: null, targetType: null, since: null, until: null })
    ).rejects.toThrow('db down')
  })
})
