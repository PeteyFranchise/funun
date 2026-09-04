import { MEMBER_ACCOUNT_REQUIRED, requireMemberApiAccount } from './member-api-gate'

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function client(profile: { id: string } | null, error: { message: string } | null = null) {
  const maybeSingle = jest.fn(async () => ({ data: profile, error }))
  const eq = jest.fn(() => ({ maybeSingle }))
  const select = jest.fn(() => ({ eq }))
  const from = jest.fn(() => ({ select }))
  return { from, select, eq, maybeSingle }
}

describe('requireMemberApiAccount', () => {
  it('rejects an unauthenticated request', async () => {
    const supabase = client(null)

    await expect(requireMemberApiAccount(supabase as never, null)).resolves.toEqual({
      ok: false,
      status: 401,
      error: 'Unauthorized',
    })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('rejects a Team Member before looking for a Member profile', async () => {
    const supabase = client({ id: USER_ID })

    await expect(
      requireMemberApiAccount(supabase as never, {
        id: USER_ID,
        app_metadata: { staff_role: 'leadership' },
      })
    ).resolves.toEqual({ ok: false, status: 403, error: MEMBER_ACCOUNT_REQUIRED })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('fails closed when a non-staff account has no Member profile', async () => {
    const supabase = client(null)

    await expect(
      requireMemberApiAccount(supabase as never, { id: USER_ID, app_metadata: {} })
    ).resolves.toEqual({ ok: false, status: 403, error: MEMBER_ACCOUNT_REQUIRED })
  })

  it('does not turn a profile lookup failure into permission', async () => {
    const supabase = client(null, { message: 'database unavailable' })

    await expect(
      requireMemberApiAccount(supabase as never, { id: USER_ID, app_metadata: {} })
    ).resolves.toEqual({ ok: false, status: 500, error: 'Could not verify Member account' })
  })

  it('admits a non-staff account with the canonical Member profile row', async () => {
    const supabase = client({ id: USER_ID })
    const user = { id: USER_ID, app_metadata: {} }

    await expect(requireMemberApiAccount(supabase as never, user)).resolves.toEqual({
      ok: true,
      user,
    })
    expect(supabase.from).toHaveBeenCalledWith('user_profiles')
  })
})
