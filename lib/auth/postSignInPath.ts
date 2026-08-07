import { getStaffRole } from '@/lib/admin/staff-role'

// ─── Post-sign-in routing (Phase 25 / 25-11 — login-routing Option A) ──────
// Pure destination resolver for the sign-in page. Precedence:
//   1. an explicit, same-origin ?next= deep link always wins;
//   2. otherwise Funūn staff land on the admin surface and everyone else on the
//      Sound Vault (the app's existing default home).
// There is no /admin index route (it 404s), so staff are sent to a real page.

export const STAFF_HOME = '/admin/my-client-partners'
export const DEFAULT_HOME = '/vault'

const APP_ORIGIN = 'https://funun.studio'

// Only honour same-origin relative paths ('/...'). A crafted ?next= must not
// open-redirect a freshly authenticated session off-site. Browsers treat BOTH
// '//host' and '/\host' as protocol-relative (off-site), so reject a second
// '/' or a backslash right after the leading '/'. Then resolve against the app
// origin and require the origin to be UNCHANGED — the WHATWG URL parser strips
// embedded tabs/newlines and normalises backslashes before we re-check, so any
// value that resolves off-origin (e.g. '/\evil.com', '/\t//evil.com') is caught
// here, and only a genuine same-origin path is returned.
function safeNext(next?: string | null): string | null {
  const n = next?.trim()
  if (!n) return null
  if (n[0] !== '/' || n[1] === '/' || n[1] === '\\') return null
  try {
    const url = new URL(n, APP_ORIGIN)
    if (url.origin !== APP_ORIGIN) return null
    return url.pathname + url.search + url.hash
  } catch {
    return null
  }
}

export function postSignInPath(input: {
  user: { app_metadata?: unknown } | null
  next?: string | null
}): string {
  const next = safeNext(input.next)
  if (next) return next
  return getStaffRole(input.user ?? {}) ? STAFF_HOME : DEFAULT_HOME
}
