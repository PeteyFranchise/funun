/**
 * Which URL paths require a signed-in user. Used by middleware.ts, so this
 * module stays pure and edge-safe: no imports, no node:* modules.
 *
 * The intent is "require sign-in on all artist routes". Every top-level
 * directory under app/(artist) must be matched here; lib/auth/protectedRoutes.test.ts
 * walks that directory and fails if one is not, so a new artist route is gated
 * by default and cannot be forgotten.
 *
 * Intentionally public pages (not matched here):
 *   - /approve and /join: collaborators open approval and invite pages without
 *     a Funūn account (D-15, D-08).
 *   - /ideas/join/<token>: renders its own sign-in card for anonymous visitors.
 *   - /curators/claim and /curators/claim/<token>: public token pages.
 *   - /sync, /u, /r, /pitch, /selects, /status, /team-fit, /unsubscribe, /help,
 *     /profile-preview, /marketing-document.
 *   - /, /signin, /signup, /forgot-password and /update-password. The recovery
 *     landing at /update-password must always be reachable.
 */

/**
 * Raw prefix matches, kept exactly as middleware.ts matched them before this
 * module existed so behavior for these routes is unchanged.
 */
const LEGACY_PREFIXES = [
  '/vault',
  '/dashboard',
  '/settings',
  '/collaborators',
  '/split-sheets',
  '/launchpad',
  '/admin',
] as const

/**
 * Artist routes matched by whole segment: the base path itself or anything
 * beneath it. Segment matching (not a raw prefix) keeps neighbors such as
 * /coaching, /toolsy or /deals-archive out of scope.
 */
const SEGMENT_BASES = [
  '/antenna',
  '/benchmarks',
  '/coach',
  '/contracts',
  '/deals',
  '/earnings',
  '/green-room',
  '/ideas',
  '/messages',
  '/network',
  '/opportunities',
  '/sync-library',
  '/tools',
] as const

/**
 * app/curators/claim/** is a public token page that lives outside the (artist)
 * group but shares the /curators URL prefix, so only the artist directory page
 * at exactly /curators is gated.
 */
const EXACT_ONLY = ['/curators'] as const

/**
 * Pages inside a protected segment that must stay reachable anonymously.
 * app/(artist)/ideas/join/[token]/page.tsx deliberately renders a sign-in card
 * for anonymous visitors.
 */
const PUBLIC_PREFIXES = ['/ideas/join/'] as const

export function isProtectedPath(pathname: string): boolean {
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return false

  if (LEGACY_PREFIXES.some((p) => pathname.startsWith(p))) return true
  if (pathname === '/w' || pathname.startsWith('/w/')) return true

  if (SEGMENT_BASES.some((base) => pathname === base || pathname.startsWith(base + '/'))) {
    return true
  }

  return EXACT_ONLY.some((p) => pathname === p)
}
