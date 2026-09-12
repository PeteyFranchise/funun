import { completeSignupClaim } from './completeSignupClaim'

describe('completeSignupClaim', () => {
  it('calls only the verified redemption RPC with the server-derived user id', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null })
    const result = await completeSignupClaim({ rpc } as never, 'user-1')

    expect(rpc).toHaveBeenCalledWith('complete_verified_signup_claim', {
      p_user_id: 'user-1',
      p_invite_token: null,
    })
    expect(result).toEqual({ ok: true, completed: true })
  })

  it('passes an explicit invite capability for an already-existing member', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null })
    await completeSignupClaim({ rpc } as never, 'user-1', 'a'.repeat(64))

    expect(rpc).toHaveBeenCalledWith('complete_verified_signup_claim', {
      p_user_id: 'user-1',
      p_invite_token: 'a'.repeat(64),
    })
  })

  it('does not expose database errors', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'relation auth.users leaked detail' },
    })

    await expect(completeSignupClaim({ rpc } as never, 'user-1')).resolves.toEqual({
      ok: false,
      error: 'claim_failed',
    })
  })
})
