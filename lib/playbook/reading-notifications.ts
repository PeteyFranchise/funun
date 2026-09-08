import type { StaffRole } from '@/lib/admin/staff-role'
import type { ReadingAssignment } from '@/lib/playbook/assignments'

export function readingRecipientIds(
  assignments: readonly ReadingAssignment[],
  staff: ReadonlyArray<{ userId: string; roles: readonly StaffRole[] }>
): string[] {
  const recipients = new Set<string>()
  for (const assignment of assignments) {
    if (assignment.revoked_at) continue
    if (assignment.target_kind === 'user' && assignment.target_user_id) {
      recipients.add(assignment.target_user_id)
      continue
    }
    if (assignment.target_kind === 'role' && assignment.target_role) {
      for (const person of staff) {
        if (person.roles.includes(assignment.target_role)) recipients.add(person.userId)
      }
    }
  }
  return [...recipients]
}
