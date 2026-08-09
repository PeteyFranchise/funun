import { mintOrRotateInvite } from './mintInvite'

// ─── mintOrRotateInvite (27-CODEX-REVIEW.md B3/H1/M5 fix) ─────────────────
// Pure-logic test against a mocked SupabaseClient — covers the three
// outcomes (reused/rotated/created) plus the 23505 concurrent-insert race
// fallback and error propagation. Shared by the admin issue-invite route,
// the waitlist convert route, and the reopen broadcast route (each of
// those route tests mocks this module directly rather than re-testing
// these branches at the route level).

type QueryResult<T> = { data: T | null; error: { message: string; code?: string } | null }

function buildService(options: {
  selectResult: QueryResult<{ id: string; invite_token: string | null; token_expires_at: string | null }>
  insertResult?: QueryResult<{ id: string }>
  updateResult?: { error: { message: string } | null }
  secondSelectResult?: QueryResult<{ id: string; invite_token: string | null; token_expires_at: string | null }>
}) {
  const {
    selectResult,
    insertResult = { data: null, error: null },
    updateResult = { error: null },
    secondSelectResult,
  } = options

  let selectCallCount = 0
  const selectSpy = jest.fn(() => ({
    ilike: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(async () => {
          selectCallCount += 1
          if (selectCallCount === 1) return selectResult
          return secondSelectResult ?? selectResult
        }),
      })),
    })),
  }))

  const insertSpy = jest.fn(() => ({
    select: jest.fn(() => ({
      maybeSingle: jest.fn(async () => insertResult),
    })),
  }))

  const updateEq2 = jest.fn(async () => updateResult)
  const updateEq1 = jest.fn(() => ({ eq: updateEq2 }))
  const updateSpy = jest.fn(() => ({ eq: updateEq1 }))

  const from = jest.fn((table: string) => {
    if (table === 'artist_invites') return { select: selectSpy, insert: insertSpy, update: updateSpy }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from, selectSpy, insertSpy, updateSpy, updateEq1, updateEq2 } as unknown as {
    from: jest.Mock
  } & Record<string, jest.Mock>
}

describe('mintOrRotateInvite', () => {
  it('reuses an active (non-expired) pending invite without writing', async () => {
    const futureExpiry = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
    const service = buildService({
      selectResult: { data: { id: 'inv-1', invite_token: 'existing-token', token_expires_at: futureExpiry }, error: null },
    })

    const result = await mintOrRotateInvite(service as never, {
      email: 'a@example.com',
      source: 'staff',
      invitedByUserId: 'user-1',
    })

    expect(result).toEqual({ ok: true, id: 'inv-1', token: 'existing-token', state: 'reused' })
    expect(service.insertSpy).not.toHaveBeenCalled()
    expect(service.updateSpy).not.toHaveBeenCalled()
  })

  it('rotates an expired pending invite in place (H1)', async () => {
    const pastExpiry = new Date(Date.now() - 1000).toISOString()
    const service = buildService({
      selectResult: { data: { id: 'inv-2', invite_token: 'stale-token', token_expires_at: pastExpiry }, error: null },
    })

    const result = await mintOrRotateInvite(service as never, {
      email: 'b@example.com',
      source: 'waitlist_conversion',
      invitedByUserId: 'user-1',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state).toBe('rotated')
    expect(result.id).toBe('inv-2')
    expect(result.token).not.toBe('stale-token')
    expect(service.updateSpy).toHaveBeenCalledTimes(1)
    expect(service.updateEq1).toHaveBeenCalledWith('id', 'inv-2')
    expect(service.updateEq2).toHaveBeenCalledWith('status', 'pending')
    expect(service.insertSpy).not.toHaveBeenCalled()
  })

  it('creates a new invite when no pending row exists', async () => {
    const service = buildService({
      selectResult: { data: null, error: null },
      insertResult: { data: { id: 'inv-3' }, error: null },
    })

    const result = await mintOrRotateInvite(service as never, {
      email: 'c@example.com',
      source: 'staff',
      invitedByUserId: 'user-1',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state).toBe('created')
    expect(result.id).toBe('inv-3')
    expect(service.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'c@example.com', status: 'pending', source: 'staff', invited_by_user_id: 'user-1' })
    )
  })

  it('falls back to reusing the winner row on a concurrent-insert race (23505)', async () => {
    const futureExpiry = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
    const service = buildService({
      selectResult: { data: null, error: null },
      insertResult: { data: null, error: { message: 'duplicate key value', code: '23505' } },
      secondSelectResult: { data: { id: 'inv-4', invite_token: 'winner-token', token_expires_at: futureExpiry }, error: null },
    })

    const result = await mintOrRotateInvite(service as never, {
      email: 'd@example.com',
      source: 'staff',
      invitedByUserId: 'user-1',
    })

    expect(result).toEqual({ ok: true, id: 'inv-4', token: 'winner-token', state: 'reused' })
  })

  it('rotates the winner row when the concurrent race winner is itself expired', async () => {
    const pastExpiry = new Date(Date.now() - 1000).toISOString()
    const service = buildService({
      selectResult: { data: null, error: null },
      insertResult: { data: null, error: { message: 'duplicate key value', code: '23505' } },
      secondSelectResult: { data: { id: 'inv-5', invite_token: 'expired-winner', token_expires_at: pastExpiry }, error: null },
    })

    const result = await mintOrRotateInvite(service as never, {
      email: 'e@example.com',
      source: 'staff',
      invitedByUserId: 'user-1',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state).toBe('rotated')
    expect(result.id).toBe('inv-5')
  })

  it('returns an error when the initial select fails', async () => {
    const service = buildService({
      selectResult: { data: null, error: { message: 'connection failed' } },
    })

    const result = await mintOrRotateInvite(service as never, {
      email: 'f@example.com',
      source: 'staff',
      invitedByUserId: 'user-1',
    })

    expect(result).toEqual({ ok: false, error: 'connection failed' })
    expect(service.insertSpy).not.toHaveBeenCalled()
  })

  it('returns an error when the insert fails with a non-23505 error', async () => {
    const service = buildService({
      selectResult: { data: null, error: null },
      insertResult: { data: null, error: { message: 'insert boom' } },
    })

    const result = await mintOrRotateInvite(service as never, {
      email: 'g@example.com',
      source: 'staff',
      invitedByUserId: 'user-1',
    })

    expect(result).toEqual({ ok: false, error: 'insert boom' })
  })

  it('returns an error when rotating fails', async () => {
    const pastExpiry = new Date(Date.now() - 1000).toISOString()
    const service = buildService({
      selectResult: { data: { id: 'inv-6', invite_token: 'stale', token_expires_at: pastExpiry }, error: null },
      updateResult: { error: { message: 'update boom' } },
    })

    const result = await mintOrRotateInvite(service as never, {
      email: 'h@example.com',
      source: 'staff',
      invitedByUserId: 'user-1',
    })

    expect(result).toEqual({ ok: false, error: 'update boom' })
  })
})
