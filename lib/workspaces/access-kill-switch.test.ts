import {
  readWorkspaceAccessState,
  setWorkspaceAccessEnabled,
} from '@/lib/workspaces/access-kill-switch'

const ACTOR_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

type ConfigRow = {
  enabled: boolean
  disabled_reason: string | null
  disabled_by: string | null
  disabled_at: string | null
}

function mockSelectService(row: ConfigRow | null, error: { message: string } | null = null) {
  const maybeSingle = jest.fn(() => Promise.resolve({ data: row, error }))
  const eq = jest.fn(() => ({ maybeSingle }))
  const select = jest.fn(() => ({ eq }))
  const from = jest.fn(() => ({ select }))
  return { from, select, eq, maybeSingle }
}

function mockUpdateService(row: ConfigRow | null, error: { message: string } | null = null) {
  const maybeSingle = jest.fn(() => Promise.resolve({ data: row, error }))
  const select = jest.fn(() => ({ maybeSingle }))
  const eq = jest.fn(() => ({ select }))
  const update = jest.fn(() => ({ eq }))
  const from = jest.fn(() => ({ update }))
  return { from, update, eq, select, maybeSingle }
}

describe('readWorkspaceAccessState', () => {
  it('reads the singleton row and maps it to the WorkspaceAccessState shape', async () => {
    const service = mockSelectService({
      enabled: true,
      disabled_reason: null,
      disabled_by: null,
      disabled_at: null,
    })

    const result = await readWorkspaceAccessState(service as never)

    expect(service.from).toHaveBeenCalledWith('workspace_access_config')
    expect(service.eq).toHaveBeenCalledWith('id', true)
    expect(result).toEqual({
      enabled: true,
      disabledReason: null,
      disabledBy: null,
      disabledAt: null,
    })
  })

  it('surfaces a disabled state with its reason/actor/timestamp', async () => {
    const service = mockSelectService({
      enabled: false,
      disabled_reason: 'suspected RLS defect',
      disabled_by: ACTOR_UUID,
      disabled_at: '2026-09-05T00:00:00.000Z',
    })

    const result = await readWorkspaceAccessState(service as never)

    expect(result).toEqual({
      enabled: false,
      disabledReason: 'suspected RLS defect',
      disabledBy: ACTOR_UUID,
      disabledAt: '2026-09-05T00:00:00.000Z',
    })
  })

  it('throws when the singleton row is missing', async () => {
    const service = mockSelectService(null)
    await expect(readWorkspaceAccessState(service as never)).rejects.toThrow(
      'Workspace access config row is missing'
    )
  })

  it('throws a wrapped error when the read itself fails', async () => {
    const service = mockSelectService(null, { message: 'connection reset' })
    await expect(readWorkspaceAccessState(service as never)).rejects.toThrow(
      'Failed to read workspace access config: connection reset'
    )
  })
})

describe('setWorkspaceAccessEnabled', () => {
  it('disabling with a reason updates enabled=false and records reason/actor/timestamp', async () => {
    const service = mockUpdateService({
      enabled: false,
      disabled_reason: 'suspected RLS defect',
      disabled_by: ACTOR_UUID,
      disabled_at: '2026-09-05T00:00:00.000Z',
    })

    const result = await setWorkspaceAccessEnabled(service as never, {
      enabled: false,
      reason: 'suspected RLS defect',
      actorUserId: ACTOR_UUID,
    })

    expect(service.from).toHaveBeenCalledWith('workspace_access_config')
    const updatePayload = (service.update as jest.Mock).mock.calls[0]?.[0]
    expect(updatePayload).toMatchObject({
      enabled: false,
      disabled_reason: 'suspected RLS defect',
      disabled_by: ACTOR_UUID,
    })
    expect(typeof updatePayload.disabled_at).toBe('string')
    expect(typeof updatePayload.updated_at).toBe('string')
    expect(service.eq).toHaveBeenCalledWith('id', true)
    expect(result.enabled).toBe(false)
    expect(result.disabledReason).toBe('suspected RLS defect')
  })

  it('re-enabling nulls out disabled_reason, disabled_by and disabled_at', async () => {
    const service = mockUpdateService({
      enabled: true,
      disabled_reason: null,
      disabled_by: null,
      disabled_at: null,
    })

    await setWorkspaceAccessEnabled(service as never, {
      enabled: true,
      actorUserId: ACTOR_UUID,
    })

    const updatePayload = (service.update as jest.Mock).mock.calls[0]?.[0]
    expect(updatePayload).toMatchObject({
      enabled: true,
      disabled_reason: null,
      disabled_by: null,
      disabled_at: null,
    })
  })

  it('throws when disabling with no reason', async () => {
    const service = mockUpdateService(null)
    await expect(
      setWorkspaceAccessEnabled(service as never, { enabled: false, actorUserId: ACTOR_UUID })
    ).rejects.toThrow('A reason is required to disable workspace access')
    expect(service.update).not.toHaveBeenCalled()
  })

  it('throws when disabling with a whitespace-only reason', async () => {
    const service = mockUpdateService(null)
    await expect(
      setWorkspaceAccessEnabled(service as never, {
        enabled: false,
        reason: '   ',
        actorUserId: ACTOR_UUID,
      })
    ).rejects.toThrow('A reason is required to disable workspace access')
    expect(service.update).not.toHaveBeenCalled()
  })

  it('throws "Workspace access config row is missing" when the UPDATE affects zero rows', async () => {
    const service = mockUpdateService(null)
    await expect(
      setWorkspaceAccessEnabled(service as never, { enabled: true, actorUserId: ACTOR_UUID })
    ).rejects.toThrow('Workspace access config row is missing')
  })

  it('throws a wrapped error when the update itself fails', async () => {
    const service = mockUpdateService(null, { message: 'permission denied' })
    await expect(
      setWorkspaceAccessEnabled(service as never, { enabled: true, actorUserId: ACTOR_UUID })
    ).rejects.toThrow('Failed to update workspace access config: permission denied')
  })

  it('never attempts an INSERT — only ever updates the seeded singleton row', async () => {
    // The mock's `from()` deliberately exposes only `update` (no `insert`
    // key at all) — if the implementation ever called `.insert(...)` this
    // would throw a TypeError instead of silently succeeding, so a
    // successful resolve here IS the proof no INSERT path was exercised.
    const service = mockUpdateService({
      enabled: true,
      disabled_reason: null,
      disabled_by: null,
      disabled_at: null,
    })
    await expect(
      setWorkspaceAccessEnabled(service as never, { enabled: true, actorUserId: ACTOR_UUID })
    ).resolves.toMatchObject({ enabled: true })
    expect(service.update).toHaveBeenCalledTimes(1)
  })
})
