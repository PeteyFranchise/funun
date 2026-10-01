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

export const PRODUCTION_TITLE = 'Funūn · Make the song. Keep the record.'
export const PRODUCTION_CANONICAL_URL = 'https://www.funun.studio/'
export const PRODUCTION_DESCRIPTION =
  'Funūn is where songwriters and producers write together, keep a Sound Vault of ' +
  'masters and rights documents, and track copyright, PRO and SoundExchange registration' +
  ', all in one place.'

// ─── rich link preview + favicon (quick task 261001-rlp) ───────────────
// The card image and icon files below are final, committed assets (see
// scripts/brand/generate-icons.mjs for the icons; og.jpg is hand-authored
// and cannot be reproduced headlessly). These constants are the single
// source for every head reference to them, exported so the tests import
// the canonical values instead of retyping the paths as string literals.
export const OG_IMAGE_PATH = '/marketing/og.jpg'
export const OG_IMAGE_WIDTH = '1200'
export const OG_IMAGE_HEIGHT = '630'
export const OG_IMAGE_ALT =
  'Funūn. For Artists, Producers, Co-Writers and their teams. Make the song. Keep the record.'
export const FAVICON_PATH = '/favicon.ico'
export const APPLE_TOUCH_ICON_PATH = '/marketing/icon-180.png'
export const TWITTER_CARD_TYPE = 'summary_large_image'

/**
 * Joins a root-relative path onto the production canonical URL. Remote link
 * scrapers (Facebook, iMessage, Slack, X) do not reliably resolve a relative
 * og:image/twitter:image URL against the page URL -- a relative value is the
 * single most common way a card silently renders blank -- so the card image
 * needs an absolute URL. `new URL()` performs the join structurally, so the
 * host is written exactly once (PRODUCTION_CANONICAL_URL) and the result
 * cannot contain a doubled slash the way naive string concatenation onto a
 * canonical that already ends in "/" would.
 */
export function absoluteSiteUrl(path: string): string {
  return new URL(path, PRODUCTION_CANONICAL_URL).href
}

export const OG_IMAGE_URL = absoluteSiteUrl(OG_IMAGE_PATH)

// The set Task 2's on-disk resolution test walks, in a stable order.
export const HEAD_LOCAL_ASSET_PATHS: readonly string[] = [
  OG_IMAGE_PATH,
  FAVICON_PATH,
  APPLE_TOUCH_ICON_PATH,
]

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

// ─── comment stripping (quick task 261001-cmt) ─────────────────────────
// A general-purpose comment tokenizer for the three comment syntaxes this
// document uses: HTML <!-- -->, CSS block comments, and JS comments (both
// // and block form). It exists because one-off anchored strips for
// one-off comments were multiplying in sanitize() -- seven of them -- and
// every new note written into the bench failed the build until someone
// added another. This tokenizer is confined to exactly those three comment
// syntaxes and reads no other grammar: it is not a parser, and it
// deliberately does not understand a comment-looking sequence inside an
// inline style="" attribute, inside <svg><desc>, or inside a non-JS
// <script type="text/template"> body -- a script carrying such a type is
// refused outright (D-08) rather than fed to the JS stripper and
// mis-handled. Per label-integrity-funun: the function names below
// (stripHtmlComments / stripCssComments / stripJsComments /
// stripHtmlCssJsComments) describe exactly that shape. Neither this
// comment nor the function names claim "no comment remains" -- that is not
// what is checked, and it would be false for the syntaxes above.
//
// Whitespace policy (D-03): delete the comment span and nothing else.
//   - a JS line comment ends before its trailing newline; the newline
//     survives (ASI is never affected by removing a line comment)
//   - a JS block comment that spans a newline collapses to a single
//     newline (a multiline comment is itself a line terminator for ASI);
//     one that does not span a newline collapses to a single space, so
//     adjacent tokens can never merge into one (`a/*x*/b` becomes `a b`,
//     never `ab`)
//   - CSS and HTML comment spans are deleted outright, with nothing put in
//     their place
//
// Comment state is tested before string state. Concretely: once the
// scanner has entered a line- or block-comment state, nothing else is
// checked until that comment's own end condition is met, so no quote
// character inside a comment is ever read as opening a string. This is
// not a stylistic preference -- 56 quote characters live inside comments
// in the real artifact (20 ' + 30 " + 6 backticks in JS comment tails; 15
// ' + 4 " inside CSS comments), and a stripper that checked string state
// first would open a phantom string on "Writer's" and swallow the rest of
// the file.
export type CommentStripCounts = {
  // HTML comment spans removed from markup regions.
  htmlComments: number
  // CSS comment spans removed from <style> bodies.
  cssBlockComments: number
  // JS single-line comment spans removed from <script> bodies. Counts one
  // span per line, so six consecutive single-line comments are six, not
  // one, even though they read as a single paragraph.
  jsLineComments: number
  // JS block comment spans removed from <script> bodies.
  jsBlockComments: number
  // Number of <script>...</script> regions the region split found.
  scriptRegions: number
  // Number of <style>...</style> regions the region split found.
  styleRegions: number
}

const JS_WORD_CHAR_RE = /[A-Za-z0-9_$]/

// A `/` opens a regex literal, rather than meaning division, when the
// previous significant (non-whitespace, non-comment) character is one of
// these -- or when the previous significant token was one of the keywords
// below, or when nothing precedes it at all (start of a code region or of
// a template substitution). Otherwise a `/` is division.
//
// The limit: a `}` is genuinely ambiguous in real JS -- a block-closing `}`
// is followed by a value position (regex-opening), but an object-literal
// or function-expression `}` is followed by an operator position
// (division). This implementation deliberately treats `}` as
// regex-opening, same as the characters below. The real artifact has zero
// sites where this choice matters (F-02); Task 2's exact-count assertion
// on the tokenizer's own output is what would catch it if one ever
// appeared.
const REGEX_PRECEDING_CHARS = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^',
])
const REGEX_PRECEDING_WORDS = new Set([
  'return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'yield', 'await',
  'instanceof',
])

function isRegexOpenPosition(prevSignificant: string, lastWord: string): boolean {
  if (prevSignificant === '') return true
  if (REGEX_PRECEDING_CHARS.has(prevSignificant)) return true
  if (JS_WORD_CHAR_RE.test(prevSignificant)) return REGEX_PRECEDING_WORDS.has(lastWord)
  return false
}

/**
 * Strips `//` and block comments from a single JS source body (the
 * contents of exactly one <script> tag -- this function knows nothing
 * about HTML). A hand-written state machine, not a regex: a regex cannot
 * track string/template/regex nesting, which is exactly what both quote-
 * handling traps below require.
 *
 * States: code (incl. inside a template substitution), single-quote
 * string, double-quote string, template literal (a stack tracks nested
 * `${}` substitutions, since a substitution can itself contain a nested
 * template), regex literal (tracks `[...]` character-class state so a `/`
 * inside a class does not close the regex), line comment, block comment.
 * Backslash escapes the next character inside strings, templates and
 * regexes. Throws on an unterminated comment, string, template or regex
 * (D-08) -- guessing is not this file's contract.
 */
export function stripJsComments(
  js: string,
): { js: string; lineComments: number; blockComments: number } {
  const n = js.length
  let out = ''
  let lineComments = 0
  let blockComments = 0

  type Frame = { kind: 'template' } | { kind: 'subst'; depth: number }
  const stack: Frame[] = []

  type Mode = 'code' | 'sq' | 'dq' | 'regex' | 'lineComment' | 'blockComment'
  let mode: Mode = 'code'

  let prevSignificant = ''
  let lastWord = ''
  let wordBuf = ''
  let regexInClass = false
  let commentStart = -1

  const finalizeWord = (): void => {
    if (wordBuf.length > 0) {
      lastWord = wordBuf
      wordBuf = ''
    }
  }

  let i = 0
  while (i < n) {
    const c = js[i]
    const inTemplate = stack.length > 0 && stack[stack.length - 1].kind === 'template'

    if (inTemplate) {
      if (c === '\\') {
        out += c + (js[i + 1] ?? '')
        i += 2
        continue
      }
      if (c === '`') {
        out += c
        stack.pop()
        prevSignificant = c
        i += 1
        continue
      }
      if (c === '$' && js[i + 1] === '{') {
        out += '${'
        stack.push({ kind: 'subst', depth: 0 })
        prevSignificant = ''
        lastWord = ''
        wordBuf = ''
        i += 2
        continue
      }
      out += c
      i += 1
      continue
    }

    if (mode === 'lineComment') {
      if (c === '\n') {
        mode = 'code'
        lineComments += 1
        continue // do not consume the newline -- it survives (ASI)
      }
      i += 1
      continue
    }

    if (mode === 'blockComment') {
      if (c === '*' && js[i + 1] === '/') {
        const body = js.slice(commentStart, i + 2)
        out += body.includes('\n') ? '\n' : ' '
        blockComments += 1
        mode = 'code'
        i += 2
        continue
      }
      i += 1
      continue
    }

    if (mode === 'sq' || mode === 'dq') {
      const quote = mode === 'sq' ? "'" : '"'
      if (c === '\\') {
        out += c + (js[i + 1] ?? '')
        i += 2
        continue
      }
      if (c === quote) {
        out += c
        prevSignificant = c
        mode = 'code'
        i += 1
        continue
      }
      if (c === '\n') {
        throw new Error('stripJsComments: unterminated string literal (unescaped newline)')
      }
      out += c
      i += 1
      continue
    }

    if (mode === 'regex') {
      if (c === '\\') {
        out += c + (js[i + 1] ?? '')
        i += 2
        continue
      }
      if (c === '\n') {
        throw new Error('stripJsComments: unterminated regex literal (unescaped newline)')
      }
      if (c === '[') {
        regexInClass = true
        out += c
        i += 1
        continue
      }
      if (c === ']') {
        regexInClass = false
        out += c
        i += 1
        continue
      }
      if (c === '/' && !regexInClass) {
        out += c
        prevSignificant = c
        mode = 'code'
        i += 1
        continue
      }
      out += c
      i += 1
      continue
    }

    // mode === 'code' (top-level, or inside a template substitution)
    if (JS_WORD_CHAR_RE.test(c)) {
      wordBuf += c
      prevSignificant = c
      out += c
      i += 1
      continue
    }
    finalizeWord()

    if (c === '/' && js[i + 1] === '/') {
      mode = 'lineComment'
      i += 2
      continue
    }
    if (c === '/' && js[i + 1] === '*') {
      mode = 'blockComment'
      commentStart = i
      i += 2
      continue
    }
    if (c === '/') {
      if (isRegexOpenPosition(prevSignificant, lastWord)) {
        mode = 'regex'
        regexInClass = false
        out += c
        i += 1
        continue
      }
      out += c
      prevSignificant = c
      i += 1
      continue
    }
    if (c === "'") {
      out += c
      mode = 'sq'
      i += 1
      continue
    }
    if (c === '"') {
      out += c
      mode = 'dq'
      i += 1
      continue
    }
    if (c === '`') {
      out += c
      stack.push({ kind: 'template' })
      i += 1
      continue
    }
    if (c === '{' || c === '}') {
      const top = stack.length > 0 ? stack[stack.length - 1] : undefined
      if (top !== undefined && top.kind === 'subst') {
        if (c === '{') {
          top.depth += 1
        } else if (top.depth > 0) {
          top.depth -= 1
        } else {
          stack.pop()
        }
        out += c
        prevSignificant = c
        i += 1
        continue
      }
    }
    if (/\s/.test(c)) {
      out += c
      i += 1
      continue
    }
    out += c
    prevSignificant = c
    i += 1
  }

  if (mode === 'blockComment') {
    throw new Error('stripJsComments: unterminated block comment')
  }
  if (mode === 'sq' || mode === 'dq') {
    throw new Error('stripJsComments: unterminated string literal')
  }
  if (mode === 'regex') {
    throw new Error('stripJsComments: unterminated regex literal')
  }
  if (mode === 'lineComment') {
    // EOF with no trailing newline still closes the comment (D-03's "a
    // comment on the last line with no trailing newline" case).
    lineComments += 1
  }
  if (inTemplateAtEof(stack)) {
    throw new Error('stripJsComments: unterminated template literal')
  }

  return { js: out, lineComments, blockComments }
}

function inTemplateAtEof(stack: ReadonlyArray<{ kind: string }>): boolean {
  return stack.length > 0
}

/**
 * Strips block comments from a single CSS source body (the contents of
 * exactly one <style> tag). States: code, single-quote string,
 * double-quote string, an unquoted url(...) token (CSS's one other
 * comment-opaque region -- a data: URI can legitimately contain `//`),
 * and comment. Same precedence rule as the JS stripper: comment state
 * fully owns the scan once entered, so a quote inside a CSS comment is
 * never read as opening a string.
 */
export function stripCssComments(css: string): { css: string; blockComments: number } {
  const n = css.length
  let out = ''
  let blockComments = 0

  type Mode = 'code' | 'sq' | 'dq' | 'url' | 'comment'
  let mode: Mode = 'code'
  let commentStart = -1

  let i = 0
  while (i < n) {
    const c = css[i]

    if (mode === 'comment') {
      if (c === '*' && css[i + 1] === '/') {
        blockComments += 1
        mode = 'code'
        i += 2
        continue
      }
      i += 1
      continue
    }

    if (mode === 'sq' || mode === 'dq') {
      const quote = mode === 'sq' ? "'" : '"'
      if (c === '\\') {
        out += c + (css[i + 1] ?? '')
        i += 2
        continue
      }
      if (c === quote) {
        out += c
        mode = 'code'
        i += 1
        continue
      }
      if (c === '\n') {
        throw new Error('stripCssComments: unterminated string literal (unescaped newline)')
      }
      out += c
      i += 1
      continue
    }

    if (mode === 'url') {
      if (c === ')') {
        out += c
        mode = 'code'
        i += 1
        continue
      }
      if (c === '\\') {
        out += c + (css[i + 1] ?? '')
        i += 2
        continue
      }
      out += c
      i += 1
      continue
    }

    // mode === 'code'
    if (c === '/' && css[i + 1] === '*') {
      mode = 'comment'
      commentStart = i
      i += 2
      continue
    }
    if (c === "'") {
      out += c
      mode = 'sq'
      i += 1
      continue
    }
    if (c === '"') {
      out += c
      mode = 'dq'
      i += 1
      continue
    }
    if (/url\(/i.test(css.slice(i, i + 4))) {
      out += css.slice(i, i + 4)
      i += 4
      let j = i
      while (j < n && /\s/.test(css[j])) j += 1
      if (css[j] !== "'" && css[j] !== '"') {
        mode = 'url'
      }
      continue
    }
    out += c
    i += 1
  }

  if (mode === 'comment') throw new Error('stripCssComments: unterminated comment')
  if (mode === 'sq' || mode === 'dq') throw new Error('stripCssComments: unterminated string literal')
  if (mode === 'url') throw new Error('stripCssComments: unterminated url() token')

  // commentStart is read above only to compute positions during scanning;
  // nothing in the output depends on the comment body text (CSS/HTML
  // comments are deleted outright per D-03), so no further use is needed.
  void commentStart

  return { css: out, blockComments }
}

/**
 * Strips `<!-- -->` comments from an HTML markup region. Does not parse
 * attributes, elements or any other grammar -- a literal scan for the
 * exact comment delimiters, which is sufficient and correct for markup
 * that has already had its <script>/<style> raw-text regions routed
 * elsewhere by stripHtmlCssJsComments. `<!DOCTYPE html>` does not match
 * `<!--` and is left untouched.
 */
export function stripHtmlComments(markup: string): { markup: string; comments: number } {
  let out = ''
  let comments = 0
  let i = 0
  while (i < markup.length) {
    const start = markup.indexOf('<!--', i)
    if (start === -1) {
      out += markup.slice(i)
      break
    }
    const end = markup.indexOf('-->', start + 4)
    if (end === -1) {
      throw new Error('stripHtmlComments: unterminated HTML comment (no matching close)')
    }
    out += markup.slice(i, start)
    comments += 1
    i = end + 3
  }
  return { markup: out, comments }
}

const SCRIPT_OR_STYLE_OPEN_RE = /<(script|style)(\s[^>]*)?>/gi
const SCRIPT_TYPE_ATTR_RE = /\btype\s*=\s*"([^"]*)"|\btype\s*=\s*'([^']*)'/i
const JS_SCRIPT_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript'])

/**
 * The region split: finds every <script>/<style> region case-insensitively
 * (matching the precedent and rationale at injectNoncePlaceholder, builder
 * :240-247, CodeQL js/bad-tag-filter -- HTML tag names are
 * case-insensitive), routes each body to the JS or CSS stripper, and
 * routes everything else to the HTML stripper. Throws (D-08) on an
 * unclosed <script>/<style>, or on a <script> whose `type` attribute is
 * present and is not module / text/javascript / application/javascript --
 * a template script's body is not JS and must never be fed to the JS
 * stripper.
 */
export function stripHtmlCssJsComments(
  html: string,
): { html: string; counts: CommentStripCounts } {
  const counts: CommentStripCounts = {
    htmlComments: 0,
    cssBlockComments: 0,
    jsLineComments: 0,
    jsBlockComments: 0,
    scriptRegions: 0,
    styleRegions: 0,
  }

  let out = ''
  let cursor = 0
  const lowerHtml = html.toLowerCase()
  SCRIPT_OR_STYLE_OPEN_RE.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = SCRIPT_OR_STYLE_OPEN_RE.exec(html)) !== null) {
    const tagName = match[1].toLowerCase()
    const attrs = match[2] ?? ''
    const openStart = match.index
    const openEnd = match.index + match[0].length

    const before = html.slice(cursor, openStart)
    const strippedBefore = stripHtmlComments(before)
    out += strippedBefore.markup
    counts.htmlComments += strippedBefore.comments

    const closeNeedle = `</${tagName}`
    const closeIdx = lowerHtml.indexOf(closeNeedle, openEnd)
    if (closeIdx === -1) {
      throw new Error(`stripHtmlCssJsComments: unclosed <${tagName}> starting at offset ${openStart}`)
    }
    const closeTagEnd = html.indexOf('>', closeIdx)
    if (closeTagEnd === -1) {
      throw new Error(
        `stripHtmlCssJsComments: malformed closing tag for <${tagName}> starting at offset ${openStart}`,
      )
    }

    const body = html.slice(openEnd, closeIdx)
    const fullOpenTag = html.slice(openStart, openEnd)
    const fullCloseTag = html.slice(closeIdx, closeTagEnd + 1)

    if (tagName === 'script') {
      const typeMatch = attrs.match(SCRIPT_TYPE_ATTR_RE)
      const typeValue = (typeMatch ? typeMatch[1] ?? typeMatch[2] ?? '' : '').trim().toLowerCase()
      if (!JS_SCRIPT_TYPES.has(typeValue)) {
        throw new Error(
          `stripHtmlCssJsComments: <script type="${typeValue}"> is not a JS type and must not ` +
            'be fed to the JS stripper',
        )
      }
      const stripped = stripJsComments(body)
      out += fullOpenTag + stripped.js + fullCloseTag
      counts.jsLineComments += stripped.lineComments
      counts.jsBlockComments += stripped.blockComments
      counts.scriptRegions += 1
    } else {
      const stripped = stripCssComments(body)
      out += fullOpenTag + stripped.css + fullCloseTag
      counts.cssBlockComments += stripped.blockComments
      counts.styleRegions += 1
    }

    cursor = closeTagEnd + 1
    SCRIPT_OR_STYLE_OPEN_RE.lastIndex = cursor
  }

  const tail = html.slice(cursor)
  const strippedTail = stripHtmlComments(tail)
  out += strippedTail.markup
  counts.htmlComments += strippedTail.comments

  return { html: out, counts }
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
  // Case-insensitive on purpose. HTML tag names are case-insensitive, so a
  // lowercase-only pattern silently skips <SCRIPT> / <Script> — and skipping
  // is the dangerous direction here: an un-nonced script that the sanitizer
  // failed to see would be blocked by CSP at runtime, or, worse, a bench
  // script the strip pass also missed would ship. CodeQL js/bad-tag-filter
  // flagged exactly this. Today's frozen source is all lowercase; that is a
  // property of one revision, not a guarantee about the next.
  const openTagRe = /<script(\s[^>]*)?>/gi
  const matches = html.match(openTagRe) ?? []
  const count = matches.length
  const result = html.replace(openTagRe, (tag) =>
    tag.replace(/^<script/i, `<script nonce="${NONCE_PLACEHOLDER}"`)
  )
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

// The owner's rationale for the violet step-badge treatment belongs in the
// bench, but verify-marketing-artifact.ts bans the literal "OWNER DECISION"
// from the shipped artifact (this file ships to a public page). Anchored
// removeBetween, same shape as DIFFERENTIATORS_OWNER_COMMENT above.
const STEP_BADGE_DECISION_COMMENT_START =
  '/* Violet, not grey. OWNER DECISION 2026-09-30: the step labels were being scanned'
const STEP_BADGE_DECISION_COMMENT_END = '   accent. 10.5:1. */\n'

// The owner's rationale for the named-tab carousel control belongs in the
// bench, but verify-marketing-artifact.ts bans the literal "OWNER DECISION"
// from the shipped artifact (this file ships to a public page). Anchored
// removeBetween, same shape as DIFFERENTIATORS_OWNER_COMMENT and
// STEP_BADGE_DECISION_COMMENT_* above — this is the third one-off strip.
const HERO_TABS_DECISION_COMMENT_START =
  '/* Named tabs, not anonymous bars. OWNER DECISION 2026-09-30: three 3px bars'
const HERO_TABS_DECISION_COMMENT_END =
  '   is the correct state attribute for a tab (aria-current was wrong here). */\n'

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

export function buildHeadMetadata(): string {
  // Quick task 261001-rlp: the card image and both icon files now exist on
  // disk (og.jpg at 1200x630; favicon.ico and icon-180.png generated by
  // scripts/brand/generate-icons.mjs) -- the prior "nothing to point at"
  // state this comment used to describe is gone.
  //
  // og:image / twitter:image carry an ABSOLUTE url because remote link
  // scrapers (Facebook, iMessage, Slack, X) do not reliably resolve a
  // relative image url against the page url -- a relative value is the
  // single most common way a card silently renders blank. The host for
  // that absolute url comes from PRODUCTION_CANONICAL_URL through
  // absoluteSiteUrl(), so it is written exactly once in this repo and the
  // join cannot double the slash.
  //
  // The icon hrefs stay root-relative: the browser resolves <link> hrefs
  // against the served document itself, so an absolute url there would buy
  // nothing and would add a second place for the host to drift.
  return [
    `<title>${PRODUCTION_TITLE}</title>`,
    `<meta name="description" content="${PRODUCTION_DESCRIPTION}">`,
    `<link rel="canonical" href="${PRODUCTION_CANONICAL_URL}">`,
    `<link rel="icon" href="${FAVICON_PATH}" sizes="any">`,
    `<link rel="apple-touch-icon" href="${APPLE_TOUCH_ICON_PATH}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${PRODUCTION_TITLE}">`,
    `<meta property="og:description" content="${PRODUCTION_DESCRIPTION}">`,
    `<meta property="og:url" content="${PRODUCTION_CANONICAL_URL}">`,
    `<meta property="og:image" content="${OG_IMAGE_URL}">`,
    `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}">`,
    `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}">`,
    `<meta property="og:image:alt" content="${OG_IMAGE_ALT}">`,
    `<meta name="twitter:card" content="${TWITTER_CARD_TYPE}">`,
    `<meta name="twitter:title" content="${PRODUCTION_TITLE}">`,
    `<meta name="twitter:description" content="${PRODUCTION_DESCRIPTION}">`,
    `<meta name="twitter:image" content="${OG_IMAGE_URL}">`,
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
  html = removeBetween(
    html,
    STEP_BADGE_DECISION_COMMENT_START,
    STEP_BADGE_DECISION_COMMENT_END,
    'step-badge OWNER DECISION comment',
  )
  html = removeBetween(
    html,
    HERO_TABS_DECISION_COMMENT_START,
    HERO_TABS_DECISION_COMMENT_END,
    'hero-tabs OWNER DECISION comment',
  )
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
