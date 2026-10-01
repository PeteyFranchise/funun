import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

// ─────────────────────────────────────────────────────────────────────────
// Palette single-source guard.
//
// WHY THIS EXISTS. The Funun surface palette is defined twice: once as
// Tailwind theme colors (`tailwind.config.ts`) feeding every `bg-card` /
// `border-hair` utility class, and once as CSS custom properties
// (`app/globals.css`) feeding hand-written CSS and inline styles. The two
// files use DIFFERENT names for the same seven shared values (`card2` <->
// `--card-2`, `hair` <-> `--border`, etc.) and have so far only agreed by
// accident of nobody editing one without the other. This guard makes that
// agreement structural: half (a) fails the moment the two files disagree on
// any of the seven shared values; half (b) fails the moment a retired
// literal survives anywhere under app/, components/ or lib/ outside the
// lib/email carve-out.
//
// VACUITY WARNING, STATED PLAINLY. A test like this dies quietly: a parser
// regex that stops matching (say, because someone reformats a file) produces
// an empty record, an empty comparison, and a green test forever -- the same
// shape as a column named `owner_segment` that nothing actually checked.
// Both halves below carry an explicit non-vacuity assertion for exactly this
// reason: half (a) asserts each parser found exactly seven keys, half (b)
// asserts the walker found a realistic number of files.
// ─────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd()

// ─── Half (a): the two palette definitions agree ──────────────────────────

// Token name in tailwind.config.ts <-> var name in app/globals.css. The
// names differ between the two files; a comparison that assumes they match
// is comparing nothing.
const NAME_MAP: Array<{ tw: string; css: string }> = [
  { tw: 'ink', css: '--bg' },
  { tw: 'card', css: '--card' },
  { tw: 'card2', css: '--card-2' },
  { tw: 'lav', css: '--lav' },
  { tw: 'lavdim', css: '--lav-dim' },
  { tw: 'hair', css: '--border' },
  { tw: 'hairstrong', css: '--border-strong' },
]

// Normalise a colour literal so the comparator fails on drift, not on
// formatting. app/globals.css is prettier-formatted (spaced rgba,
// leading-zero alpha); tailwind.config.ts is compact (no spaces, bare-dot
// alpha).
function normalizeColor(raw: string): string {
  let s = raw.trim().toLowerCase()
  s = s.replace(/\s+/g, '')
  // A leading-zero alpha ("0.12") is the same value as a bare-dot alpha
  // (".12"); normalise the former to the latter so the comparator does not
  // fail on formatting alone.
  s = s.replace(/([(,])0(\.\d+)/g, '$1$2')
  return s
}

function parseTailwindColors(src: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { tw } of NAME_MAP) {
    // Word-safe by construction: `card:` never matches inside `card2:`
    // because the character right after "card" is "2", not ":".
    const re = new RegExp(`\\b${tw}:\\s*'([^']+)'`)
    const m = src.match(re)
    if (m) out[tw] = m[1]
  }
  return out
}

function parseGlobalsVars(src: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { css } of NAME_MAP) {
    const escaped = css.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    const re = new RegExp(`${escaped}:\\s*([^;]+);`)
    const m = src.match(re)
    if (m) out[css] = m[1]
  }
  return out
}

describe('palette single source of truth', () => {
  const tailwindSrc = readFileSync(path.join(ROOT, 'tailwind.config.ts'), 'utf8')
  const globalsSrc = readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8')

  it('non-vacuity: the tailwind.config.ts parser found all seven expected keys', () => {
    const tw = parseTailwindColors(tailwindSrc)
    expect(Object.keys(tw)).toHaveLength(7)
  })

  it('non-vacuity: the app/globals.css parser found all seven expected keys', () => {
    const css = parseGlobalsVars(globalsSrc)
    expect(Object.keys(css)).toHaveLength(7)
  })

  it.each(NAME_MAP)('$tw (tailwind.config.ts) and $css (app/globals.css) agree', ({ tw, css }) => {
    const twVal = parseTailwindColors(tailwindSrc)[tw]
    const cssVal = parseGlobalsVars(globalsSrc)[css]
    expect(twVal).toBeDefined()
    expect(cssVal).toBeDefined()
    expect(normalizeColor(twVal as string)).toBe(normalizeColor(cssVal as string))
  })
})

// ─── Half (b): no retired literal survives ────────────────────────────────

const RETIRED_HEXES = ['#0a0a0f', '#0e0d1e', '#1a1838', '#c7cbf7', '#7c80b4']

// Decimal-rgba spellings of the same five retired hexes (see the plan's
// scope notes) -- the hex grep above is blind to these because they never
// contain a '#'.
const RETIRED_DECIMAL_PATTERNS = [
  /rgba\(\s*10\s*,\s*10\s*,\s*15\s*,/i,
  /rgba\(\s*14\s*,\s*13\s*,\s*30\s*,/i,
  /rgba\(\s*26\s*,\s*24\s*,\s*56\s*,/i,
  /rgba\(\s*124\s*,\s*128\s*,\s*180\s*,/i,
]

// Decimal-rgba spelling of retired hex #c7cbf7, at ANY alpha. This is the
// hole the original RETIRED_DECIMAL_PATTERNS list left open: 199,203,247 is
// the decimal spelling of #c7cbf7, which RETIRED_HEXES already lists above,
// but the decimal-pattern list above covered only four of the five retired
// hexes and omitted this one. A decimal rgba contains no '#', so the hex
// scan is structurally blind to it -- PR #118's repaint was partial for
// exactly this reason. This pattern is intentionally kept separate from
// RETIRED_DECIMAL_PATTERNS (and its own describe block below, not folded
// into "no retired palette literal survives") so the existing hex/decimal
// agreement test keeps passing throughout this fix, and the new scan's RED
// state is legible on its own.
const LAVENDER_FAMILY_PATTERN = /rgba\(\s*199\s*,\s*203\s*,\s*247\s*,/i

// The whole allowlist. If the matcher needs more entries to go green, the
// matcher is wrong, not the code.
const ALLOWLIST = [
  'lib/email/artistInvite.ts',
  'lib/email/artistReopened.ts',
  'lib/email/artistSpotOpened.ts',
]

const SCAN_DIRS = ['app', 'components', 'lib']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full)
  }
  return out
}

describe('no retired palette literal survives', () => {
  const files = SCAN_DIRS.flatMap(d => walk(path.join(ROOT, d)))

  it('non-vacuity: the walker found a realistic number of source files', () => {
    expect(files.length).toBeGreaterThan(200)
  })

  it('no file outside the lib/email carve-out contains a retired hex or decimal-rgba literal', () => {
    const offenders: string[] = []
    for (const file of files) {
      const rel = path.relative(ROOT, file)
      if (ALLOWLIST.includes(rel)) continue
      // RAW text, comments included. A comment naming a retired value is a
      // stale claim about the palette and should fail the same gate the
      // code does -- this guard deliberately does not strip comments the
      // way the client/server boundary guard does.
      const raw = readFileSync(file, 'utf8')
      const lines = raw.split('\n')
      lines.forEach((line, idx) => {
        const lower = line.toLowerCase()
        const hexHit = RETIRED_HEXES.some(hex => lower.includes(hex))
        const decimalHit = RETIRED_DECIMAL_PATTERNS.some(re => re.test(line))
        if (hexHit || decimalHit) {
          offenders.push(`${rel}:${idx + 1}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})

// ─── Half (c): the lavender rgba family, at any alpha, is gone ────────────
//
// Same walker, same allowlist as half (b) -- lib/email is carved out
// identically. This scan is deliberately its own describe block rather than
// an addition to RETIRED_DECIMAL_PATTERNS: folding it in would make the
// existing half (b) test fail too, which would hide the fact that half (b)
// was never broken -- only the pattern list feeding it had a gap.

describe('no lavender rgba literal survives at any alpha', () => {
  const files = SCAN_DIRS.flatMap(d => walk(path.join(ROOT, d)))

  it('non-vacuity: the walker found a realistic number of source files', () => {
    expect(files.length).toBeGreaterThan(200)
  })

  it('no file outside the lib/email carve-out contains the lavender rgba family at any alpha', () => {
    const offenders: string[] = []
    for (const file of files) {
      const rel = path.relative(ROOT, file)
      if (ALLOWLIST.includes(rel)) continue
      // RAW text, comments included -- same deliberate choice as half (b):
      // a comment naming a retired colour is a stale claim about the
      // palette and should fail the same gate the code does.
      const raw = readFileSync(file, 'utf8')
      const lines = raw.split('\n')
      lines.forEach((line, idx) => {
        if (LAVENDER_FAMILY_PATTERN.test(line)) {
          offenders.push(`${rel}:${idx + 1}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})

// ─── Half (d): no dark, blue-dominant surface literal survives ────────────
//
// NAME SCOPED TO WHAT THIS ACTUALLY CHECKS (label-integrity-funun). Halves
// (b) and (c) catch exact retired values; `bg-[#1A1840]` sits two characters
// from the retired `#1A1838` and sailed through both unflagged, because
// neither half is a RULE -- they are enumerated lists. This half is a RULE:
// it flags any background, border or gradient-stop utility whose colour is
// dark (WCAG relative luminance under 0.05) AND blue-dominant (blue exceeds
// the larger of red and green by at least 8). It does NOT claim to catch
// "all indigo everywhere" -- it is scoped to app/ and components/ only (not
// lib/, which halves b and c still cover), and to background/border/
// gradient-stop utilities only, deliberately excluding `text-`, `ring-`,
// `shadow-` and `outline-`. That utility narrowing is exactly what keeps the
// out-of-scope indigo TEXT literals (`#5b5f8c`, `#9b96c8`) out of this gate
// without naming them as an exception.
//
// NO ALLOWLIST. Unlike halves (b)/(c), this half carries zero exclusions.
// The rule was prototyped against the current tree and needs none -- if it
// ever appears to need one, the rule is wrong and should be fixed, not
// carved around.

const SURFACE_UTILITY_DIRS = ['app', 'components']

// Word boundary, then a background/border/gradient-stop utility prefix, then
// an arbitrary 3- or 6-digit hex. The directional `border-[trblxy]`
// alternative is listed before bare `border` so matching is deterministic
// rather than dependent on regex backtracking order.
const SURFACE_UTILITY_PATTERN =
  /\b(bg|border-[trblxy]|border|from|via|to)-\[#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\]/g

// Module-scope, export-free: bare hex in, verdict out. WCAG relative
// luminance per-channel, then combined; "blue-dominant" means blue exceeds
// the larger of red and green by at least 8 (0-255 scale). Case-insensitive.
function isDarkBlueDominantHex(hex: string): boolean {
  let h = hex.toLowerCase()
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const toLinear = (channel: number): number => {
    const v = channel / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  const blueDominant = b - Math.max(r, g) >= 8
  return luminance < 0.05 && blueDominant
}

describe('no dark, blue-dominant surface literal survives (app/components only)', () => {
  const files = SURFACE_UTILITY_DIRS.flatMap(d => walk(path.join(ROOT, d)))

  it('non-vacuity: the walker found a realistic number of source files', () => {
    expect(files.length).toBeGreaterThan(400)
  })

  it('non-vacuity: the matcher still sees a realistic number of candidate utilities', () => {
    // There are 65 candidate arbitrary-hex bg/border/gradient utilities
    // today and 49 after the fix. This floor is what stops this half going
    // green-forever if the regex ever stops matching -- the exact death
    // this file's header warns about -- once the offender list below is
    // permanently empty.
    let candidateCount = 0
    for (const file of files) {
      const raw = readFileSync(file, 'utf8')
      const matches = raw.match(SURFACE_UTILITY_PATTERN)
      if (matches) candidateCount += matches.length
    }
    expect(candidateCount).toBeGreaterThanOrEqual(25)
  })

  it('classifier truth table: dark+blue-dominant hexes are flagged, others are not', () => {
    expect(isDarkBlueDominantHex('0d0c1e')).toBe(true)
    expect(isDarkBlueDominantHex('0b0a16')).toBe(true)
    expect(isDarkBlueDominantHex('1a1840')).toBe(true)
    expect(isDarkBlueDominantHex('1e1a0d')).toBe(false)
    expect(isDarkBlueDominantHex('0d0d0d')).toBe(false)
    expect(isDarkBlueDominantHex('818cf8')).toBe(false)
    expect(isDarkBlueDominantHex('111')).toBe(false)
    expect(isDarkBlueDominantHex('0f0d00')).toBe(false)
    expect(isDarkBlueDominantHex('123126')).toBe(false)
    expect(isDarkBlueDominantHex('5b5f8c')).toBe(false)
  })

  it('no dark, blue-dominant background/border/gradient-stop literal survives under app/ or components/', () => {
    const offenders: string[] = []
    for (const file of files) {
      const rel = path.relative(ROOT, file)
      const raw = readFileSync(file, 'utf8')
      const lines = raw.split('\n')
      lines.forEach((line, idx) => {
        for (const match of line.matchAll(SURFACE_UTILITY_PATTERN)) {
          const hex = match[2]
          if (isDarkBlueDominantHex(hex)) {
            offenders.push(`${rel}:${idx + 1}  #${hex}`)
          }
        }
      })
    }
    expect(offenders).toEqual([])
  })
})
