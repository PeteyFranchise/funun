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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replaces every occurrence of the nonce placeholder with the real,
 * per-request CSP nonce, by literal string replacement only (no parse, no
 * reserialize). Fails closed and loudly on every anomaly the plan calls
 * out: an absent nonce, a replacement count that does not match the
 * manifest-recorded expectation, a placeholder surviving the replace, or a
 * `<script` tag that does not carry the nonce afterward.
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

  const scriptTagCount = (replaced.match(/<script/g) ?? []).length
  const noncedScriptTagRe = new RegExp(`<script nonce="${escapeRegExp(nonce)}"`, 'g')
  const noncedScriptTagCount = (replaced.match(noncedScriptTagRe) ?? []).length
  if (scriptTagCount !== noncedScriptTagCount) {
    throw new Error(
      `injectNonce: ${scriptTagCount} <script> tag(s) present but only ${noncedScriptTagCount} ` +
        'carry the nonce -- an un-nonced inline script is blocked by the CSP anyway, but this ' +
        'must fail loudly rather than ship a document that silently breaks under it',
    )
  }

  return { html: replaced, replacedCount: placeholderCount }
}
