import { readingRecipientIds } from './reading-notifications'
import type { ReadingAssignment } from './assignments'

const base: ReadingAssignment = {
  id: 'a-1',
  entry_id: 'e-1',
  target_kind: 'role',
  target_user_id: null,
  target_role: 'anr',
  required_revision: 1,
  required: true,
  due_at: null,
  assigned_by: null,
  created_at: '2026-09-07T00:00:00Z',
  revoked_at: null,
}

it('expands role audiences, direct recipients, and duplicates safely', () => {
  expect(readingRecipientIds(
    [base, { ...base, id: 'a-2', target_kind: 'user', target_user_id: 'u-1', target_role: null }],
    [{ userId: 'u-1', roles: ['anr'] }, { userId: 'u-2', roles: ['ae'] }]
  )).toEqual(['u-1'])
})
