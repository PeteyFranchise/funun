import { logStaffAction } from '@/lib/staff/audit'

const ACTOR_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TARGET_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function mockService(insertResult: { error: { message: string } | null } = { error: null }) {
  const insertSpy = jest.fn(async () => insertResult)
  const fromSpy = jest.fn(() => ({ insert: insertSpy }))
  return { from: fromSpy, insertSpy, fromSpy }
}

describe('logStaffAction', () => {
  it('inserts exactly one staff_audit_log row with mapped columns and returns { ok: true }', async () => {
    const service = mockService()
    const result = await logStaffAction(service as never, {
      actorId: ACTOR_UUID,
      action: 'edit_buyer_org',
      targetType: 'buyer_org',
      targetId: TARGET_UUID,
      changes: { name: 'New Name' },
    })

    expect(service.fromSpy).toHaveBeenCalledWith('staff_audit_log')
    expect(service.insertSpy).toHaveBeenCalledTimes(1)
    expect(service.insertSpy).toHaveBeenCalledWith({
      actor_id: ACTOR_UUID,
      action: 'edit_buyer_org',
      target_type: 'buyer_org',
      target_id: TARGET_UUID,
      changes: { name: 'New Name' },
    })
    expect(result).toEqual({ ok: true, error: undefined })
  })

  it('logs a no-op/idempotent edit (empty changes) with exactly one insert — unconditional log, D-04', async () => {
    const service = mockService()
    const result = await logStaffAction(service as never, {
      actorId: ACTOR_UUID,
      action: 'edit_buyer_org',
      targetType: 'buyer_org',
      targetId: TARGET_UUID,
      changes: {},
    })

    expect(service.insertSpy).toHaveBeenCalledTimes(1)
    expect(service.insertSpy).toHaveBeenCalledWith(expect.objectContaining({ changes: {} }))
    expect(result.ok).toBe(true)
  })

  it('defaults targetId to null and changes to {} when omitted (only actorId/action/targetType required)', async () => {
    const service = mockService()
    await logStaffAction(service as never, {
      actorId: ACTOR_UUID,
      action: 'create_staff',
      targetType: 'funun_staff',
    })

    expect(service.insertSpy).toHaveBeenCalledWith({
      actor_id: ACTOR_UUID,
      action: 'create_staff',
      target_type: 'funun_staff',
      target_id: null,
      changes: {},
    })
  })

  it('returns { ok: false, error } (never throws) when the mocked insert returns an error', async () => {
    const service = mockService({ error: { message: 'insert failed' } })
    const result = await logStaffAction(service as never, {
      actorId: ACTOR_UUID,
      action: 'edit_buyer_org',
      targetType: 'buyer_org',
    })

    expect(result).toEqual({ ok: false, error: 'insert failed' })
  })
})
