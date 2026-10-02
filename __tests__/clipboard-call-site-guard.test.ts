import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

// ─────────────────────────────────────────────────────────────────────────
// Clipboard call-site drift guard.
//
// WHY THIS EXISTS. `navigator.clipboard` is `undefined` on non-secure
// origins and `writeText` rejects (or, with no feature detect, throws
// synchronously) when the document is unfocused or permission is refused.
// Twenty-one call sites across 18 files under app/ + components/ accessed
// it directly; ten of them failed silently or lied about success. This
// guard makes "no direct navigator.clipboard access under app/ or
// components/" structural rather than a one-off cleanup: every call must go
// through `lib/clipboard/attempt-copy.ts`'s `attemptCopy`, which is the one
// place the three honest outcomes ('copied' | 'unavailable' | 'rejected')
// are produced.
//
// VACUITY WARNING, STATED PLAINLY (label-integrity-funun). A guard like
// this dies quietly if its regex stops matching — an empty offender list
// then means nothing, the same shape as a column named `owner_segment` that
// nothing actually checked. Both the classifier and the walker carry an
// explicit non-vacuity assertion for exactly this reason: the classifier's
// truth table below and the walker's >400-files floor.
//
// NO ALLOWLIST. `lib/clipboard/attempt-copy.ts` lives under lib/, outside
// the scanned dirs (app/, components/), so there is nothing legitimate left
// to exclude. If this guard ever appears to need an allowlist entry, the
// matcher is wrong — fix the matcher, not the list.
// ─────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd()
const SCAN_DIRS = ['app', 'components']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Strip `//` and `/* *\/` comments, preserving line count (newlines kept,
 * comment characters replaced with spaces) and tracking string-literal
 * state so a `//` inside a string (e.g. a URL) is never mistaken for a
 * comment start. String CONTENTS are left untouched — only comments are
 * blanked — because the quoted-property check below
 * (`'clipboard' in navigator`) must still see the quotes it matches on.
 * `__tests__/rls-helper-callsites.test.ts` documents the cost of skipping
 * this step: a word inside a prose comment inverted an entire audit.
 */
function stripComments(src: string): string {
  let out = ''
  let i = 0
  let inLineComment = false
  let inBlockComment = false
  let inString: string | null = null

  while (i < src.length) {
    const ch = src[i]
    const next = src[i + 1]

    if (inLineComment) {
      out += ch === '\n' ? '\n' : ' '
      if (ch === '\n') inLineComment = false
      i++
      continue
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        out += '  '
        i += 2
        continue
      }
      out += ch === '\n' ? '\n' : ' '
      i++
      continue
    }

    if (inString) {
      out += ch
      if (ch === '\\' && next !== undefined) {
        out += next
        i += 2
        continue
      }
      if (ch === inString) inString = null
      i++
      continue
    }

    if (ch === '/' && next === '/') {
      inLineComment = true
      out += '  '
      i += 2
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      out += '  '
      i += 2
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch
      out += ch
      i++
      continue
    }
    out += ch
    i++
  }

  return out
}

// Pattern 1: a property access of a `clipboard` member reached through a
// dot — `navigator.clipboard`, `navigator?.clipboard`, and
// `(navigator as Navigator & {...}).clipboard` all end in `.clipboard` or
// `?.clipboard`, so one pattern covers plain access, optional chaining, and
// a parenthesised cast alike. The trailing `\b` is what excludes
// `event.clipboardData` without needing an exception for it.
const DOT_ACCESS_PATTERN = /(?:\?\.|\.)\s*clipboard\b/

// Pattern 2: the quoted-property feature check, e.g.
// `'clipboard' in navigator`.
const QUOTED_IN_PATTERN = /['"]clipboard['"]\s*in\b/

/** Returns 1-indexed line numbers where either pattern matches, after
 *  comments are stripped. */
function findOffenses(source: string): number[] {
  const stripped = stripComments(source)
  const lines = stripped.split('\n')
  const offenses: number[] = []
  lines.forEach((line, idx) => {
    if (DOT_ACCESS_PATTERN.test(line) || QUOTED_IN_PATTERN.test(line)) {
      offenses.push(idx + 1)
    }
  })
  return offenses
}

describe('clipboard call-site guard', () => {
  describe('classifier truth table', () => {
    it('flags navigator.clipboard.writeText(x)', () => {
      expect(findOffenses('navigator.clipboard.writeText(x)')).toEqual([1])
    })

    it('flags navigator.clipboard?.writeText(x)', () => {
      expect(findOffenses('navigator.clipboard?.writeText(x)')).toEqual([1])
    })

    it('flags a parenthesised cast property access', () => {
      expect(
        findOffenses('(navigator as Navigator & { clipboard?: unknown }).clipboard')
      ).toEqual([1])
    })

    it("flags the quoted-property 'clipboard' in navigator feature check", () => {
      expect(findOffenses(`'clipboard' in navigator`)).toEqual([1])
    })

    it('does NOT flag event.clipboardData.getData access (LyricsPad.tsx paste handler)', () => {
      expect(findOffenses(`const text = event.clipboardData.getData('text')`)).toEqual([])
    })

    it('does NOT flag a capital-C user-facing string (QuickInviteModal unavailable copy)', () => {
      expect(
        findOffenses(
          `setCopyError('Clipboard unavailable — select the link above and copy it manually')`
        )
      ).toEqual([])
    })

    it('strips comments first, so a comment mentioning clipboard is not flagged', () => {
      expect(
        findOffenses('// Web-Share-first, clipboard-fallback share affordance.')
      ).toEqual([])
    })

    it('does not flag a local variable named clipboard being read after resolution', () => {
      // CopyLyricMenu.tsx's post-resolution shape: `clipboard` here is a
      // local const, not a fresh navigator.clipboard access, and must not
      // be flagged as a second offender on top of the line that resolved it.
      expect(findOffenses('if (!clipboard?.writeText) { return }')).toEqual([])
      expect(findOffenses('await clipboard.writeText(text)')).toEqual([])
    })
  })

  describe('non-vacuity', () => {
    it('the walker finds more than 400 files under app/ and components/', () => {
      const files = SCAN_DIRS.flatMap(d => walk(path.join(ROOT, d)))
      expect(files.length).toBeGreaterThan(400)
    })
  })

  describe('no direct navigator.clipboard access survives under app/ or components/', () => {
    // The whole allowlist. If this guard ever needs an entry, the matcher
    // is wrong, not the code — see header.
    const ALLOWLIST: string[] = []

    it('offender list is empty', () => {
      const files = SCAN_DIRS.flatMap(d => walk(path.join(ROOT, d)))
      const offenders: string[] = []
      for (const file of files) {
        const rel = path.relative(ROOT, file)
        if (ALLOWLIST.includes(rel)) continue
        const raw = readFileSync(file, 'utf8')
        for (const lineNo of findOffenses(raw)) {
          offenders.push(`${rel}:${lineNo}`)
        }
      }
      expect(offenders).toEqual([])
    })
  })
})
