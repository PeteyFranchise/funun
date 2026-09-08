import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

  // Phase 38.0.2 corrected this module's DOCTRINE, never its behaviour. The
  // never-throws contract is retained on purpose — see the header — and this
  // case exists so a reader of that correction cannot mistake it for a
  // licence to change what the function does.
  it('still never throws — a rejected promise here would be a behaviour change this phase did not make', async () => {
    const service = mockService({ error: { message: 'append-only trigger refused the row' } })

    await expect(
      logWorkspaceAction(service as never, {
        workspaceId: WORKSPACE_UUID,
        actorId: ACTOR_UUID,
        subjectMemberId: SUBJECT_UUID,
        action: 'workspace.invitation.issued',
        targetType: 'workspace_invitation',
        targetId: TARGET_UUID,
      })
    ).resolves.toEqual({ ok: false, error: 'append-only trigger refused the row' })
  })
})

// ─── WSR-13 — the doctrine comment itself ─────────────────────────────────
// An unusual test: it reads this module's SOURCE and asserts on its header.
// Worth it, and worth it here specifically. `logWorkspaceAction` used to
// claim to be "the ONE write-through call every workspace-context write
// invokes"; migration 198's transactional RPCs made that false for every
// consequential path in the same phase. A stale doctrine comment in this
// codebase is exactly how migration 139's wrong parenthetical reached
// production and cost a day of broken custody transfer.
describe('lib/workspaces/audit.ts header — the superseded claim is gone (WSR-13)', () => {
  const source = readFileSync(join(process.cwd(), 'lib/workspaces/audit.ts'), 'utf8')

  it('no longer claims to be the ONE write-through call every workspace-context write invokes', () => {
    expect(source).not.toContain('ONE write-through call every workspace-context write')
  })

  it('names the transactional RPCs as the writer for consequential state changes', () => {
    expect(source).toContain('198')
    expect(source.toLowerCase()).toContain('consequential')
  })

  it('names all four surviving non-consequential uses', () => {
    for (const use of ['invitation', 'evidence', 'kill-switch', 'configuration']) {
      expect(source.toLowerCase()).toContain(use)
    }
  })

  it('names the three migration 197 constraints this function now writes under', () => {
    const lowered = source.toLowerCase()
    expect(lowered).toContain('append-only')
    expect(lowered).toContain('restricted')
    expect(lowered).toContain('deferred')
  })
})
