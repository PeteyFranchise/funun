// ─── scripts/load/no-runtime-import.test.ts — bundle isolation (R7) ──────
// Phase 32 plan 09. Two prohibitions from the plan, both enforced here so
// a future refactor cannot quietly undo them:
//
//   1. scripts/load/* must NEVER be imported by app/ or lib/. These files
//      are dev-only tooling that `require()`s k6 built-ins (k6/http,
//      k6/metrics) which do not exist in Node or the browser — pulling one
//      into the Next.js runtime bundle would break the build, and at best
//      would ship load-testing machinery to users.
//   2. k6 must NEVER appear in package.json. k6 is a standalone Go binary
//      installed out-of-band (brew/Docker/GitHub Action). An `npm install
//      k6` would install SOMETHING from the registry, but not the load
//      tester — a slopsquat/typosquat supply-chain hazard.
//
// ── Two traps these greps fell into; do not reintroduce them ────────────
//   a) `git grep` defaults to BASIC regex, where `(` and `|` are LITERAL
//      characters. A pattern like `@/(app|lib)/` therefore matches only
//      the literal text "@/(app|lib)/" — which is to say, its own source
//      line and nothing else. Every pattern here is run with `-E`
//      (extended regex) and every assertion below is mutation-verified:
//      introducing a real violation must fail the test.
//   b) `git grep` only searches TRACKED files, so a self-matching pattern
//      passes while the test file is untracked and starts failing the
//      moment it is committed. Searches over scripts/load exclude the
//      test files via a `:!` pathspec.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(__dirname, '..', '..')

/**
 * Greps `pathspecs` for the EXTENDED-regex `pattern`, returning matching
 * lines. Uses git grep so the search honours .gitignore and never descends
 * into node_modules or .next. Exit code 1 means "no matches", which is the
 * passing case for every assertion in this file.
 */
function gitGrep(pattern: string, pathspecs: string[]): string[] {
  try {
    const out = execFileSync('git', ['grep', '-n', '-I', '-E', '--', pattern, ...pathspecs], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    return out.split('\n').filter(Boolean)
  } catch (err) {
    const e = err as { status?: number; stdout?: string }
    if (e.status === 1) return [] // git grep: no matches
    throw err
  }
}

// Excludes this file and its sibling from a scripts/load search, so a
// pattern cannot match its own source literal (trap (b) above).
const HARNESS_RUNTIME_FILES = ['scripts/load', ':!scripts/load/*.test.ts']

describe('scripts/load is dev-only tooling, never in the runtime bundle', () => {
  it('is not referenced anywhere under app/ or lib/', () => {
    // Mutation-verified: adding `// scripts/load` to any file under lib/
    // fails this test.
    const hits = gitGrep('scripts/load', ['app', 'lib'])
    expect(hits).toEqual([])
  })

  it('is not imported or required from app/ or lib/ under any path spelling', () => {
    // Belt-and-suspenders: catches a relative import that climbs out to
    // the harness (e.g. require('../../scripts/load/target.js')) and an
    // alias import (@/scripts/load/...), independent of the bare-string
    // match above. Note the escaped \( — with -E an unescaped paren would
    // open a group and match nothing useful.
    const hits = [
      ...gitGrep("(from|import)[[:space:]]*\\(?['\"][^'\"]*scripts/load", ['app', 'lib']),
      ...gitGrep("require[[:space:]]*\\(['\"][^'\"]*scripts/load", ['app', 'lib']),
    ]
    expect(hits).toEqual([])
  })

  it('does not import anything from app/ or lib/ in the other direction either', () => {
    // The harness talks to the app over HTTP only. If it ever imported
    // application code it would need the app's env, its Supabase client,
    // and its module graph — turning a standalone k6 script into something
    // that cannot run under k6 at all.
    const hits = [
      ...gitGrep("@/(app|lib)/", HARNESS_RUNTIME_FILES),
      ...gitGrep("(require|from|import)[[:space:]]*\\(?['\"][^'\"]*\\.\\./(app|lib)/", HARNESS_RUNTIME_FILES),
    ]
    expect(hits).toEqual([])
  })

  it('only requires k6 built-ins and its own sibling modules', () => {
    // Positive form of the rule: enumerate what the harness's runtime
    // files actually require, and assert every one is either a `k6*`
    // built-in or a relative sibling. This catches an import of ANY
    // third-party or application module, not just app/ and lib/.
    const requires = gitGrep("require[[:space:]]*\\(['\"]", HARNESS_RUNTIME_FILES)
    const specifiers = requires.map((line) => {
      const m = line.match(/require\s*\(\s*['"]([^'"]+)['"]/)
      return m ? m[1] : line
    })
    expect(specifiers.length).toBeGreaterThan(0) // guard against a vacuous pass
    const disallowed = specifiers.filter(
      (s) => !(s === 'k6' || s.startsWith('k6/') || s.startsWith('./') || s.startsWith('../'))
    )
    expect(disallowed).toEqual([])
  })
})

describe('k6 is never an npm dependency', () => {
  const pkgPath = path.join(repoRoot, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }

  it.each([
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ] as const)('has no k6 entry in %s', (section) => {
    const names = Object.keys(pkg[section] ?? {})
    const k6ish = names.filter((n) => n === 'k6' || n.startsWith('k6-') || n.startsWith('@k6'))
    expect(k6ish).toEqual([])
  })

  it('has no k6 string anywhere in package.json', () => {
    expect(readFileSync(pkgPath, 'utf8')).not.toMatch(/\bk6\b/)
  })
})
