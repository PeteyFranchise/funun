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
