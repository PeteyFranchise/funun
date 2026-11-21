// ─── Content-Security-Policy builder ────────────────────────────────────
// Pure policy builder extracted from middleware.ts (quick task 261118-ryb).
// middleware.ts owns the per-request nonce and forwards it here; this
// module owns the directive list itself, so both the production and
// dev-only policies can be asserted by string equality against the running
// app rather than by reading middleware.ts source.
//
// Cloudflare Turnstile (waitlist bot check, quick task 261002-wtl) needs
// challenges.cloudflare.com in two directives, and only two:
//   - frame-src: this is what actually unblocks the widget. Turnstile
//     renders its challenge in a cross-origin iframe, and because
//     frame-src is explicitly set here, default-src 'self' does not
//     back it up.
//   - script-src: vendor-documented requirement, but INERT while
//     'strict-dynamic' is present -- CSP3 ignores host-source
//     expressions once 'strict-dynamic' appears, and the widget's own
//     script tag loads anyway because Next's loadScript() creates it
//     from inside this already-trusted nonced runtime, which
//     'strict-dynamic' permits regardless of host. Carried for
//     CSP2-only clients (which ignore the unknown 'strict-dynamic'
//     keyword and enforce the host list) and for correctness if
//     'strict-dynamic' is ever removed.
// connect-src deliberately unchanged -- Cloudflare's CSP reference
// requires only 'self' there (pre-clearance cdn-cgi calls), already
// present; the widget's network traffic runs inside the cross-origin
// iframe, governed by that iframe's own policy, not this one.

export function buildContentSecurityPolicy({
  nonce,
  allowUnsafeEval,
}: {
  nonce: string
  allowUnsafeEval: boolean
}): string {
  // Dev-only relaxation: Next's webpack dev server evaluates every client
  // module through `eval`, so on localhost the unrelaxed policy below
  // refuses /_next/static/chunks/main-app.js, React never hydrates, and
  // every client component (e.g. the /signin form) falls back to a native
  // HTML submit that looks like "the page just refreshes". Appending
  // 'unsafe-eval' only when allowUnsafeEval is true keeps the production
  // policy byte-for-byte unchanged -- see the caller in middleware.ts,
  // which passes allowUnsafeEval: process.env.NODE_ENV !== 'production'.
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com https://challenges.cloudflare.com${allowUnsafeEval ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob: https://*.supabase.co",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://api.stripe.com",
    "frame-src https://js.stripe.com https://*.docuseal.com https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    'upgrade-insecure-requests',
  ].join('; ')
}
