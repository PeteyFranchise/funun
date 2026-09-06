import { logWorkspaceAction } from '@/lib/workspaces/audit'

const WORKSPACE_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ACTOR_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SUBJECT_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const TARGET_UUID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

function mockService(insertResult: { error: { message: string } | null } = { error: null }) {
  const insertSpy = jest.fn((_row: Record<string, unknown>) => Promise.resolve(insertResult))
  const fromSpy = jest.fn(() => ({ insert: insertSpy }))
  return { from: fromSpy, insertSpy, fromSpy }
}

describe('logWorkspaceAction', () => {
  it('inserts exactly one workspace_audit_log row with mapped columns and returns { ok: true }', async () => {
    const service = mockService()
    const result = await logWorkspaceAction(service as never, {
      workspaceId: WORKSPACE_UUID,
      actorId: ACTOR_UUID,
      subjectMemberId: SUBJECT_UUID,
      action: 'workspace.member.role_changed',
      permissionReliedOn: 'manage_registrations',
      targetType: 'workspace_member',
      targetId: TARGET_UUID,
      changes: { role: { before: 'member', after: 'admin' } },
    })

    expect(service.fromSpy).toHaveBeenCalledWith('workspace_audit_log')
    expect(service.insertSpy).toHaveBeenCalledTimes(1)
    expect(service.insertSpy).toHaveBeenCalledWith({
      workspace_id: WORKSPACE_UUID,
      actor_user_id: ACTOR_UUID,
      subject_member_id: SUBJECT_UUID,
      action: 'workspace.member.role_changed',
      permission_relied_on: 'manage_registrations',
      target_type: 'workspace_member',
      target_id: TARGET_UUID,
      changes: { role: { before: 'member', after: 'admin' } },
    })
    expect(result).toEqual({ ok: true, error: undefined })
  })

  it('never collapses the two identities — actor and subject stay distinct on the inserted row', async () => {
    const service = mockService()
    await logWorkspaceAction(service as never, {
      workspaceId: WORKSPACE_UUID,
      actorId: ACTOR_UUID,
      subjectMemberId: SUBJECT_UUID,
      action: 'workspace.member.removed',
      targetType: 'workspace_member',
    })

    const insertedRow = service.insertSpy.mock.calls[0]?.[0]
    expect(insertedRow?.actor_user_id).toBe(ACTOR_UUID)
    expect(insertedRow?.subject_member_id).toBe(SUBJECT_UUID)
    expect(insertedRow?.actor_user_id).not.toBe(insertedRow?.subject_member_id)
  })

  it('accepts a null subjectMemberId for workspace-administrative actions and still records a non-null actor', async () => {
    const service = mockService()
    await logWorkspaceAction(service as never, {
      workspaceId: WORKSPACE_UUID,
      actorId: ACTOR_UUID,
      subjectMemberId: null,
      action: 'workspace.created',
      targetType: 'workspace',
      targetId: WORKSPACE_UUID,
    })

    expect(service.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ actor_user_id: ACTOR_UUID, subject_member_id: null })
    )
  })

  it('defaults permissionReliedOn to null, targetId to null, and changes to {} when omitted', async () => {
    const service = mockService()
    await logWorkspaceAction(service as never, {
      workspaceId: WORKSPACE_UUID,
      actorId: ACTOR_UUID,
      subjectMemberId: null,
      action: 'workspace.created',
      targetType: 'workspace',
    })

    expect(service.insertSpy).toHaveBeenCalledWith({
      workspace_id: WORKSPACE_UUID,
      actor_user_id: ACTOR_UUID,
      subject_member_id: null,
      action: 'workspace.created',
      permission_relied_on: null,
      target_type: 'workspace',
      target_id: null,
      changes: {},
    })
  })

  it('passes permissionReliedOn through unchanged when supplied', async () => {
    const service = mockService()
    await logWorkspaceAction(service as never, {
      workspaceId: WORKSPACE_UUID,
      actorId: ACTOR_UUID,
      subjectMemberId: SUBJECT_UUID,
      action: 'workspace.member.status_changed',
      permissionReliedOn: 'edit_rights_information',
      targetType: 'workspace_member',
    })

    expect(service.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ permission_relied_on: 'edit_rights_information' })
    )
  })

  it('returns { ok: false, error } (never throws) when the mocked insert returns an error', async () => {
    const service = mockService({ error: { message: 'insert failed' } })
    const result = await logWorkspaceAction(service as never, {
      workspaceId: WORKSPACE_UUID,
      actorId: ACTOR_UUID,
      subjectMemberId: null,
      action: 'workspace.created',
      targetType: 'workspace',
    })

    expect(result).toEqual({ ok: false, error: 'insert failed' })
  })
})
