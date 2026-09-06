import { buildActingContext, formatActingAttribution } from '@/lib/workspaces/acting'

const ACTOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SUBJECT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

describe('formatActingAttribution', () => {
  it('contains the actor, the workspace, and the subject in the attributed form', () => {
    const result = formatActingAttribution({
      actorName: 'Alex',
      workspaceName: 'Rise Management',
      subjectName: 'Jordan',
    })

    expect(result).toBe('Alex (Rise Management, on behalf of Jordan)')
    expect(result).toContain('Alex')
    expect(result).toContain('Rise Management')
    expect(result).toContain('Jordan')
    expect(result).toContain('on behalf of')
  })

  it('omits the on-behalf clause when the subject is null — a workspace-administrative action is not delegated', () => {
    const result = formatActingAttribution({
      actorName: 'Alex',
      workspaceName: 'Rise Management',
      subjectName: null,
    })

    expect(result).toBe('Alex (Rise Management)')
    expect(result).not.toContain('on behalf of')
  })
})

describe('buildActingContext', () => {
  it('returns a context carrying all four fields exactly as supplied', () => {
    const result = buildActingContext({
      actorUserId: ACTOR_ID,
      workspaceId: WORKSPACE_ID,
      subjectMemberId: SUBJECT_ID,
      permissionReliedOn: 'edit_metadata',
    })

    expect(result).toEqual({
      ok: true,
      context: {
        actorUserId: ACTOR_ID,
        workspaceId: WORKSPACE_ID,
        subjectMemberId: SUBJECT_ID,
        permissionReliedOn: 'edit_metadata',
      },
    })
  })

  it('permits a null permissionReliedOn (a workspace-administrative action, not a delegated one)', () => {
    const result = buildActingContext({
      actorUserId: ACTOR_ID,
      workspaceId: WORKSPACE_ID,
      subjectMemberId: SUBJECT_ID,
      permissionReliedOn: null,
    })

    expect(result.ok).toBe(true)
  })

  it('permits actorUserId equal to subjectMemberId when permissionReliedOn is null (ordinary self-service, not acting-on-behalf)', () => {
    const result = buildActingContext({
      actorUserId: ACTOR_ID,
      workspaceId: WORKSPACE_ID,
      subjectMemberId: ACTOR_ID,
      permissionReliedOn: null,
    })

    expect(result.ok).toBe(true)
  })

  it('fails when actorUserId and subjectMemberId are the same value together with a non-null permissionReliedOn', () => {
    const result = buildActingContext({
      actorUserId: ACTOR_ID,
      workspaceId: WORKSPACE_ID,
      subjectMemberId: ACTOR_ID,
      permissionReliedOn: 'edit_metadata',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('cannot act on behalf of themselves')
    }
  })
})
