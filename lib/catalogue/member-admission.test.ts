import { planWorkMemberAdmission } from './member-admission'

describe('planWorkMemberAdmission', () => {
  it('links a claimed collaborator directly to their Funūn account', () => {
    expect(planWorkMemberAdmission('member-user-id')).toEqual({
      kind: 'direct',
      userId: 'member-user-id',
    })
  })

  it('requires an invite only when no verified account link exists', () => {
    expect(planWorkMemberAdmission(null)).toEqual({
      kind: 'invite-required',
      userId: null,
    })
  })
})
