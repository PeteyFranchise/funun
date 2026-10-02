// ─── Marketing document nonce injection ─────────────────────────────────
// Quick task 260930-ibp, Task 3. Pure string-replacement logic shared by
// app/marketing-document/route.ts. Deliberately NOT a DOM/HTML parse —
// string replacement only, matching scripts/build-marketing-artifact.ts's
// own hard rule against reserialization drift.
//
// This constant MUST match NONCE_PLACEHOLDER in
// scripts/build-marketing-artifact.ts exactly — that script bakes this
// literal into the committed assets/marketing/landing.html, and this
// module is what turns it into a real per-request CSP nonce at request
// time. The two are not imported from a shared module on purpose: scripts/
// is build tooling invoked via `tsx`, not part of the app's module graph,
// and importing across that boundary would let Next.js's file tracer try
// to pull build-time-only code into the runtime bundle.
export const NONCE_PLACEHOLDER = '__CSP_NONCE_PLACEHOLDER__'

export type NonceInjectionResult = {
  html: string
  replacedCount: number
}

/**
 * Replaces every occurrence of the nonce placeholder with the real,
 * per-request CSP nonce, by literal string replacement only (no parse, no
 * reserialize). Fails closed and loudly on every anomaly the plan calls
 * out: an absent nonce, a replacement count that does not match the
 * manifest-recorded expectation, a placeholder surviving the replace, or a
 * `<script` tag that does not carry the nonce afterward.
 *
 * The final guard matches `<script` case-insensitively (HTML tag names are
 * case-insensitive; a lowercase-only count and a lowercase-only nonced-count
 * were previously both blind to the same uppercase tag, so they agreed with
 * each other while disagreeing with the document -- a guard that fails open
 * by matching luck, not correctness). Both counts come from a single scan
 * so they cannot drift apart from each other again. The nonce VALUE
 * comparison stays case-sensitive on purpose: the nonce is a secret, not a
 * tag name, and a guard must not launder a wrong-case secret as a match.
 */
export function injectNonce(html: string, nonce: string, expectedCount: number): NonceInjectionResult {
  if (!nonce || nonce.trim().length === 0) {
    throw new Error('injectNonce: nonce must be a non-empty string')
  }

  const placeholderCount = html.split(NONCE_PLACEHOLDER).length - 1
  if (placeholderCount !== expectedCount) {
    throw new Error(
      `injectNonce: expected ${expectedCount} placeholder(s), found ${placeholderCount}`,
    )
  }

  const replaced = html.split(NONCE_PLACEHOLDER).join(nonce)

  if (replaced.includes(NONCE_PLACEHOLDER)) {
    throw new Error('injectNonce: a placeholder survived replacement')
  }

  // Declared locally (not module scope): a module-level /g regex carries
  // lastIndex across calls, and injectNonce runs once per request.
  // Lookahead requires the next character after `<script` to be
  // whitespace, `/`, or `>`, so `<scriptfoo>` -- not a script tag -- is not
  // miscounted as one.
  const scriptTagRe = /<script(?=[\s/>])/gi
  let scriptTagCount = 0
  let noncedScriptTagCount = 0
  let match: RegExpExecArray | null
  while ((match = scriptTagRe.exec(replaced)) !== null) {
    scriptTagCount++
    const tagNameEnd = match.index + match[0].length
    if (replaced.startsWith(` nonce="${nonce}"`, tagNameEnd)) {
      noncedScriptTagCount++
    }
  }
  if (scriptTagCount !== noncedScriptTagCount) {
    throw new Error(
      `injectNonce: ${scriptTagCount} <script> tag(s) present but only ${noncedScriptTagCount} ` +
        'carry the nonce -- an un-nonced inline script is blocked by the CSP anyway, but this ' +
        'must fail loudly rather than ship a document that silently breaks under it',
    )
  }

  return { html: replaced, replacedCount: placeholderCount }
}
