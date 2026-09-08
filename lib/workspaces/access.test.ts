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

// ─── D-55 / WSR-16 (plan 13) — the switch is now read through an RPC ───────
// `requireWorkspaceAccess` no longer reads `workspace_access_config` through
// `.from()`. It resolves the D-56 kill switch AND the D-55 cohort window in
// ONE service-role round trip, through
// `public.workspace_access_permitted(p_uid, p_require_cohort)`.
//
// Every pre-existing case in this file drives the switch through
// `mockServiceMaybeSingle`, so rather than rewrite them, the rpc stub
// DERIVES `access_enabled` from that same fixture — a case written against
// the old table read still drives exactly the same decision, and its
// recorded expectation is unchanged. `cohort_ok` has its own fixture and
// defaults to TRUE so the pre-existing cases keep exercising the membership
// gate rather than tripping the new 404 arm.
const mockCohortOk = jest.fn<Promise<boolean>, []>(async () => true)
type RpcCall = { fn: string; args: { p_uid: string; p_require_cohort: boolean } }
const rpcCalls: RpcCall[] = []
const mockRpcThrows = jest.fn<boolean, []>(() => false)

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    rpc: async (fn: string, args: { p_uid: string; p_require_cohort: boolean }) => {
      rpcCalls.push({ fn, args })
      if (mockRpcThrows()) throw new Error('transport failure')
      const { data, error } = await mockServiceMaybeSingle()
      if (error) return { data: null, error }
      if (!data) return { data: null, error: null }
      return {
        data: [{ access_enabled: data.enabled === true, cohort_ok: await mockCohortOk() }],
        error: null,
      }
    },
    // Kept as a tripwire, not as an affordance: the gate must reach the
    // switch through the RPC, so any direct table read is a regression.
    from: (table: string) => {
      throw new Error(
        `The gate must not read ${table} directly — it resolves the switch and the cohort through workspace_access_permitted.`
      )
    },
  }),
}))

import {
  WORKSPACE_ACCESS_DISABLED,
  WORKSPACE_ACCESS_REQUIRED,
  WORKSPACE_NOT_FOUND,
  requireWorkspaceAccess,
  requireWorkspaceProjectAccess,
  requireWorkspaceRole,
} from '@/lib/workspaces/access'
import {
  WORKSPACE_ACCESS_GENERAL_ENABLED_VAR,
  WORKSPACE_COHORT_PILOT_ENABLED_VAR,
} from '@/lib/workspaces/cohort'
import { WORKSPACE_PROJECT_ROLE_FLOOR_MESSAGE } from '@/lib/workspaces/membership'
import type { WorkspaceRole } from '@/lib/workspaces/types'

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

const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  mockServiceMaybeSingle.mockReset()
  mockServiceMaybeSingle.mockResolvedValue({ data: { enabled: true }, error: null })
  mockCohortOk.mockReset()
  mockCohortOk.mockResolvedValue(true)
  mockRpcThrows.mockReset()
  mockRpcThrows.mockReturnValue(false)
  rpcCalls.length = 0
  for (const key of [WORKSPACE_ACCESS_GENERAL_ENABLED_VAR, WORKSPACE_COHORT_PILOT_ENABLED_VAR]) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
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

// ─── D-55 / WSR-16 / R-07 / R-25 — the pilot cohort gate ──────────────────
// Added by plan 13. These cases sit BESIDE the F7 kill-switch block above
// rather than replacing it: 503 and 404 are two outcomes with two causes and
// the whole point of the pair is that they are never conflated.
describe('requireWorkspaceAccess — the D-55 cohort gate (WSR-16 / R-07)', () => {
  it('returns 404, not 403, for a Member outside the pilot cohort (R-25)', async () => {
    mockCohortOk.mockResolvedValue(false)
    const supabase = client({ role: 'owner', status: 'active', expires_at: null })

    const result = await requireWorkspaceAccess(
      supabase as never,
      { id: USER_ID, app_metadata: {} },
      WORKSPACE_ID
    )

    expect(result).toEqual({ ok: false, status: 404, error: WORKSPACE_NOT_FOUND })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns 503, not 404, when the platform control is off — the two are never conflated', async () => {
    mockServiceMaybeSingle.mockResolvedValue({ data: { enabled: false }, error: null })
    mockCohortOk.mockResolvedValue(false)
    const supabase = client({ role: 'owner', status: 'active', expires_at: null })

    const result = await requireWorkspaceAccess(
      supabase as never,
      { id: USER_ID, app_metadata: {} },
      WORKSPACE_ID
    )

    expect(result).toEqual({ ok: false, status: 503, error: WORKSPACE_ACCESS_DISABLED })
  })

  it('admits a caller inside the cohort and returns the DB-derived role unchanged', async () => {
    mockCohortOk.mockResolvedValue(true)
    const supabase = client({ role: 'member', status: 'active', expires_at: null })

    const result = await requireWorkspaceAccess(
      supabase as never,
      { id: USER_ID, app_metadata: {} },
      WORKSPACE_ID
    )

    expect(result).toEqual({ ok: true, workspaceId: WORKSPACE_ID, userId: USER_ID, role: 'member' })
  })

  it('needs no cohort row once general availability is on, and says so in p_require_cohort', async () => {
    process.env[WORKSPACE_ACCESS_GENERAL_ENABLED_VAR] = 'true'
    mockCohortOk.mockResolvedValue(false)
    const supabase = client({ role: 'member', status: 'active', expires_at: null })

    const result = await requireWorkspaceAccess(
      supabase as never,
      { id: USER_ID, app_metadata: {} },
      WORKSPACE_ID
    )

    expect(result).toEqual({ ok: true, workspaceId: WORKSPACE_ID, userId: USER_ID, role: 'member' })
    expect(rpcCalls[0]?.args.p_require_cohort).toBe(false)
  })

  it('requires the cohort when neither variable is set — the default is CLOSED (R-07)', async () => {
    mockCohortOk.mockResolvedValue(false)
    const supabase = client({ role: 'owner', status: 'active', expires_at: null })

    const result = await requireWorkspaceAccess(
      supabase as never,
      { id: USER_ID, app_metadata: {} },
      WORKSPACE_ID
    )

    expect(result).toEqual({ ok: false, status: 404, error: WORKSPACE_NOT_FOUND })
    expect(rpcCalls[0]?.args.p_require_cohort).toBe(true)
  })

  it('resolves the switch and the cohort in EXACTLY ONE service-role round trip', async () => {
    const supabase = client({ role: 'owner', status: 'active', expires_at: null })

    await requireWorkspaceAccess(supabase as never, { id: USER_ID, app_metadata: {} }, WORKSPACE_ID)

    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0]?.fn).toBe('workspace_access_permitted')
    expect(rpcCalls[0]?.args.p_uid).toBe(USER_ID)
  })

  it('returns 503, never a permissive fallthrough, when the decision resolver fails', async () => {
    mockRpcThrows.mockReturnValue(true)
    const supabase = client({ role: 'owner', status: 'active', expires_at: null })

    const result = await requireWorkspaceAccess(
      supabase as never,
      { id: USER_ID, app_metadata: {} },
      WORKSPACE_ID
    )

    expect(result).toEqual({ ok: false, status: 503, error: WORKSPACE_ACCESS_DISABLED })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('still returns 401 — not 404 — for a null user while the platform half is consulted (F7 ordering)', async () => {
    mockCohortOk.mockResolvedValue(false)

    const result = await requireWorkspaceAccess({ from: jest.fn() } as never, null, WORKSPACE_ID)

    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' })
    expect(rpcCalls).toHaveLength(1)
  })

  it('still returns 403 for a staff identity that clears the cohort', async () => {
    const supabase = client({ role: 'owner', status: 'active', expires_at: null })

    const result = await requireWorkspaceAccess(
      supabase as never,
      { id: USER_ID, app_metadata: { staff_role: 'leadership' } },
      WORKSPACE_ID
    )

    expect(result).toEqual({ ok: false, status: 403, error: WORKSPACE_ACCESS_REQUIRED })
  })

  it('still returns 500, not 404, on a membership lookup error', async () => {
    const supabase = client(null, { message: 'database unavailable' })

    const result = await requireWorkspaceAccess(
      supabase as never,
      { id: USER_ID, app_metadata: {} },
      WORKSPACE_ID
    )

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: 'Could not verify workspace membership',
    })
  })
})

// ─── R-20 / WSR-29 — the project-data role floor is NOT in the gate ────────
describe('requireWorkspaceAccess — the R-20 role floor is deliberately NOT applied here', () => {
  it('admits a guest through the plain gate, so guests keep workspace chrome (R-20)', async () => {
    const supabase = client({ role: 'guest', status: 'active', expires_at: null })

    const result = await requireWorkspaceAccess(
      supabase as never,
      { id: USER_ID, app_metadata: {} },
      WORKSPACE_ID
    )

    expect(result).toEqual({ ok: true, workspaceId: WORKSPACE_ID, userId: USER_ID, role: 'guest' })
  })
})

describe('requireWorkspaceProjectAccess — the R-20 / WSR-29 role floor', () => {
  function admitted(role: string) {
    return {
      ok: true as const,
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      role: role as WorkspaceRole,
    }
  }

  it('refuses a guest with WORKSPACE_PROJECT_ROLE_FLOOR_MESSAGE', () => {
    expect(requireWorkspaceProjectAccess(admitted('guest'))).toEqual({
      ok: false,
      status: 403,
      error: WORKSPACE_PROJECT_ROLE_FLOOR_MESSAGE,
    })
  })

  it.each(['owner', 'admin', 'member', 'contractor'])('passes %s through unchanged', role => {
    const access = admitted(role)
    expect(requireWorkspaceProjectAccess(access)).toEqual(access)
  })

  it('passes a failed access result straight through without changing its status', () => {
    const failed = { ok: false as const, status: 404 as const, error: WORKSPACE_NOT_FOUND }
    expect(requireWorkspaceProjectAccess(failed)).toEqual(failed)
  })
})
