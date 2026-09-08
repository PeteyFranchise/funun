import {
  WORKSPACE_ACCESS_GENERAL_ENABLED_VAR,
  WORKSPACE_COHORT_PILOT_ENABLED_VAR,
  canAcceptWorkspaceInvitation,
  isWorkspaceAccessPermitted,
  isWorkspaceCohortRequired,
  resolveWorkspaceAccessDecision,
  type WorkspaceCohortClient,
  type WorkspaceCohortEnvironment,
} from '@/lib/workspaces/cohort'

// ─── What this suite is and is not evidence for ───────────────────────────
// This suite proves the DECISION, not the SQL. `public.workspace_access_permitted`
// is text-locked by `__tests__/migration-197.test.ts` (plan 09) and proved
// behaviourally by plan 17's owner-run production harness. This repo has no
// live-Postgres test harness, so those are THREE different kinds of evidence
// and none substitutes for another: a green run here says the TypeScript gate
// asks the right question and fails closed on every answer — it says nothing
// about whether the function on the other side of the wire returns the truth.
//
// Every case passes its environment explicitly. Nothing in this file assigns
// to `process.env`; the module takes the environment as a default parameter
// precisely so the decision is testable without mutating global state.

const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

type PermittedRow = { access_enabled: boolean; cohort_ok: boolean }
type RpcArgs = { p_uid: string; p_require_cohort: boolean }
type RpcResult = { data: PermittedRow[] | PermittedRow | null; error: unknown }

/**
 * Records every invocation and the exact args it received, so a test can
 * assert both the round-trip count and the `p_require_cohort` value the
 * module derived from the environment.
 */
function stubClient(respond: (args: RpcArgs) => RpcResult) {
  const calls: RpcArgs[] = []
  const client: WorkspaceCohortClient = {
    rpc(_fn: 'workspace_access_permitted', args: RpcArgs) {
      calls.push(args)
      return Promise.resolve(respond(args))
    },
  }
  return { client, calls }
}

function openClient(row: PermittedRow) {
  return stubClient(() => ({ data: [row], error: null }))
}

describe('isWorkspaceCohortRequired', () => {
  it('R-07: an empty environment REQUIRES cohort membership — the default is closed', () => {
    // This is the assertion that must fail loudly if someone later "fixes"
    // the default to open. R-07's whole point is that flipping the D-56 kill
    // switch back on must not admit every Member; an absent variable is never
    // readable as permission.
    expect(isWorkspaceCohortRequired({})).toBe(true)
  })

  it('drops the cohort requirement only when general availability is explicitly enabled', () => {
    const environment: WorkspaceCohortEnvironment = {
      [WORKSPACE_ACCESS_GENERAL_ENABLED_VAR]: 'true',
    }
    expect(isWorkspaceCohortRequired(environment)).toBe(false)
  })

  it('keeps the cohort requirement while the pilot flag is set', () => {
    const environment: WorkspaceCohortEnvironment = {
      [WORKSPACE_COHORT_PILOT_ENABLED_VAR]: 'true',
    }
    expect(isWorkspaceCohortRequired(environment)).toBe(true)
  })

  it('lets general availability win when both variables are set', () => {
    const environment: WorkspaceCohortEnvironment = {
      [WORKSPACE_ACCESS_GENERAL_ENABLED_VAR]: 'true',
      [WORKSPACE_COHORT_PILOT_ENABLED_VAR]: 'true',
    }
    expect(isWorkspaceCohortRequired(environment)).toBe(false)
  })

  it('treats any value other than the exact string true as unset', () => {
    expect(isWorkspaceCohortRequired({ [WORKSPACE_ACCESS_GENERAL_ENABLED_VAR]: 'TRUE' })).toBe(true)
    expect(isWorkspaceCohortRequired({ [WORKSPACE_ACCESS_GENERAL_ENABLED_VAR]: '1' })).toBe(true)
    expect(isWorkspaceCohortRequired({ [WORKSPACE_ACCESS_GENERAL_ENABLED_VAR]: '' })).toBe(true)
    expect(isWorkspaceCohortRequired({ [WORKSPACE_ACCESS_GENERAL_ENABLED_VAR]: 'false' })).toBe(true)
    expect(isWorkspaceCohortRequired({ [WORKSPACE_ACCESS_GENERAL_ENABLED_VAR]: undefined })).toBe(true)
  })

  it('names the two variables it reads, so the reader and .env.example cannot drift', () => {
    expect(WORKSPACE_ACCESS_GENERAL_ENABLED_VAR).toBe('WORKSPACE_ACCESS_GENERAL_ENABLED')
    expect(WORKSPACE_COHORT_PILOT_ENABLED_VAR).toBe('WORKSPACE_COHORT_PILOT_ENABLED')
    expect(WORKSPACE_ACCESS_GENERAL_ENABLED_VAR.startsWith('NEXT_PUBLIC_')).toBe(false)
    expect(WORKSPACE_COHORT_PILOT_ENABLED_VAR.startsWith('NEXT_PUBLIC_')).toBe(false)
  })
})

describe('resolveWorkspaceAccessDecision', () => {
  it('passes p_uid and the p_require_cohort the environment implies', async () => {
    const { client, calls } = openClient({ access_enabled: true, cohort_ok: true })

    await resolveWorkspaceAccessDecision(client, USER_ID, {})

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ p_uid: USER_ID, p_require_cohort: true })
    // The drift guard: the arg the RPC receives must be exactly what the
    // predicate decided, never a separately-computed second opinion.
    expect(calls[0].p_require_cohort).toBe(isWorkspaceCohortRequired({}))
  })

  it('passes p_require_cohort false once general availability is enabled', async () => {
    const environment: WorkspaceCohortEnvironment = {
      [WORKSPACE_ACCESS_GENERAL_ENABLED_VAR]: 'true',
    }
    const { client, calls } = openClient({ access_enabled: true, cohort_ok: false })

    await resolveWorkspaceAccessDecision(client, USER_ID, environment)

    expect(calls[0].p_require_cohort).toBe(false)
    expect(calls[0].p_require_cohort).toBe(isWorkspaceCohortRequired(environment))
  })

  it('reaches the database exactly once per invocation', async () => {
    const { client, calls } = openClient({ access_enabled: true, cohort_ok: true })

    await resolveWorkspaceAccessDecision(client, USER_ID, {})

    expect(calls).toHaveLength(1)
  })

  it('mirrors cohort_ok exactly when the cohort IS required', async () => {
    const eligible = openClient({ access_enabled: true, cohort_ok: true })
    await expect(resolveWorkspaceAccessDecision(eligible.client, USER_ID, {})).resolves.toEqual({
      accessEnabled: true,
      cohortEligible: true,
    })

    const outsider = openClient({ access_enabled: true, cohort_ok: false })
    await expect(resolveWorkspaceAccessDecision(outsider.client, USER_ID, {})).resolves.toEqual({
      accessEnabled: true,
      cohortEligible: false,
    })
  })

  it('reports access_enabled verbatim and needs no cohort row once the cohort is not required', async () => {
    const environment: WorkspaceCohortEnvironment = {
      [WORKSPACE_ACCESS_GENERAL_ENABLED_VAR]: 'true',
    }

    const live = openClient({ access_enabled: true, cohort_ok: false })
    await expect(resolveWorkspaceAccessDecision(live.client, USER_ID, environment)).resolves.toEqual({
      accessEnabled: true,
      cohortEligible: true,
    })

    // D-56 still wins: general availability never overrides the kill switch.
    const stopped = openClient({ access_enabled: false, cohort_ok: true })
    await expect(resolveWorkspaceAccessDecision(stopped.client, USER_ID, environment)).resolves.toEqual({
      accessEnabled: false,
      cohortEligible: true,
    })
  })

  it('fails closed when the RPC returns an error', async () => {
    const { client } = stubClient(() => ({ data: null, error: { message: 'permission denied' } }))

    await expect(resolveWorkspaceAccessDecision(client, USER_ID, {})).resolves.toEqual({
      accessEnabled: false,
      cohortEligible: false,
    })
  })

  it('fails closed when the RPC returns no row', async () => {
    const nullData = stubClient(() => ({ data: null, error: null }))
    await expect(resolveWorkspaceAccessDecision(nullData.client, USER_ID, {})).resolves.toEqual({
      accessEnabled: false,
      cohortEligible: false,
    })

    const emptySet = stubClient(() => ({ data: [], error: null }))
    await expect(resolveWorkspaceAccessDecision(emptySet.client, USER_ID, {})).resolves.toEqual({
      accessEnabled: false,
      cohortEligible: false,
    })
  })

  it('normalises a bare object result identically to a one-element set', async () => {
    const asObject = stubClient(() => ({ data: { access_enabled: true, cohort_ok: true }, error: null }))
    const asSet = stubClient(() => ({ data: [{ access_enabled: true, cohort_ok: true }], error: null }))

    const objectDecision = await resolveWorkspaceAccessDecision(asObject.client, USER_ID, {})
    const setDecision = await resolveWorkspaceAccessDecision(asSet.client, USER_ID, {})

    expect(objectDecision).toEqual(setDecision)
    expect(objectDecision).toEqual({ accessEnabled: true, cohortEligible: true })
  })

  it('fails closed when the client throws synchronously rather than propagating', async () => {
    const client: WorkspaceCohortClient = {
      rpc() {
        throw new Error('socket hang up')
      },
    }

    await expect(resolveWorkspaceAccessDecision(client, USER_ID, {})).resolves.toEqual({
      accessEnabled: false,
      cohortEligible: false,
    })
  })

  it('fails closed when the client rejects rather than propagating', async () => {
    const client: WorkspaceCohortClient = {
      rpc() {
        return Promise.reject(new Error('connection reset'))
      },
    }

    await expect(resolveWorkspaceAccessDecision(client, USER_ID, {})).resolves.toEqual({
      accessEnabled: false,
      cohortEligible: false,
    })
  })
})

describe('isWorkspaceAccessPermitted', () => {
  it('permits only when the kill switch is on AND the caller is cohort-eligible', () => {
    expect(isWorkspaceAccessPermitted({ accessEnabled: true, cohortEligible: true })).toBe(true)
    expect(isWorkspaceAccessPermitted({ accessEnabled: true, cohortEligible: false })).toBe(false)
    expect(isWorkspaceAccessPermitted({ accessEnabled: false, cohortEligible: true })).toBe(false)
    expect(isWorkspaceAccessPermitted({ accessEnabled: false, cohortEligible: false })).toBe(false)
  })
})

describe('canAcceptWorkspaceInvitation (R-24)', () => {
  it('R-24: refuses a non-cohort acceptor, so one cohort owner cannot pull in unlimited Members', async () => {
    const { client, calls } = openClient({ access_enabled: true, cohort_ok: false })

    await expect(canAcceptWorkspaceInvitation(client, USER_ID, {})).resolves.toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('admits a cohort acceptor while the pilot is running', async () => {
    const environment: WorkspaceCohortEnvironment = {
      [WORKSPACE_COHORT_PILOT_ENABLED_VAR]: 'true',
    }
    const { client, calls } = openClient({ access_enabled: true, cohort_ok: true })

    await expect(canAcceptWorkspaceInvitation(client, USER_ID, environment)).resolves.toBe(true)
    expect(calls[0].p_require_cohort).toBe(true)
  })

  it('fails closed for the acceptor on an RPC error', async () => {
    const { client } = stubClient(() => ({ data: null, error: { message: 'boom' } }))

    await expect(canAcceptWorkspaceInvitation(client, USER_ID, {})).resolves.toBe(false)
  })
})
