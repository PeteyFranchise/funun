import { getStaffRole } from '@/lib/admin/staff-role'

// ─── Post-sign-in routing (Phase 25 / 25-11 — login-routing Option A) ──────
// Pure destination resolver for the sign-in page. Precedence:
//   1. an explicit, same-origin ?next= deep link always wins;
//   2. otherwise Funūn staff land on the admin surface and everyone else on the
//      Sound Vault (the app's existing default home).
// There is no /admin index route (it 404s), so staff are sent to a real page.

export const STAFF_HOME = '/admin/my-client-partners'
export const DEFAULT_HOME = '/vault'

// Only honour same-origin relative paths ('/...'). Reject absolute URLs and
// protocol-relative ('//host') values so a crafted ?next= cannot open-redirect
// a freshly authenticated session off-site (the prior `router.push(next)` did
// no such check).
function safeNext(next?: string | null): string | null {
  const n = next?.trim()
  if (!n) return null
  if (n.startsWith('/') && !n.startsWith('//')) return n
  return null
}

export function postSignInPath(input: {
  user: { app_metadata?: unknown } | null
  next?: string | null
}): string {
  const next = safeNext(input.next)
  if (next) return next
  return getStaffRole(input.user ?? {}) ? STAFF_HOME : DEFAULT_HOME
}
