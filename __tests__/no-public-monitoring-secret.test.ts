// ─── R5 guard: no browser-prefixed monitoring secret ──────────────────
// SPEC Prohibition (32-SPEC.md): "MUST NOT give any monitoring secret a
// NEXT_PUBLIC_ prefix / no client exposure under such a prefix." Sentry's
// own Vercel Marketplace integration auto-injects NEXT_PUBLIC_SENTRY_DSN
// (32-RESEARCH.md Common Pitfall #1) — that path is deliberately NOT used
// here. Instead the DSN is inlined into the client bundle via
// next.config.mjs's `env` key under a server-named variable (Pattern 3).
//
// This file also carries the sentry.server.config.ts behavior assertions
// from Task 2's <verify> command (a single `jest` invocation covers both
// the repo-wide grep-gate and the env-gated no-op / scrubbing / no-replay
// behavior) since the plan lists only this one test file for Task 2.
import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { scrubKnownSensitiveKeys } from '@/lib/observability/scrub'

jest.mock('@sentry/nextjs', () => ({
  init: jest.fn(),
  captureRequestError: jest.fn(),
}))

const ROOT = process.cwd()

// Directories that are never part of "repo source" for this guard (build
// output, dependency trees, VCS internals, sibling-agent worktrees, and
// the __tests__ directory itself — mirrors the acceptance criteria's own
// `grep -v __tests__`, since test files are allowed to name the forbidden
// pattern in assertions/comments without violating the prohibition).
const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.next',
  '.claude',
  '.turbo',
  'coverage',
  'dist',
  'build',
  'out',
  '__tests__',
])

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])

function isEnvFile(name: string): boolean {
  return name.startsWith('.env')
}

function collectRepoFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue
      // Skip other dot-directories (.vercel, .vscode, .idea, ...) — none of
      // these are "repo source" for a browser-secret-naming audit.
      if (entry.name.startsWith('.')) continue
      collectRepoFiles(path.join(dir, entry.name), files)
      continue
    }
    const ext = path.extname(entry.name)
    if (isEnvFile(entry.name) || SCAN_EXTENSIONS.has(ext)) {
      files.push(path.join(dir, entry.name))
    }
  }
  return files
}

// Matches any NEXT_PUBLIC_-prefixed identifier that also names a
// Sentry/monitoring secret (DSN, auth token, or the vendor name itself) —
// broader than a literal `NEXT_PUBLIC_SENTRY_DSN` string match so a
// differently-cased or differently-suffixed browser-prefixed variable
// (e.g. `NEXT_PUBLIC_SENTRY_AUTH_TOKEN`, `NEXT_PUBLIC_MONITORING_DSN`)
// is caught too, not just the exact Vercel-integration default name.
const BROWSER_PREFIXED_MONITORING_SECRET = /NEXT_PUBLIC_[A-Z0-9_]*(SENTRY|DSN|MONITOR)/i

describe('no browser-prefixed monitoring secret in repo source/env files', () => {
  it('finds zero NEXT_PUBLIC_-prefixed Sentry/monitoring secret occurrences outside __tests__', () => {
    const files = collectRepoFiles(ROOT)
    const offenders: string[] = []
    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      content.split('\n').forEach((line, idx) => {
        if (BROWSER_PREFIXED_MONITORING_SECRET.test(line)) {
          offenders.push(`${path.relative(ROOT, file)}:${idx + 1}: ${line.trim()}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })

  it('confirms the manual server-named DSN approach is actually wired in next.config.mjs', () => {
    const nextConfig = readFileSync(path.join(ROOT, 'next.config.mjs'), 'utf8')
    expect(nextConfig).toContain('SENTRY_DSN: process.env.SENTRY_DSN')
    expect(nextConfig).not.toMatch(BROWSER_PREFIXED_MONITORING_SECRET)
    expect(nextConfig).toContain('withSentryConfig')
  })
})

describe('sentry.server.config.ts — env-gated no-op init', () => {
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...ORIGINAL_ENV }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('does not call Sentry.init when SENTRY_DSN is unset (zero data egress)', () => {
    delete process.env.SENTRY_DSN
    const Sentry = require('@sentry/nextjs')
    require('../sentry.server.config')
    expect(Sentry.init).not.toHaveBeenCalled()
  })

  it('calls Sentry.init with beforeSend delegating to scrubKnownSensitiveKeys and no replay config when SENTRY_DSN is set', () => {
    process.env.SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0'
    const Sentry = require('@sentry/nextjs')
    require('../sentry.server.config')

    expect(Sentry.init).toHaveBeenCalledTimes(1)
    const initArgs = Sentry.init.mock.calls[0][0]

    expect(initArgs.dsn).toBe(process.env.SENTRY_DSN)
    expect(initArgs.sendDefaultPii).not.toBe(true)

    // Session replay OFF by default (D-03) — no replay integration/sample rate.
    expect(initArgs.replaysSessionSampleRate).toBeUndefined()
    expect(initArgs.replaysOnErrorSampleRate).toBeUndefined()
    expect(
      Array.isArray(initArgs.integrations) &&
        initArgs.integrations.some((i: { name?: string }) => /replay/i.test(i?.name ?? ''))
    ).toBe(false)

    // beforeSend delegates to the shared scrub module (Plan 02).
    expect(typeof initArgs.beforeSend).toBe('function')
    const sensitiveEvent = { extra: { password: 'hunter2', legalName: 'Jamie Rivera' } }
    expect(initArgs.beforeSend(sensitiveEvent)).toEqual(scrubKnownSensitiveKeys(sensitiveEvent))
  })
})
