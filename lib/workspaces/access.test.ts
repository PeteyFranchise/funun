import {
  WORKSPACE_ACCESS_REQUIRED,
  requireWorkspaceAccess,
  requireWorkspaceRole,
} from '@/lib/workspaces/access'

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

function client(
  membership: { role: string; status: string; expires_at: string | null } | null,
  error: { message: string } | null = null
) {
  const maybeSingle = jest.fn(async () => ({ data: membership, error }))
  const eq2 = jest.fn(() => ({ maybeSingle }))
  const eq1 = jest.fn(() => ({ eq: eq2 }))
  const select = jest.fn(() => ({ eq: eq1 }))
  const from = jest.fn(() => ({ select }))
  return { from, select, eq1, eq2, maybeSingle }
}

describe('requireWorkspaceAccess', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const supabase = client(null)

    await expect(
      requireWorkspaceAccess(supabase as never, null, WORKSPACE_ID)
    ).resolves.toEqual({ ok: false, status: 401, error: 'Unauthorized' })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('rejects a caller with any staff role before the membership lookup', async () => {
    const supabase = client({ role: 'owner', status: 'active', expires_at: null })

    await expect(
      requireWorkspaceAccess(
        supabase as never,
        { id: USER_ID, app_metadata: { staff_role: 'leadership' } },
        WORKSPACE_ID
      )
    ).resolves.toEqual({ ok: false, status: 403, error: WORKSPACE_ACCESS_REQUIRED })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('rejects when there is no workspace_members row for this workspace', async () => {
    const supabase = client(null)

    await expect(
      requireWorkspaceAccess(supabase as never, { id: USER_ID, app_metadata: {} }, WORKSPACE_ID)
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'You are not an active member of this workspace',
    })
  })

  it('rejects a membership row whose status is not active', async () => {
    const supabase = client({ role: 'member', status: 'suspended', expires_at: null })

    await expect(
      requireWorkspaceAccess(supabase as never, { id: USER_ID, app_metadata: {} }, WORKSPACE_ID)
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'You are not an active member of this workspace',
    })
  })

  it('rejects an active membership whose expires_at is in the past (D-11)', async () => {
    const supabase = client({
      role: 'contractor',
      status: 'active',
      expires_at: '2020-01-01T00:00:00.000Z',
    })

    await expect(
      requireWorkspaceAccess(supabase as never, { id: USER_ID, app_metadata: {} }, WORKSPACE_ID, {
        now: new Date('2026-01-01T00:00:00.000Z').getTime(),
      })
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'Your seat on this workspace has expired',
    })
  })

  it('rejects an active membership whose expires_at is exactly at the clock (boundary: at or before)', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z').getTime()
    const supabase = client({
      role: 'contractor',
      status: 'active',
      expires_at: '2026-01-01T00:00:00.000Z',
    })

    await expect(
      requireWorkspaceAccess(supabase as never, { id: USER_ID, app_metadata: {} }, WORKSPACE_ID, {
        now,
      })
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'Your seat on this workspace has expired',
    })
  })

  it('returns 500, not 403 and not success, on a membership lookup error', async () => {
    const supabase = client(null, { message: 'database unavailable' })

    await expect(
      requireWorkspaceAccess(supabase as never, { id: USER_ID, app_metadata: {} }, WORKSPACE_ID)
    ).resolves.toEqual({
      ok: false,
      status: 500,
      error: 'Could not verify workspace membership',
    })
  })

  it('admits an active, non-expired member and returns the DB-derived role', async () => {
    const supabase = client({ role: 'admin', status: 'active', expires_at: null })

    await expect(
      requireWorkspaceAccess(supabase as never, { id: USER_ID, app_metadata: {} }, WORKSPACE_ID)
    ).resolves.toEqual({ ok: true, workspaceId: WORKSPACE_ID, userId: USER_ID, role: 'admin' })
    expect(supabase.from).toHaveBeenCalledWith('workspace_members')
  })

  it('performs its own DB lookup keyed on the explicit workspaceId argument — no caller-supplied role or membership object is accepted', async () => {
    const supabase = client({ role: 'owner', status: 'active', expires_at: null })

    const result = await requireWorkspaceAccess(
      supabase as never,
      { id: USER_ID, app_metadata: {} },
      WORKSPACE_ID
    )

    expect(supabase.eq1).toHaveBeenCalledWith('workspace_id', WORKSPACE_ID)
    expect(supabase.eq2).toHaveBeenCalledWith('user_id', USER_ID)
    expect(result).toEqual({ ok: true, workspaceId: WORKSPACE_ID, userId: USER_ID, role: 'owner' })
  })
})

describe('requireWorkspaceRole', () => {
  it('passes through a failed access result unchanged', () => {
    const failed: Awaited<ReturnType<typeof requireWorkspaceAccess>> = {
      ok: false,
      status: 401,
      error: 'Unauthorized',
    }
    expect(requireWorkspaceRole(failed, () => true, 'unused')).toEqual(failed)
  })

  it('refuses with the supplied error message when the predicate fails', () => {
    const access: Awaited<ReturnType<typeof requireWorkspaceAccess>> = {
      ok: true,
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      role: 'member',
    }
    expect(requireWorkspaceRole(access, role => role === 'owner', 'Owners only')).toEqual({
      ok: false,
      status: 403,
      error: 'Owners only',
    })
  })

  it('passes through the successful access result when the predicate holds', () => {
    const access: Awaited<ReturnType<typeof requireWorkspaceAccess>> = {
      ok: true,
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      role: 'owner',
    }
    expect(requireWorkspaceRole(access, role => role === 'owner', 'Owners only')).toEqual(access)
  })
})
