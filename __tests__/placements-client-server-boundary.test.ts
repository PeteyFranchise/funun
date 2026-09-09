import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

// ─────────────────────────────────────────────────────────────────────────
// Client/server boundary guard for the Green Room placement modules.
//
// WHY THIS EXISTS. Phase 38.0.3 plan 04 added
// `import { createServiceClient } from '@/lib/supabase/server'` to
// `lib/green-room/placements-admin.ts`. That module imports `next/headers`.
// `components/admin/PlacementAdmin.tsx` is a `'use client'` component and
// imported its form constants from `placements-admin.ts`, so the production
// build failed with:
//
//   You're importing a component that needs "next/headers". That only works
//   in a Server Component...
//
// LIMITATION, STATED PLAINLY. `npx tsc --noEmit` passed and all 6682 tests
// passed while `main` was un-deployable. This is a BUNDLER constraint, not a
// type error, so neither could see it — only `npm run build` catches the real
// thing. These assertions are a cheap early warning for the specific shape
// that broke, NOT a substitute for a build.
// ─────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd()

// Strip comments before matching. The first version of this test scanned raw
// text and failed on its own subject file, whose header comment *names* the
// server module it is forbidden to import. Same shape as the phase-38.0.3
// inventory parser that read the word "grant" out of a comment and inverted a
// grant posture: a text check that cannot tell code from prose will
// eventually read prose as code.
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(line => line.replace(/^\s*\/\/.*$/, ''))
    .join('\n')
}

// Modules that drag `next/headers` (or the service-role key) into whatever
// imports them. A client component may never reach these.
const SERVER_ONLY = ['@/lib/supabase/server', 'next/headers', 'next/server']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

describe('placements client/server boundary', () => {
  it('placements-constants.ts imports nothing server-only — it is the client-safe half', () => {
    const src = codeOnly(readFileSync(path.join(ROOT, 'lib/green-room/placements-constants.ts'), 'utf8'))
    for (const mod of SERVER_ONLY) {
      expect(src).not.toContain(mod)
    }
    // It must also not reach the service-role key, which would mark the whole
    // module server-only even without a `next/headers` hop.
    expect(src).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('placements-admin.ts is server-only and says so by importing the server client', () => {
    const src = readFileSync(path.join(ROOT, 'lib/green-room/placements-admin.ts'), 'utf8')
    // If this ever stops being true the guard below is measuring nothing, so
    // pin it rather than assume it.
    expect(src).toContain("from '@/lib/supabase/server'")
  })

  it('no `use client` component imports lib/green-room/placements-admin', () => {
    const offenders: string[] = []
    for (const file of [...walk(path.join(ROOT, 'components')), ...walk(path.join(ROOT, 'app'))]) {
      const raw = readFileSync(file, 'utf8')
      if (!/^\s*['"]use client['"]/m.test(raw)) continue
      if (codeOnly(raw).includes('@/lib/green-room/placements-admin')) {
        offenders.push(path.relative(ROOT, file))
      }
    }
    // A client component needing placement constants imports
    // `@/lib/green-room/placements-constants` instead.
    expect(offenders).toEqual([])
  })
})
