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
//      tester — a slopsquat/typosquat supply-chain hazard (T-32-14).

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(__dirname, '..', '..')

/**
 * Greps `dirs` for `pattern`, returning matching lines. Uses git grep so
 * the search honours .gitignore and never descends into node_modules or
 * .next. Exit code 1 means "no matches", which is the passing case here.
 */
function gitGrep(pattern: string, dirs: string[]): string[] {
  try {
    const out = execFileSync('git', ['grep', '-n', '-I', '--', pattern, ...dirs], {
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

describe('scripts/load is dev-only tooling, never in the runtime bundle', () => {
  it('is not referenced anywhere under app/ or lib/', () => {
    const hits = gitGrep('scripts/load', ['app', 'lib'])
    expect(hits).toEqual([])
  })

  it('is not imported or required from app/ or lib/ under any path spelling', () => {
    // Belt-and-suspenders: catch a relative import that climbs out to the
    // harness (e.g. `require('../../scripts/load/target.js')`) as well as
    // an alias import (`@/scripts/load/...`), independent of the literal
    // "scripts/load" match above.
    const hits = [
      ...gitGrep("from ['\"].*scripts/load", ['app', 'lib']),
      ...gitGrep("require(['\"].*scripts/load", ['app', 'lib']),
      ...gitGrep("import(['\"].*scripts/load", ['app', 'lib']),
    ]
    expect(hits).toEqual([])
  })

  it('does not import anything from app/ or lib/ in the other direction either', () => {
    // The harness talks to the app over HTTP only. If it ever imported
    // application code it would need the app's env, its Supabase client,
    // and its module graph — turning a standalone k6 script into something
    // that cannot run under k6 at all.
    const hits = gitGrep("@/(app|lib)/", ['scripts/load'])
    expect(hits).toEqual([])
  })
})

describe('k6 is never an npm dependency (T-32-14)', () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
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
    const raw = readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
    expect(raw).not.toMatch(/\bk6\b/)
  })
})
