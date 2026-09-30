#!/usr/bin/env node
// ─── Marketing artifact builder — anchored string replacement only ─────────
// Quick task 260930-ibp, Task 2. Reads the frozen bench source
// (private/bench/marketing.html, gitignored) and emits the committed,
// regenerable artifact at assets/marketing/landing.html. This script IS the
// deliverable as much as the artifact is: the bench page changes constantly,
// and a hand-edited artifact cannot be regenerated.
//
// Hard rule: no HTML parser, no DOM, no reserializer. A serializer
// introduces drift on its own (attribute reordering, quote-style changes,
// self-closing-tag normalization) that has nothing to do with the actual
// edit being made. Every removal here is anchored on both ends against the
// exact, verified text of the frozen source, asserts it matches exactly
// once (or an exact expected count for repeated patterns), and throws
// rather than guessing when that assertion fails.
//
// CLI:
//   npx tsx scripts/build-marketing-artifact.ts
//     Re-verifies the frozen source (refuses to run against any other
//     revision), reads assets/marketing/manifest.json for the asset
//     allowlist, sanitizes, writes assets/marketing/landing.html, and
//     updates manifest.json with the recorded nonce-placeholder count.
//     Requires private/bench/marketing.html on disk (gitignored) — this is
//     a local/one-time regeneration step, never a CI step: CI never has
//     the bench source, only the committed output.

import { readFileSync, writeFileSync } from 'node:fs'
import {
  FROZEN_SHA256,
  FROZEN_LINE_COUNT,
  BENCH_SOURCE_PATH,
  MANIFEST_PATH,
  verifyFrozenSource,
  type MarketingManifest,
} from './marketing-assets'

export const NONCE_PLACEHOLDER = '__CSP_NONCE_PLACEHOLDER__'
export const ARTIFACT_OUTPUT_PATH = 'assets/marketing/landing.html'

export const PRODUCTION_TITLE = 'Funūn — Make the song. Keep the record.'
export const PRODUCTION_CANONICAL_URL = 'https://www.funun.studio/'
export const PRODUCTION_DESCRIPTION =
  'Funūn is where songwriters and producers write together, keep a Sound Vault of ' +
  'masters and rights documents, and track copyright, PRO and SoundExchange registration ' +
  '— all in one place.'

// ─── primitives ─────────────────────────────────────────────────────────
// Each of these is independently unit-tested against small fixtures. The
// pipeline below (`sanitize`) composes them against literal text lifted
// from the real frozen source; the primitives themselves know nothing
// about marketing.html.

export function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0
  let count = 0
  let idx = 0
  for (;;) {
    idx = haystack.indexOf(needle, idx)
    if (idx === -1) break
    count += 1
    idx += needle.length
  }
  return count
}

export function assertOccurrences(
  haystack: string,
  needle: string,
  expected: number,
  label: string,
): void {
  const actual = countOccurrences(haystack, needle)
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${expected} occurrence(s) of anchor, found ${actual}. ` +
        'An ambiguous or missing removal target is a hard error, not a guess.',
    )
  }
}

/**
 * Removes the byte range from the start of `startNeedle` through the end of
 * the first `endNeedle` found after it, INCLUSIVE of both anchors.
 *
 * Fails closed:
 *  - `startNeedle` must occur exactly once in `haystack` (a block that
 *    "appears twice" cannot be disambiguated, so this throws rather than
 *    removing an arbitrary one).
 *  - `endNeedle` must be found somewhere after `startNeedle` (an absent end
 *    marker throws rather than silently removing to end-of-file).
 */
export function removeBetween(
  haystack: string,
  startNeedle: string,
  endNeedle: string,
  label: string,
): string {
  assertOccurrences(haystack, startNeedle, 1, `${label} (start anchor)`)
  const startIdx = haystack.indexOf(startNeedle)
  const endIdx = haystack.indexOf(endNeedle, startIdx)
  if (endIdx === -1) {
    throw new Error(`${label}: end anchor not found after start anchor`)
  }
  const removeEnd = endIdx + endNeedle.length
  return haystack.slice(0, startIdx) + haystack.slice(removeEnd)
}

/**
 * Removes a single literal occurrence of `needle`, asserting it appears
 * exactly once first. Used for tokens expected to be unique — e.g. one
 * attribute on one element.
 */
export function removeExactly(haystack: string, needle: string, label: string): string {
  assertOccurrences(haystack, needle, 1, label)
  const idx = haystack.indexOf(needle)
  return haystack.slice(0, idx) + haystack.slice(idx + needle.length)
}

/** Replaces a single literal occurrence of `needle`, asserting uniqueness first. */
export function replaceExactly(
  haystack: string,
  needle: string,
  replacement: string,
  label: string,
): string {
  assertOccurrences(haystack, needle, 1, label)
  const idx = haystack.indexOf(needle)
  return haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length)
}

/**
 * Removes every match of `regex` (which must carry the global flag),
 * asserting the match count equals `expectedCount` first. A silent drift in
 * count (one new flag note added, one accidentally duplicated) must fail
 * loudly rather than remove "however many there happen to be".
 */
export function removeAllMatches(
  haystack: string,
  regex: RegExp,
  expectedCount: number,
  label: string,
): string {
  if (!regex.flags.includes('g')) {
    throw new Error(`${label}: regex passed to removeAllMatches must carry the global flag`)
  }
  const matches = haystack.match(regex) ?? []
  if (matches.length !== expectedCount) {
    throw new Error(`${label}: expected ${expectedCount} match(es), found ${matches.length}`)
  }
  return haystack.replace(regex, '')
}

// ─── asset path rewrite (finding F1) ───────────────────────────────────
// Every asset reference in the frozen source is relative (`img/…`,
// `fonts/…`). The document is served at `/`, but the files live under
// `public/marketing/`, so every reference must be prefixed with
// `/marketing/` or every image and font 404s. Absolute paths (`/signin`)
// and `#anchor`s are untouched by construction: the pattern only matches
// bare `img/…` / `fonts/…` tokens, never a leading `/`.
const ASSET_PATH_RE =
  /(?<![\w/])(img\/[A-Za-z0-9_./-]+\.(?:jpe?g|png|svg|webp)|fonts\/[A-Za-z0-9_.-]+\.woff2?)/g

// The Selects track list builds its art path from three JS string
// fragments (`'img/art/'+slug+'.jpg'`), so the full path never exists as a
// contiguous literal in the source for 3 of the 4 SEL slugs — only this
// bare directory-prefix fragment does, and it must be rewritten too.
const SEL_ART_CONCAT_NEEDLE = '<img src="img/art/'
const SEL_ART_CONCAT_REPLACEMENT = '<img src="/marketing/img/art/'

export type AssetRewriteResult = { html: string; paths: string[] }

export function rewriteAssetPaths(html: string): AssetRewriteResult {
  const paths = new Set<string>()
  let result = html.replace(ASSET_PATH_RE, (match) => {
    const rewritten = `/marketing/${match}`
    paths.add(rewritten)
    return rewritten
  })

  const concatCount = countOccurrences(result, SEL_ART_CONCAT_NEEDLE)
  if (concatCount > 0) {
    if (concatCount !== 1) {
      throw new Error(
        `rewriteAssetPaths: expected at most 1 SEL-array img/art/ concatenation site, ` +
          `found ${concatCount}`,
      )
    }
    result = result.replace(SEL_ART_CONCAT_NEEDLE, SEL_ART_CONCAT_REPLACEMENT)
    // The concatenation completes at runtime as /marketing/img/art/<slug>.jpg;
    // the caller validates the full set of SEL slugs against the manifest
    // separately, since this call site only sees the directory prefix.
  }

  return { html: result, paths: Array.from(paths).sort() }
}

// ─── nonce placeholder (finding: exactly 1 script survives, not 3) ─────

export type NonceInjectionResult = { html: string; count: number }

export function injectNoncePlaceholder(html: string): NonceInjectionResult {
  const openTagRe = /<script(\s[^>]*)?>/g
  const matches = html.match(openTagRe) ?? []
  const count = matches.length
  const result = html.replace(openTagRe, (tag) => tag.replace(/^<script/, `<script nonce="${NONCE_PLACEHOLDER}"`))
  return { html: result, count }
}

// ─── the sanitize pipeline ──────────────────────────────────────────────
// Composes the primitives above against literal text verified (by direct
// inspection, file:line cited in the plan) to exist exactly once each in
// the frozen source. Every anchor is the EXACT text from
// private/bench/marketing.html as of the frozen sha256 — if the source
// drifts, the corresponding assertOccurrences call throws immediately
// rather than silently mis-editing a different revision.

const PLACEHOLDER_MARKER_COMMENT_START = '/* PLACEHOLDER MARKER'
const PLACEHOLDER_MARKER_COMMENT_END =
  '.planning/todos/pending/2026-09-24-marketing-page-ideas.md */'

const SHIP_GATE_BLOCK_START = '/* Ship gate: body[data-ship] hides every bench-only element'
const SHIP_GATE_BLOCK_END =
  '.phnote{display:inline-block;margin-top:16px;font-size:9px;letter-spacing:.14em;\n' +
  '  text-transform:uppercase;color:rgba(199,203,247,.34);border:1px dashed rgba(199,203,247,.22);\n' +
  '  border-radius:999px;padding:3px 10px;background:rgba(10,10,15,.6)}'

const DEV_GUARD_SCRIPT_START = '<script>\n// ─── Wrong-origin guard'
const SCRIPT_CLOSE = '</script>'

const BENCH_DIV_START = '<div class="bench">'
const DIV_CLOSE = '</div>'

const PH_ART_COMMENT_START = '/* announcement slides 2+'
const PH_ART_COMMENT_END = '.ph-art marks that. */'

const PH_ART_RULE =
  '.ph-art{display:inline-block;margin:18px 0 0;font-size:9px;letter-spacing:.14em;\n' +
  '  text-transform:uppercase;color:rgba(199,203,247,.34);border:1px dashed rgba(199,203,247,.22);\n' +
  '  border-radius:999px;padding:3px 10px;background:rgba(10,10,15,.6)}'

// The one .phnote paragraph and the two identical .ph-art paragraphs
// (Task 2 action: "the two .ph-art paragraphs and the one .phnote
// paragraph"). Matched separately from the .flag paragraphs above — these
// use different class names and different (shorter, single-line) markup.
const PHNOTE_PARAGRAPH =
  '<p class="phnote">Placeholder &middot; Midjourney facade plate pending</p>\n'
const PH_ART_PARAGRAPH_RE = /\s*<p class="ph-art">Placeholder &middot; slide art pending<\/p>\n?/g
const PH_ART_PARAGRAPH_COUNT = 2

// All 5 `.flag` / `.flag reveal` paragraphs at once. A bare `class="flag"`
// literal check would miss the footer note's `class="flag reveal"` — this
// regex matches the class prefix, not the exact attribute value, so it
// catches all five.
const FLAG_PARAGRAPH_RE = /\s*<p class="flag[^"]*">[\s\S]*?<\/p>\n?/g
const FLAG_PARAGRAPH_COUNT = 5

// NOTE: deliberately ends at `-->`, not the trailing "\n    " indentation —
// the immediately-following `.flag` paragraph is removed by
// FLAG_PARAGRAPH_RE, whose leading `\s*` already claims that whitespace.
// Including it here too would make this anchor's text disappear once the
// flag-paragraph pass runs first, since the two would double-claim the same
// whitespace region.
const DIFFERENTIATORS_OWNER_COMMENT =
  '<!-- OWNER DECISION 2026-09-27: these panels take real product shots, not\n' +
  '         illustration. The Midjourney briefs move to dedicated hero banner slides\n' +
  '         (top-of-page), swappable from the marketing console once that is built. -->'

const REVERT_NOTE_START = '// REVERT NOTE (owner 2026-09-30):'
const REVERT_NOTE_END =
  '// .planning/todos/pending/2026-09-29-paid-tier-interest-capture-before-stripe.md\n'

const VOICES_PLACEHOLDER_COMMENT_START =
  '  // PLACEHOLDER, owner-approved 2026-09-27. Real testimonials are not gathered yet'
const VOICES_PLACEHOLDER_COMMENT_END = '  // back. Swap all three before this page goes public.\n'

const DIALOG_START = '<dialog class="authdlg" id="authdlg" aria-labelledby="authTitle">'
const DIALOG_END = '</dialog>\n'

const AUTHDLG_CSS_START =
  '.authdlg{width:100vw;height:100dvh;max-width:none;max-height:none;border:0;padding:0;'
const AUTHDLG_CSS_END = '.authdlg::backdrop{background:rgba(4,4,8,.74);backdrop-filter:blur(10px)}'

// Includes the comment immediately preceding the IIFE — it describes the
// dialog's progressive-enhancement upgrade, which no longer exists once the
// dialog and this IIFE are gone, so leaving it behind would be a stale,
// misleading comment rather than a preserved design-rationale one.
const AUTH_IIFE_START =
  '// ── sign-in dialog ───────────────────────────────\n' +
  '// Progressive enhancement: the header link points at /signin and this upgrades it\n' +
  '// to a modal. No JS, no modal, still a working sign-in.\n' +
  '(function auth(){'
const AUTH_IIFE_END = '  })();\n})();'

const DATA_AUTHOPEN_ATTR = ' data-authopen'

const SHIPEXIT_BUTTON =
  '<button class="shipexit" id="shipOff">Exit ship preview &mdash; bench notes hidden</button>\n'

const SHIP_TOGGLE_SCRIPT_START =
  '<script>\n// Ship preview: prove the placeholder labels and bench notes do not ship.'

// The three bench-only type-switcher fonts. Their `@font-face` rules must
// go so no rule points at a file that was never copied to public/.
const NON_PRODUCTION_FONT_FACE_RE =
  /@font-face\{font-family:'(?:Lobster|Monoton|Yellowtail)'[^}]*\}\n?/g
const NON_PRODUCTION_FONT_FACE_COUNT = 3

// ─── F2: onerror="this.remove()" is blocked by the app CSP ────────────────
// The two inline event-handler attributes at (source) :1411 and :2035 are
// refused: script-src carries a nonce and 'strict-dynamic' but no
// 'unsafe-inline', and a nonce never covers inline event attributes. Widening
// the CSP is not an option (checkpoint decision 3, option b). Both are
// removed here and replaced by a single capture-phase listener injected into
// the surviving script -- see IMAGE_ERROR_LISTENER below.
const ONERROR_ATTR_RE = / onerror="this\.remove\(\)"/g
const ONERROR_ATTR_COUNT = 2

// Anchored on the ASSET_V declaration: it is the first statement in the
// surviving script (a deliberate ordering constraint -- see the comment
// immediately above it in the source, "MUST be declared before any renderer
// uses it"), so injecting the listener directly after it guarantees the
// listener is registered before buildVoices()/buildDiffs() insert the first
// <img> synchronously later in the same script.
const ASSET_V_DECLARATION = "const ASSET_V='202609271636';"

// The comment directly above the first onerror site names the mechanism
// being removed; left as-is it would describe code that no longer exists.
// This is the one prose edit this sanitizer makes -- everywhere else,
// comments are either preserved verbatim or stripped as a whole block.
const VOICES_FALLBACK_COMMENT_ORIGINAL =
  '// is missing or 404s, onerror removes the <img> and the initials show through,'
const VOICES_FALLBACK_COMMENT_UPDATED =
  '// is missing or 404s, the shared image-error listener above removes the <img> ' +
  'and the initials show through,'

// Registered ONCE, on `document`, in the CAPTURE phase. This is not a
// stylistic choice: the DOM 'error' event does not bubble, so a normal
// (bubble-phase) listener on document would never see it. Capture-phase
// listeners fire top-down on every matching event regardless of bubbling,
// so a single registration here also catches <img> elements that do not
// exist yet -- the ones buildVoices() inserts once via `grid.innerHTML` and
// the ones buildDiffs()'s show() re-inserts via `panel.innerHTML` on every
// tab switch. No per-render re-registration is needed.
export const IMAGE_ERROR_LISTENER =
  '\n' +
  '// F2: the two inline onerror attributes removed above are blocked by the app CSP\n' +
  '// (the nonce on the surviving script tag does not cover inline event-handler attributes).\n' +
  "// Capture phase, because the 'error' event does not bubble -- a bubble-phase\n" +
  '// listener on document would never see it. One registration here covers\n' +
  '// both occurrences below AND every <img> the two renderers insert later via\n' +
  '// innerHTML, so it never needs to run again after the initial render.\n' +
  "document.addEventListener('error', function(e){\n" +
  "  if (e.target instanceof HTMLImageElement) e.target.remove();\n" +
  '}, true);'

const TITLE_TAG = '<title>Funūn bench 02 — marketing page</title>'

function buildHeadMetadata(): string {
  // No favicon/icon file exists anywhere in the repo and no OG image has
  // been chosen (finding F5) — omit <link rel="icon"> and og:image /
  // twitter:image rather than pointing them at files that do not exist.
  // Surfaced as an explicit checkpoint decision (Task 4), not silently
  // decided here.
  return [
    `<title>${PRODUCTION_TITLE}</title>`,
    `<meta name="description" content="${PRODUCTION_DESCRIPTION}">`,
    `<link rel="canonical" href="${PRODUCTION_CANONICAL_URL}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${PRODUCTION_TITLE}">`,
    `<meta property="og:description" content="${PRODUCTION_DESCRIPTION}">`,
    `<meta property="og:url" content="${PRODUCTION_CANONICAL_URL}">`,
    '<meta name="twitter:card" content="summary">',
    `<meta name="twitter:title" content="${PRODUCTION_TITLE}">`,
    `<meta name="twitter:description" content="${PRODUCTION_DESCRIPTION}">`,
  ].join('\n')
}

export type SanitizeResult = {
  html: string
  nonceScriptCount: number
  rewrittenAssetPaths: string[]
}

/**
 * The full sanitization pipeline. Pure function: given the frozen source
 * text, returns the sanitized artifact text plus the facts the caller
 * needs to validate (nonce count, rewritten asset paths) and to write into
 * the manifest. Throws on any anchor mismatch — see the primitives above.
 */
export function sanitize(sourceHtml: string): SanitizeResult {
  let html = sourceHtml

  html = removeBetween(
    html,
    PLACEHOLDER_MARKER_COMMENT_START,
    PLACEHOLDER_MARKER_COMMENT_END,
    'placeholder-marker comment (.planning/ path)',
  )
  html = removeBetween(html, SHIP_GATE_BLOCK_START, SHIP_GATE_BLOCK_END, 'ship-gate CSS block')
  html = removeBetween(html, DEV_GUARD_SCRIPT_START, SCRIPT_CLOSE, 'wrong-origin dev-guard script')
  html = removeBetween(html, BENCH_DIV_START, DIV_CLOSE, 'bench toolbar div')
  html = removeBetween(html, PH_ART_COMMENT_START, PH_ART_COMMENT_END, 'ph-art explanatory comment')
  html = removeExactly(html, PH_ART_RULE, 'ph-art CSS rule')
  html = removeExactly(html, PHNOTE_PARAGRAPH, '.phnote paragraph')
  html = removeAllMatches(html, PH_ART_PARAGRAPH_RE, PH_ART_PARAGRAPH_COUNT, '.ph-art paragraphs')
  html = removeAllMatches(html, FLAG_PARAGRAPH_RE, FLAG_PARAGRAPH_COUNT, '.flag paragraphs')
  html = removeExactly(html, DIFFERENTIATORS_OWNER_COMMENT, 'differentiators OWNER DECISION comment')
  html = removeBetween(html, REVERT_NOTE_START, REVERT_NOTE_END, 'pricing REVERT NOTE comment')
  html = removeBetween(
    html,
    VOICES_PLACEHOLDER_COMMENT_START,
    VOICES_PLACEHOLDER_COMMENT_END,
    'voices placeholder owner-approved comment',
  )
  html = removeBetween(html, DIALOG_START, DIALOG_END, 'sign-in dialog element')
  html = removeBetween(html, AUTHDLG_CSS_START, AUTHDLG_CSS_END, 'authdlg CSS rules')
  html = removeBetween(html, AUTH_IIFE_START, AUTH_IIFE_END, 'sign-in IIFE (incl. sparks helper)')
  html = removeExactly(html, DATA_AUTHOPEN_ATTR, 'data-authopen attribute on nav anchor')
  html = removeExactly(html, SHIPEXIT_BUTTON, 'shipexit exit button')
  html = removeBetween(html, SHIP_TOGGLE_SCRIPT_START, SCRIPT_CLOSE, 'ship-preview toggle script')
  html = removeAllMatches(
    html,
    NON_PRODUCTION_FONT_FACE_RE,
    NON_PRODUCTION_FONT_FACE_COUNT,
    'bench-only @font-face rules (Lobster/Monoton/Yellowtail)',
  )
  html = removeAllMatches(
    html,
    ONERROR_ATTR_RE,
    ONERROR_ATTR_COUNT,
    'inline onerror="this.remove()" attributes (F2 -- replaced by capture-phase listener)',
  )
  html = replaceExactly(
    html,
    VOICES_FALLBACK_COMMENT_ORIGINAL,
    VOICES_FALLBACK_COMMENT_UPDATED,
    'voices-card fallback comment (describes the mechanism just removed)',
  )
  html = replaceExactly(
    html,
    ASSET_V_DECLARATION,
    ASSET_V_DECLARATION + IMAGE_ERROR_LISTENER,
    'image-error capture-phase listener injection point',
  )

  const { html: rewrittenHtml, paths } = rewriteAssetPaths(html)
  html = rewrittenHtml

  html = replaceExactly(html, TITLE_TAG, buildHeadMetadata(), 'head metadata')

  const { html: noncedHtml, count: nonceScriptCount } = injectNoncePlaceholder(html)
  html = noncedHtml
  if (nonceScriptCount <= 0) {
    throw new Error('nonce injection: expected at least one surviving <script> tag, found 0')
  }
  const scriptTagCount = countOccurrences(html, '<script')
  const noncedScriptTagCount = countOccurrences(html, `<script nonce="${NONCE_PLACEHOLDER}"`)
  if (scriptTagCount !== noncedScriptTagCount) {
    throw new Error(
      `nonce injection: ${scriptTagCount} <script tag(s) but only ${noncedScriptTagCount} carry the placeholder`,
    )
  }

  return { html, nonceScriptCount, rewrittenAssetPaths: paths }
}

// ─── CLI ────────────────────────────────────────────────────────────────

function fail(message: string): never {
  // eslint-disable-next-line no-console
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

function main(): void {
  const source = readFileSync(BENCH_SOURCE_PATH, 'utf8')
  const check = verifyFrozenSource(source)
  if (!check.matches) {
    fail(
      `frozen source mismatch — sha256=${check.sha256} lines=${check.lineCount}, expected ` +
        `sha256=${FROZEN_SHA256} lines=${FROZEN_LINE_COUNT}. This baseline has already been ` +
        'invalidated twice by post-freeze edits — do not adapt, do not proceed.',
    )
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as MarketingManifest
  if (manifest.sourceSha256 !== FROZEN_SHA256) {
    fail('manifest sourceSha256 does not match the frozen hash — run Task 1 first')
  }

  let result: SanitizeResult
  try {
    result = sanitize(source)
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err))
  }

  const manifestAssets = new Set(manifest.assets)
  const unknownPaths = result.rewrittenAssetPaths.filter((p) => !manifestAssets.has(p))
  if (unknownPaths.length > 0) {
    fail(
      `sanitized artifact references path(s) not present in ${MANIFEST_PATH}: ` +
        unknownPaths.join(', '),
    )
  }

  writeFileSync(ARTIFACT_OUTPUT_PATH, result.html)

  const updatedManifest: MarketingManifest = {
    ...manifest,
    nonceScriptCount: result.nonceScriptCount,
  }
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(updatedManifest, null, 2)}\n`)

  // eslint-disable-next-line no-console
  console.log(
    `wrote ${ARTIFACT_OUTPUT_PATH} (${result.html.length} bytes), ` +
      `nonceScriptCount=${result.nonceScriptCount}, ` +
      `${result.rewrittenAssetPaths.length} distinct rewritten asset path(s)`,
  )
}

if (require.main === module) {
  main()
}
