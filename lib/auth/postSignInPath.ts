import { getStaffRole } from '@/lib/admin/staff-role'

// ─── Post-sign-in routing (Phase 25 / 25-11 — login-routing Option A;
// Phase 23 / 23-05 — buyer role branch) ─────────────────────────────────────
// Pure destination resolver, reused by both the sign-in page and the
// recovery/callback flow (23-05 Task 2). Precedence:
//   1. an explicit, same-origin ?next= deep link always wins for every role;
//   2. a buyer (app_metadata.role === 'buyer') lands on the buyer catalogue —
//      a buyer is never staff and must never be dropped on the artist /vault
//      (RESEARCH Pitfall 2);
//   3. otherwise Funūn staff land on the admin surface and everyone else on
//      the Sound Vault (the app's existing default home).
// There is no /admin index route (it 404s), so staff are sent to a real page.

export const BUYER_HOME = '/sync/catalog'
// 31.1 (D-31.1-01): the former /admin/my-client-partners page is retired
// (redirects to the consolidated Client Partners room) — point staff
// straight at the room to avoid a redundant redirect on every sign-in.
export const STAFF_HOME = '/admin/client-partners'
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

  // A buyer is never staff — check the buyer branch before staff/default
  // resolution so a buyer's role always wins that ordering, even though
  // getStaffRole() would independently return null for a buyer anyway.
  const meta = (input.user?.app_metadata ?? undefined) as { role?: string } | undefined
  if (meta?.role === 'buyer') return BUYER_HOME

  return getStaffRole(input.user ?? {}) ? STAFF_HOME : DEFAULT_HOME
}
