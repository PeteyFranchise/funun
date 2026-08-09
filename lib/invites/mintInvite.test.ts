import { mintOrRotateInvite } from './mintInvite'

// ─── mintOrRotateInvite (27-CODEX-REVIEW.md B3/H1/M5 fix; follow-up review
// atomicity hardening) ─────────────────────────────────────────────────────
// Pure-logic test against a mocked SupabaseClient.rpc() — covers the three
// outcomes (created/rotated/reused) the migration 101 RPC can return, error
// propagation, and that the email is passed through to the RPC as a plain
// parameterized value with NO client-side pattern-matching transformation
// (closing the reintroduced ILIKE-wildcard bug — there is no `.ilike()`
// call left in this module at all; a raw '%' or 'a_b@x.com' email is just
// an opaque string handed to the RPC, never interpreted as a wildcard
// pattern). Shared by the admin issue-invite route, the waitlist convert
// route, and the reopen broadcast route (each of those route tests mocks
// this module directly rather than re-testing these branches at the route
// level).

type RpcRow = { out_id: string; out_invite_token: string; out_state: 'created' | 'rotated' | 'reused' }
type RpcResult = { data: RpcRow[] | RpcRow | null; error: { message: string } | null }

function buildService(rpcResult: RpcResult) {
  const rpc = jest.fn(async () => rpcResult)
  return { rpc } as unknown as { rpc: jest.Mock }
}

describe('mintOrRotateInvite', () => {
  it('returns "created" when the RPC inserts a new pending row', async () => {
    const service = buildService({
      data: [{ out_id: 'inv-1', out_invite_token: 'new-token', out_state: 'created' }],
      error: null,
    })

    const result = await mintOrRotateInvite(service as never, {
      email: 'new@example.com',
      source: 'staff',
      invitedByUserId: 'user-1',
    })

    expect(result).toEqual({ ok: true, id: 'inv-1', token: 'new-token', state: 'created' })
    expect(service.rpc).toHaveBeenCalledWith(
      'mint_or_rotate_artist_invite',
      expect.objectContaining({
        p_email: 'new@example.com',
        p_source: 'staff',
        p_invited_by_user_id: 'user-1',
      })
    )
    // Candidate token/expiry are generated locally and passed through.
    const callArgs = service.rpc.mock.calls[0][1]
    expect(typeof callArgs.p_new_token).toBe('string')
    expect(callArgs.p_new_token.length).toBeGreaterThan(0)
    expect(typeof callArgs.p_new_expires_at).toBe('string')
  })

  it('returns "rotated" when the RPC atomically rotates an expired pending row', async () => {
    const service = buildService({
      data: [{ out_id: 'inv-2', out_invite_token: 'rotated-token', out_state: 'rotated' }],
      error: null,
    })

    const result = await mintOrRotateInvite(service as never, {
      email: 'expired@example.com',
      source: 'waitlist_conversion',
      invitedByUserId: 'user-1',
    })

    expect(result).toEqual({ ok: true, id: 'inv-2', token: 'rotated-token', state: 'rotated' })
  })

  it('returns "reused" when the RPC finds a still-active pending row', async () => {
    const service = buildService({
      data: [{ out_id: 'inv-3', out_invite_token: 'existing-token', out_state: 'reused' }],
      error: null,
    })

    const result = await mintOrRotateInvite(service as never, {
      email: 'active@example.com',
      source: 'staff',
      invitedByUserId: 'user-1',
    })

    expect(result).toEqual({ ok: true, id: 'inv-3', token: 'existing-token', state: 'reused' })
  })

  it('handles a single-object RPC response (not wrapped in an array)', async () => {
    const service = buildService({
      data: { out_id: 'inv-4', out_invite_token: 'tok-4', out_state: 'created' } as RpcRow,
      error: null,
    })

    const result = await mintOrRotateInvite(service as never, {
      email: 'single@example.com',
      source: 'staff',
      invitedByUserId: null,
    })

    expect(result).toEqual({ ok: true, id: 'inv-4', token: 'tok-4', state: 'created' })
  })

  it('returns an error when the RPC call fails', async () => {
    const service = buildService({ data: null, error: { message: 'connection failed' } })

    const result = await mintOrRotateInvite(service as never, {
      email: 'f@example.com',
      source: 'staff',
      invitedByUserId: 'user-1',
    })

    expect(result).toEqual({ ok: false, error: 'connection failed' })
  })

  it('returns an error when the RPC returns no row and no error', async () => {
    const service = buildService({ data: [], error: null })

    const result = await mintOrRotateInvite(service as never, {
      email: 'empty@example.com',
      source: 'staff',
      invitedByUserId: 'user-1',
    })

    expect(result).toEqual({ ok: false, error: 'Failed to create invite.' })
  })

  it('passes an email containing ILIKE wildcard characters through unchanged (no client-side pattern building)', async () => {
    const service = buildService({
      data: [{ out_id: 'inv-5', out_invite_token: 'tok-5', out_state: 'created' }],
      error: null,
    })

    // '%' would match every row and 'a_b@x.com' would match 'aXb@x.com' if
    // this were ever expressed as an .ilike() pattern instead of an exact,
    // parameterized RPC argument. There is no escaping helper in this file
    // to test because there is no pattern-matching call left at all — the
    // assertion is simply that the raw string reaches the RPC untouched.
    await mintOrRotateInvite(service as never, {
      email: 'a_b%@example.com',
      source: 'staff',
      invitedByUserId: 'user-1',
    })

    expect(service.rpc).toHaveBeenCalledWith(
      'mint_or_rotate_artist_invite',
      expect.objectContaining({ p_email: 'a_b%@example.com' })
    )
  })
})
