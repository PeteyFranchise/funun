// F7 hotfix (2026-09-06): requireWorkspaceAccess now consults the D-56/WS-31
// kill switch via its own createServiceClient() call, before anything else.
// Mock the module so every pre-existing test in this file (which predates
// the kill-switch check and asserts nothing about it) keeps exercising the
// membership-gate logic against an ENABLED switch by default.
type ConfigRow = { enabled: boolean } | null
type ConfigError = { message: string } | null
const mockServiceMaybeSingle = jest.fn<Promise<{ data: ConfigRow; error: ConfigError }>, []>(async () => ({
  data: { enabled: true },
  error: null,
}))
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table !== 'workspace_access_config') {
        throw new Error(`Unexpected table on the service client: ${table}`)
      }
      return { select: () => ({ eq: () => ({ maybeSingle: mockServiceMaybeSingle }) }) }
    },
  }),
}))

import {
  WORKSPACE_ACCESS_DISABLED,
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

beforeEach(() => {
  mockServiceMaybeSingle.mockReset()
  mockServiceMaybeSingle.mockResolvedValue({ data: { enabled: true }, error: null })
})

describe('requireWorkspaceAccess — the D-56/WS-31 kill switch (F7 hotfix)', () => {
  it('returns 503 and never touches the membership table when the config row reads enabled: false', async () => {
    mockServiceMaybeSingle.mockResolvedValue({ data: { enabled: false }, error: null })
    const supabase = client({ role: 'owner', status: 'active', expires_at: null })

    const result = await requireWorkspaceAccess(
      supabase as never,
      { id: USER_ID, app_metadata: {} },
      WORKSPACE_ID
    )

    expect(result).toEqual({ ok: false, status: 503, error: WORKSPACE_ACCESS_DISABLED })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('fails closed (503) when the config row is missing', async () => {
    mockServiceMaybeSingle.mockResolvedValue({ data: null, error: null })
    const supabase = client({ role: 'owner', status: 'active', expires_at: null })

    const result = await requireWorkspaceAccess(
      supabase as never,
      { id: USER_ID, app_metadata: {} },
      WORKSPACE_ID
    )

    expect(result).toEqual({ ok: false, status: 503, error: WORKSPACE_ACCESS_DISABLED })
  })

  it('fails closed (503) when the config read errors', async () => {
    mockServiceMaybeSingle.mockResolvedValue({ data: null, error: { message: 'connection reset' } })
    const supabase = client({ role: 'owner', status: 'active', expires_at: null })

    const result = await requireWorkspaceAccess(
      supabase as never,
      { id: USER_ID, app_metadata: {} },
      WORKSPACE_ID
    )

    expect(result).toEqual({ ok: false, status: 503, error: WORKSPACE_ACCESS_DISABLED })
  })

  it('is consulted even for an unauthenticated caller — the kill switch check precedes the null-user check', async () => {
    mockServiceMaybeSingle.mockResolvedValue({ data: { enabled: false }, error: null })

    const result = await requireWorkspaceAccess({ from: jest.fn() } as never, null, WORKSPACE_ID)

    expect(result).toEqual({ ok: false, status: 503, error: WORKSPACE_ACCESS_DISABLED })
  })

  it('proceeds to the ordinary membership gate when the config row reads enabled: true', async () => {
    const supabase = client({ role: 'owner', status: 'active', expires_at: null })

    const result = await requireWorkspaceAccess(
      supabase as never,
      { id: USER_ID, app_metadata: {} },
      WORKSPACE_ID
    )

    expect(result).toEqual({ ok: true, workspaceId: WORKSPACE_ID, userId: USER_ID, role: 'owner' })
  })
})

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
