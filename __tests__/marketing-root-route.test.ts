// ─── Marketing root-route tests ─────────────────────────────────────────
// Quick task 260930-ibp, Task 3. No jsdom exists in this repo, and
// middleware.ts itself imports @supabase/ssr + next/server primitives that
// would need substantial mocking to invoke directly — the existing
// convention in __tests__/middleware-auth.test.ts is source-text
// assertion for exactly that reason. This file follows the same pattern
// for the parts of middleware.ts that cannot be isolated, and tests real
// behavior directly wherever the logic was extracted into a pure function
// (lib/marketing/rootRewrite.ts, lib/marketing/nonceInjection.ts) for
// exactly this purpose.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  isMarketingDocumentPath,
  shouldRewriteRootToMarketing,
} from '@/lib/marketing/rootRewrite'
import { injectNonce, NONCE_PLACEHOLDER } from '@/lib/marketing/nonceInjection'

const middlewareSource = () => readFileSync(path.join(process.cwd(), 'middleware.ts'), 'utf8')

// ─── routing predicate ────────────────────────────────────────────────

describe('shouldRewriteRootToMarketing', () => {
  it('rewrites an anonymous request for the root path', () => {
    expect(shouldRewriteRootToMarketing('/', false)).toBe(true)
  })

  it('falls through for an authenticated request to the root path', () => {
    expect(shouldRewriteRootToMarketing('/', true)).toBe(false)
  })

  it('leaves any protected path unchanged for an anonymous request', () => {
    expect(shouldRewriteRootToMarketing('/vault', false)).toBe(false)
    expect(shouldRewriteRootToMarketing('/dashboard', false)).toBe(false)
    expect(shouldRewriteRootToMarketing('/settings', false)).toBe(false)
  })

  it('leaves any non-root path unchanged regardless of auth state', () => {
    expect(shouldRewriteRootToMarketing('/signin', false)).toBe(false)
    expect(shouldRewriteRootToMarketing('/signin', true)).toBe(false)
  })
})

describe('isMarketingDocumentPath', () => {
  it('matches only the exact internal marketing-document path', () => {
    expect(isMarketingDocumentPath('/marketing-document')).toBe(true)
  })

  it('does not match the root path, a marketing asset path, or an unrelated path', () => {
    expect(isMarketingDocumentPath('/')).toBe(false)
    expect(isMarketingDocumentPath('/marketing/img/face-01.jpg')).toBe(false)
    expect(isMarketingDocumentPath('/marketing-document-extra')).toBe(false)
    expect(isMarketingDocumentPath('/dashboard')).toBe(false)
  })
})

// ─── nonce injection ──────────────────────────────────────────────────

describe('injectNonce', () => {
  const NONCE = 'abc123nonce'

  it('replaces every placeholder and reports the correct count', () => {
    const html = `<script ${NONCE_PLACEHOLDER}data>a()</script>`.replace(
      `${NONCE_PLACEHOLDER}data`,
      `nonce="${NONCE_PLACEHOLDER}"`,
    )
    const result = injectNonce(html, NONCE, 1)
    expect(result.replacedCount).toBe(1)
    expect(result.html).toBe(`<script nonce="${NONCE}">a()</script>`)
  })

  it('replaces multiple placeholders and matches the expected count', () => {
    const html =
      `<script nonce="${NONCE_PLACEHOLDER}">a()</script>` +
      `<p>mid</p>` +
      `<script nonce="${NONCE_PLACEHOLDER}">b()</script>`
    const result = injectNonce(html, NONCE, 2)
    expect(result.replacedCount).toBe(2)
    expect(result.html).toBe(
      `<script nonce="${NONCE}">a()</script><p>mid</p><script nonce="${NONCE}">b()</script>`,
    )
  })

  it('changes nothing outside the replaced spans', () => {
    const before = '<html><body><p>untouched content right here</p>'
    const after = '<p>more untouched content</p></body></html>'
    const html = `${before}<script nonce="${NONCE_PLACEHOLDER}">x()</script>${after}`
    const result = injectNonce(html, NONCE, 1)
    expect(result.html.startsWith(before)).toBe(true)
    expect(result.html.endsWith(after)).toBe(true)
  })

  it('throws when the nonce is empty', () => {
    expect(() => injectNonce(`<script nonce="${NONCE_PLACEHOLDER}">a()</script>`, '', 1)).toThrow(
      /non-empty/,
    )
  })

  it('throws when the replacement count does not match the expected count', () => {
    const html = `<script nonce="${NONCE_PLACEHOLDER}">a()</script>`
    expect(() => injectNonce(html, NONCE, 2)).toThrow(/expected 2 placeholder\(s\), found 1/)
  })

  it('throws when zero placeholders are present but a positive count was expected', () => {
    expect(() => injectNonce('<p>no scripts here</p>', NONCE, 1)).toThrow(
      /expected 1 placeholder\(s\), found 0/,
    )
  })

  it('throws when a <script> tag does not carry the nonce (would be CSP-blocked)', () => {
    // A pathological input that satisfies the placeholder count but leaves
    // a second, un-nonced <script> tag elsewhere in the document.
    const html = `<script nonce="${NONCE_PLACEHOLDER}">a()</script><script>b()</script>`
    expect(() => injectNonce(html, NONCE, 1)).toThrow(/carry the nonce/)
  })
})

// ─── middleware wiring (source-text assertions, matching the existing
// __tests__/middleware-auth.test.ts convention: middleware.ts imports
// @supabase/ssr + next/server primitives that need substantial mocking to
// invoke directly) ────────────────────────────────────────────────────

describe('middleware.ts marketing-document wiring', () => {
  it('checks isMarketingDocumentPath before the demo-mode bypass, so a direct hit is always closed', () => {
    const source = middlewareSource()
    const closeIdx = source.indexOf('isMarketingDocumentPath(req.nextUrl.pathname)')
    const demoIdx = source.indexOf("NEXT_PUBLIC_VAULT_DEMO === 'true'")
    expect(closeIdx).toBeGreaterThan(-1)
    expect(demoIdx).toBeGreaterThan(-1)
    expect(closeIdx).toBeLessThan(demoIdx)
  })

  it('rewrites to /marketing-document only after the isProtected redirect and forwards the built request headers', () => {
    const source = middlewareSource()
    expect(source).toContain('shouldRewriteRootToMarketing(pathname, Boolean(user))')
    expect(source).toContain("NextResponse.rewrite(new URL('/marketing-document', req.url)")
    expect(source).toContain('request: { headers: buildForwardedRequestHeaders() }')

    const protectedIdx = source.indexOf('if (isProtected && !user)')
    const rewriteIdx = source.indexOf('shouldRewriteRootToMarketing(pathname, Boolean(user))')
    expect(protectedIdx).toBeGreaterThan(-1)
    expect(rewriteIdx).toBeGreaterThan(protectedIdx)
  })

  it('REGRESSION: the collaborator-claim branch is still reached after the rewrite check for authenticated requests', () => {
    // The failure this guards against is silent: an authenticated redirect
    // inserted ABOVE `if (user && !isAuthRoute)` would skip collaborator-claim
    // completion with no test noticing. shouldRewriteRootToMarketing itself
    // returns false whenever hasUser is true (asserted above), so the
    // rewrite's early return can never fire for an authenticated request —
    // this test additionally locks the SOURCE ORDER so a future edit can't
    // reintroduce an unconditional early return between the two.
    const source = middlewareSource()
    const rewriteBlockIdx = source.indexOf('if (shouldRewriteRootToMarketing(pathname, Boolean(user))) {')
    const claimBlockIdx = source.indexOf('if (user && !isAuthRoute) {')
    expect(rewriteBlockIdx).toBeGreaterThan(-1)
    expect(claimBlockIdx).toBeGreaterThan(-1)
    expect(claimBlockIdx).toBeGreaterThan(rewriteBlockIdx)

    // The rewrite's only early return lives inside its own `if` block, so
    // an authenticated request (hasUser=true -> predicate false) falls
    // straight through the whole block body to the code that follows.
    const rewriteBlockText = source.slice(
      rewriteBlockIdx,
      source.indexOf('\n  }\n', rewriteBlockIdx) + '\n  }\n'.length,
    )
    expect(rewriteBlockText).toContain('return respondWithAuthState(rewriteResponse)')

    // Still exactly the pre-existing claim condition -- unmodified by this feature.
    expect(source).toContain('if (user && !isAuthRoute) {')
  })

  it('excludes marketing/ (not bare "marketing") from the matcher, so /marketing-document still runs middleware', () => {
    const source = middlewareSource()
    expect(source).toContain("'/((?!_next/static|_next/image|favicon.ico|marketing/|api).*)'")
    // a bare `marketing` (no trailing slash) would ALSO have excluded
    // /marketing-document by prefix -- pin the slash so this can't regress.
    expect(source).not.toContain('favicon.ico|marketing|api')
  })

  it('never changed the CSP directives (out of scope for this task)', () => {
    const source = middlewareSource()
    expect(source).toContain("style-src 'self' 'unsafe-inline'")
    expect(source).not.toContain("'unsafe-inline'\"\n    `script-src")
    expect(source).toContain(
      "`script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`",
    )
  })
})
