import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

// ─── Why this test exists ────────────────────────────────────────────────
// Migration 227's `storage_usage_over_threshold` returns a column named
// `owner_segment`, and that name is not true: it is the first path segment,
// which is an account id for `{userId}/...` uploads but a WORK id for work
// versions, clips and handoffs, a ROOM id for playbook media, and a TRACK id
// for stream previews. Checked against production, 6 of 8 UUID segments were
// not accounts.
//
// PR #87 fixed the one caller — the cron now sums every row into a global
// total and claims nothing about owners. But the FUNCTION is unchanged and
// production stays on 227 while migration 228 is deferred, so the column name
// keeps inviting the same mistake from the next caller.
//
// The real fix is migration 228 (resolve ownership through the database, group
// by bucket + segment). Until then this makes the trap loud: add a second
// consumer, or read the misleading column, and this fails with the reason.

const ROOTS = ['app', 'lib']
const RPC = 'storage_usage_over_threshold'
const MISLEADING_COLUMNS = ['owner_segment', 'is_uuid']
const EXPECTED_CALLER = path.join('app', 'api', 'cron', 'storage-usage-check', 'route.ts')

// A comment saying "we deliberately do not read owner_segment" must not count
// as reading it. This repo has been bitten three times by source-scanning
// assertions that a comment satisfied, so the scan runs on stripped source and
// the stripper is itself tested below.
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(line => {
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return ''
      // Inline trailing comment, but never the `//` inside a URL scheme.
      return line.replace(/(^|[^:])\/\/.*$/, '$1')
    })
    .join('\n')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const sources = ROOTS.flatMap(root => walk(path.join(process.cwd(), root)))
  .map(file => ({
    rel: path.relative(process.cwd(), file),
    code: stripComments(readFileSync(file, 'utf8')),
  }))

describe('the comment stripper this test depends on', () => {
  // If the stripper silently stopped working, every assertion below would pass
  // vacuously against source that still contained the identifiers.
  it('removes a line comment, a trailing comment, and a block comment', () => {
    expect(stripComments('// owner_segment here')).not.toContain('owner_segment')
    expect(stripComments('const x = 1 // owner_segment here')).not.toContain('owner_segment')
    expect(stripComments('/*\n owner_segment\n*/')).not.toContain('owner_segment')
  })

  it('keeps real code, and does not eat a URL', () => {
    expect(stripComments('const x = owner_segment')).toContain('owner_segment')
    expect(stripComments("fetch('https://example.com/x')")).toContain('https://example.com/x')
  })
})

describe(`${RPC} — caller lock`, () => {
  it('has exactly one caller, and it is the cron route', () => {
    const callers = sources.filter(s => s.code.includes(RPC)).map(s => s.rel)
    // A second consumer is not forbidden forever — it is forbidden until
    // migration 228 makes the returned attribution trustworthy.
    expect(callers).toEqual([EXPECTED_CALLER])
  })

  it.each(MISLEADING_COLUMNS)('no source reads `%s` from its result', column => {
    const readers = sources.filter(s => s.code.includes(column)).map(s => s.rel)
    expect(readers).toEqual([])
  })
})
