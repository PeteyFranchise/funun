import {
  validateReportCreate,
  isReportTargetVisible,
  findOpenReport,
  toReportStatusView,
  isUuid,
} from '@/lib/trust-safety/reports'

const UUID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const UUID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

describe('isUuid', () => {
  it('accepts a well-formed UUID and rejects everything else', () => {
    expect(isUuid(UUID_A)).toBe(true)
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid(123)).toBe(false)
    expect(isUuid(undefined)).toBe(false)
  })
})

describe('validateReportCreate', () => {
  it('rejects an invalid targetType', () => {
    const result = validateReportCreate({ targetType: 'bogus', targetId: UUID_A, reason: 'spam' })
    expect(result.ok).toBe(false)
  })

  it('rejects a non-UUID targetId', () => {
    const result = validateReportCreate({ targetType: 'profile', targetId: 'nope', reason: 'spam' })
    expect(result.ok).toBe(false)
  })

  it('rejects an invalid reason', () => {
    const result = validateReportCreate({ targetType: 'profile', targetId: UUID_A, reason: 'bogus' })
    expect(result.ok).toBe(false)
  })

  it('rejects details over the max length', () => {
    const result = validateReportCreate({
      targetType: 'profile',
      targetId: UUID_A,
      reason: 'spam',
      details: 'x'.repeat(2001),
    })
    expect(result.ok).toBe(false)
  })

  it('accepts a minimal valid payload with null details', () => {
    const result = validateReportCreate({ targetType: 'profile', targetId: UUID_A, reason: 'spam' })
    expect(result).toEqual({
      ok: true,
      value: { targetType: 'profile', targetId: UUID_A, reason: 'spam', details: null },
    })
  })

  it('trims and accepts optional details', () => {
    const result = validateReportCreate({
      targetType: 'green_room_post',
      targetId: UUID_A,
      reason: 'other',
      details: '  spammy content  ',
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.details).toBe('spammy content')
  })
})

// ─── isReportTargetVisible ────────────────────────────────────────────────
// Builds a minimal fake supabase client per test — only the `.from(table)`
// chains that matter for the target_type under test need to be wired up.
function fakeService(overrides: Record<string, unknown>) {
  return {
    from: jest.fn((table: string) => {
      const impl = overrides[table]
      if (!impl) throw new Error(`unexpected .from('${table}') call in this test`)
      return impl
    }),
    rpc: jest.fn(async () => ({ data: true, error: null })),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

function selectEqMaybeSingle(data: unknown) {
  return { select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data, error: null })) })) })) }
}

describe('isReportTargetVisible — profile', () => {
  it('is false when the profile does not exist', async () => {
    const service = fakeService({ artist_profiles: selectEqMaybeSingle(null) })
    expect(await isReportTargetVisible(service, 'profile', UUID_A, UUID_B)).toBe(false)
  })

  it('is true for the profile owner even if not public', async () => {
    const service = fakeService({ artist_profiles: selectEqMaybeSingle({ id: UUID_A, is_public: false }) })
    expect(await isReportTargetVisible(service, 'profile', UUID_A, UUID_A)).toBe(true)
  })

  it('is false for a private profile viewed by someone else', async () => {
    const service = fakeService({ artist_profiles: selectEqMaybeSingle({ id: UUID_A, is_public: false }) })
    expect(await isReportTargetVisible(service, 'profile', UUID_A, UUID_B)).toBe(false)
  })

  it('is true for a public profile viewed by anyone', async () => {
    const service = fakeService({ artist_profiles: selectEqMaybeSingle({ id: UUID_A, is_public: true }) })
    expect(await isReportTargetVisible(service, 'profile', UUID_A, UUID_B)).toBe(true)
  })
})

describe('isReportTargetVisible — message', () => {
  it('is false when the message does not exist', async () => {
    const service = fakeService({ dm_messages: selectEqMaybeSingle(null) })
    expect(await isReportTargetVisible(service, 'message', UUID_A, UUID_B)).toBe(false)
  })

  it('is true when the reporter is a thread participant', async () => {
    const service = fakeService({
      dm_messages: selectEqMaybeSingle({ id: UUID_A, thread_id: 'thread-1' }),
      dm_threads: selectEqMaybeSingle({ a_id: UUID_B, b_id: 'someone-else' }),
    })
    expect(await isReportTargetVisible(service, 'message', UUID_A, UUID_B)).toBe(true)
  })

  it('is false when the reporter is not a thread participant', async () => {
    const service = fakeService({
      dm_messages: selectEqMaybeSingle({ id: UUID_A, thread_id: 'thread-1' }),
      dm_threads: selectEqMaybeSingle({ a_id: 'someone-else', b_id: 'another-person' }),
    })
    expect(await isReportTargetVisible(service, 'message', UUID_A, UUID_B)).toBe(false)
  })
})

describe('isReportTargetVisible — green_room_post/comment/repost', () => {
  it('is false for a deleted post without calling the visibility RPC', async () => {
    const service = fakeService({
      green_room_posts: selectEqMaybeSingle({ id: UUID_A, deleted_at: '2026-01-01T00:00:00Z', moderation_status: 'visible' }),
    })
    expect(await isReportTargetVisible(service, 'green_room_post', UUID_A, UUID_B)).toBe(false)
    expect((service.rpc as jest.Mock)).not.toHaveBeenCalled()
  })

  it('is false for a hidden/removed post', async () => {
    const service = fakeService({
      green_room_posts: selectEqMaybeSingle({ id: UUID_A, deleted_at: null, moderation_status: 'hidden' }),
    })
    expect(await isReportTargetVisible(service, 'green_room_post', UUID_A, UUID_B)).toBe(false)
  })

  it('defers to the shared green_room_can_view_post RPC for a live post', async () => {
    const service = fakeService({
      green_room_posts: selectEqMaybeSingle({ id: UUID_A, deleted_at: null, moderation_status: 'visible' }),
    })
    expect(await isReportTargetVisible(service, 'green_room_post', UUID_A, UUID_B)).toBe(true)
    expect(service.rpc).toHaveBeenCalledWith('green_room_can_view_post', { p_post_id: UUID_A, p_viewer: UUID_B })
  })

  it('is false when the RPC itself errors', async () => {
    const service = fakeService({
      green_room_posts: selectEqMaybeSingle({ id: UUID_A, deleted_at: null, moderation_status: 'visible' }),
    })
    ;(service.rpc as jest.Mock).mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    expect(await isReportTargetVisible(service, 'green_room_post', UUID_A, UUID_B)).toBe(false)
  })

  it('resolves a comment through its parent post visibility', async () => {
    const service = fakeService({
      green_room_comments: selectEqMaybeSingle({ id: UUID_A, post_id: 'post-1', deleted_at: null, moderation_status: 'visible' }),
    })
    expect(await isReportTargetVisible(service, 'green_room_comment', UUID_A, UUID_B)).toBe(true)
    expect(service.rpc).toHaveBeenCalledWith('green_room_can_view_post', { p_post_id: 'post-1', p_viewer: UUID_B })
  })

  it('resolves a repost through its original post visibility', async () => {
    const service = fakeService({
      green_room_reposts: selectEqMaybeSingle({ id: UUID_A, original_post_id: 'post-1', deleted_at: null }),
    })
    expect(await isReportTargetVisible(service, 'green_room_repost', UUID_A, UUID_B)).toBe(true)
    expect(service.rpc).toHaveBeenCalledWith('green_room_can_view_post', { p_post_id: 'post-1', p_viewer: UUID_B })
  })
})

describe('isReportTargetVisible — green_room_placement', () => {
  it('is false when the placement is not active', async () => {
    const service = fakeService({
      green_room_placements: selectEqMaybeSingle({
        id: UUID_A,
        status: 'draft',
        starts_at: '2020-01-01T00:00:00Z',
        ends_at: null,
      }),
    })
    expect(await isReportTargetVisible(service, 'green_room_placement', UUID_A, UUID_B)).toBe(false)
  })

  it('is false when the placement has not started yet', async () => {
    const service = fakeService({
      green_room_placements: selectEqMaybeSingle({
        id: UUID_A,
        status: 'active',
        starts_at: '2099-01-01T00:00:00Z',
        ends_at: null,
      }),
    })
    expect(await isReportTargetVisible(service, 'green_room_placement', UUID_A, UUID_B)).toBe(false)
  })

  it('is false when the placement has already ended', async () => {
    const service = fakeService({
      green_room_placements: selectEqMaybeSingle({
        id: UUID_A,
        status: 'active',
        starts_at: '2020-01-01T00:00:00Z',
        ends_at: '2020-02-01T00:00:00Z',
      }),
    })
    expect(await isReportTargetVisible(service, 'green_room_placement', UUID_A, UUID_B)).toBe(false)
  })

  it('is true for an active placement within its schedule window', async () => {
    const service = fakeService({
      green_room_placements: selectEqMaybeSingle({
        id: UUID_A,
        status: 'active',
        starts_at: '2020-01-01T00:00:00Z',
        ends_at: null,
      }),
    })
    expect(await isReportTargetVisible(service, 'green_room_placement', UUID_A, UUID_B)).toBe(true)
  })
})

describe('findOpenReport / toReportStatusView', () => {
  it('only queries for the reporter own open reports on this exact target', async () => {
    const eq = jest.fn().mockReturnThis()
    const inFn = jest.fn().mockReturnThis()
    const maybeSingle = jest.fn(async () => ({
      data: { id: 'r1', target_type: 'profile', status: 'submitted', created_at: '2026-01-01T00:00:00Z' },
    }))
    const service = {
      from: jest.fn(() => ({ select: jest.fn(() => ({ eq, in: inFn, maybeSingle })) })),
    } as unknown as import('@supabase/supabase-js').SupabaseClient

    const result = await findOpenReport(service, UUID_B, 'profile', UUID_A)
    expect(inFn).toHaveBeenCalledWith('status', ['submitted', 'under_review'])
    expect(result?.id).toBe('r1')
  })

  it('toReportStatusView narrows a raw row to exactly the four reporter-facing fields', () => {
    const view = toReportStatusView({
      id: 'r1',
      target_type: 'profile',
      status: 'submitted',
      created_at: '2026-01-01T00:00:00Z',
    })
    expect(view).toEqual({ id: 'r1', targetType: 'profile', status: 'submitted', createdAt: '2026-01-01T00:00:00Z' })
  })
})
