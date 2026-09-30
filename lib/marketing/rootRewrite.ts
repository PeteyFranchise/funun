// ─── Root-route marketing rewrite predicates ───────────────────────────────
// Quick task 260930-ibp, Task 3. Pure, framework-agnostic decision logic for
// middleware.ts's anonymous-only rewrite of `/` to the marketing document.
//
// Kept separate from middleware.ts (which cannot be unit-tested directly:
// it imports @supabase/ssr and next/server primitives that would need
// substantial mocking to invoke) so the actual routing DECISION is a real,
// directly-testable function rather than a source-text assertion.
//
// Do NOT move role routing (staff/buyer/artist) here or into middleware —
// that stays in app/page.tsx. This module answers exactly one question:
// does an anonymous request to `/` get rewritten to the marketing document,
// and does a direct request to the marketing-document path get closed.

/**
 * True only when the request is for the root path AND there is no
 * authenticated user. Authenticated `/` must fall through unchanged so
 * app/page.tsx's role routing (staff / buyer / artist) and, upstream of
 * that in middleware, the collaborator-claim completion for
 * `user && !isAuthRoute` both still run exactly as before.
 */
export function shouldRewriteRootToMarketing(pathname: string, hasUser: boolean): boolean {
  return pathname === '/' && !hasUser
}

/**
 * True for a direct request to the internal marketing-document path,
 * whether from a stale link, a bookmarklet, or a crawler that found it
 * some other way. Middleware sees the real pathname even though an
 * internal NextResponse.rewrite() does not re-enter middleware, which is
 * why this is checked by pathname rather than by a client-settable marker
 * header (a header a client can set is not a trustworthy gate).
 */
export function isMarketingDocumentPath(pathname: string): boolean {
  return pathname === '/marketing-document'
}
