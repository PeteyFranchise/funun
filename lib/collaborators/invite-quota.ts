import { checkRateLimit } from '@/lib/security/rate-limit'

// ─── Per-sender invite limits ─────────────────────────────────────────────
// Keyed on the sender's user id, shared by POST /api/collaborators/[id]/invite
// and POST /api/collaborators/quick-invite so both routes draw from one budget.
// Fail-closed: if the limiter errors, invites are refused rather than sent
// without a cap. The 60s per-collaborator cooldown in lib/collaborators/invite.ts
// stays as the double-send guard; these limits bound total volume per sender.
//
// Kept out of lib/collaborators/invite.ts on purpose: route tests mock that
// module with a factory, so an extra export there would be undefined.
export const COLLABORATOR_INVITE_RATE_LIMITS = {
  hourly: { windowMs: 60 * 60 * 1000, maxAttempts: 30, failClosed: true },
  daily: { windowMs: 24 * 60 * 60 * 1000, maxAttempts: 100, failClosed: true },
} as const

/** True when the sender is over the hourly or daily limit, or the limiter is unavailable. */
export async function isCollaboratorInviteRateLimited(userId: string): Promise<boolean> {
  const hourlyLimited = await checkRateLimit(
    `collab-invite:hour:${userId}`,
    COLLABORATOR_INVITE_RATE_LIMITS.hourly
  )
  if (hourlyLimited) return true

  return checkRateLimit(`collab-invite:day:${userId}`, COLLABORATOR_INVITE_RATE_LIMITS.daily)
}
