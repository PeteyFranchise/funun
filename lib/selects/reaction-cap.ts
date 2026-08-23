// ─── Selects reaction-cap error detection ─────────────────────────────────
// Migration 126 serializes per-track reaction writes behind an advisory lock
// and enforces the cap with a CHECK that raises SQLSTATE 23514 (check_
// violation) tagged 'selects reaction cap'. The public react route maps that
// specific violation to a 409 (cap reached) instead of a generic 500.
//
// This predicate lives in lib/ — NOT the route file — on purpose: a Next.js
// route module may only export request handlers + route config, so exporting
// a helper from route.ts fails `next build`. The react route and its test
// both import it from here. Do not move it back into the route.
export function isSelectsReactionCapError(error: { code?: string; message?: string } | null) {
  return error?.code === '23514' && error.message?.includes('selects reaction cap') === true
}
