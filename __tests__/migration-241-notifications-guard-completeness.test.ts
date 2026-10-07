import fs from 'fs'
import path from 'path'
import { readdirSync } from 'fs'

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations')
const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '241_notifications_guard_completeness.sql'), 'utf8')

function stripLineComments(fileSql: string): string {
  return fileSql.split('\n').map((line) => {
    let inString = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === "'") { inString = !inString; continue }
      if (!inString && ch === '-' && line[i + 1] === '-') return line.slice(0, i)
    }
    return line
  }).join('\n')
}

const code = stripLineComments(sql)
const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
const corpus = files.map(f => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')).join('\n')

/**
 * Derives a table's column names from the corpus: the CREATE TABLE body plus
 * every ADD COLUMN against it.
 *
 * This exists because migration 240's test asserted its guard "covers every
 * column except read" while only checking the four columns the author had
 * written. It restated the author's list back to him instead of measuring it
 * against the table -- so it passed while seven columns stood unguarded. A
 * check that cannot disagree with its author is not a check.
 */
function columnsOf(table: string): string[] {
  const create = corpus.match(
    new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?(?:public\\.)?${table} \\(([\\s\\S]*?)\\n\\);`)
  )?.[1] ?? ''
  const fromCreate = create
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^[a-z_]+\s+[A-Z]/.test(l))
    .map(l => l.split(/\s+/)[0])

  const added = [...corpus.matchAll(
    new RegExp(`ALTER TABLE (?:public\\.)?${table}\\b([\\s\\S]{0,600}?);`, 'g')
  )].flatMap(m =>
    [...m[1].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?([a-z_]+)/g)].map(x => x[1])
  )

  return Array.from(new Set([...fromCreate, ...added])).filter(c => c !== 'id')
}

function guardedIn(fn: string): string[] {
  const body = code.match(new RegExp(`${fn}[\\s\\S]*?v_changing BOOLEAN :=([\\s\\S]*?);`))?.[1] ?? ''
  return [...body.matchAll(/NEW\.([a-z_]+)\s+IS DISTINCT FROM/g)].map(m => m[1])
}

describe('migration 241 — the notifications guard is now complete', () => {
  // Only `read` may be changed by a client (app/api/notifications/route.ts:69).
  const ALLOWED_UNGUARDED = ['read']

  it('every column of notifications is guarded, or explicitly allowed', () => {
    const columns = columnsOf('notifications')
    expect(columns.length).toBeGreaterThan(8)
    const guarded = guardedIn('notifications_guard_provenance')
    const unaccounted = columns.filter(c => !guarded.includes(c) && !ALLOWED_UNGUARDED.includes(c))
    expect(unaccounted).toEqual([])
  })

  it('covers the seven columns migration 240 left open', () => {
    const guarded = guardedIn('notifications_guard_provenance')
    for (const c of ['title', 'body', 'link', 'emailed', 'actor_id', 'actor_name', 'actor_avatar_url']) {
      expect(guarded).toContain(c)
    }
  })

  it('leaves read writable — the only live client write', () => {
    expect(guardedIn('notifications_guard_provenance')).not.toContain('read')
  })
})

describe('migration 241 — opportunity_matches', () => {
  // An artist applying to an opportunity is a real client action.
  const ALLOWED_UNGUARDED = ['applied', 'applied_at', 'status']

  it('every column is guarded, or explicitly allowed as a client action', () => {
    const columns = columnsOf('opportunity_matches')
    const guarded = guardedIn('opportunity_matches_guard_computed')
    const unaccounted = columns.filter(c => !guarded.includes(c) && !ALLOWED_UNGUARDED.includes(c))
    expect(unaccounted).toEqual([])
  })

  it('adds notified_at, which the matcher stamps and no client writes', () => {
    expect(guardedIn('opportunity_matches_guard_computed')).toContain('notified_at')
  })

  it('does NOT close applying — widening a guard is when a capability dies by accident', () => {
    const guarded = guardedIn('opportunity_matches_guard_computed')
    for (const c of ALLOWED_UNGUARDED) expect(guarded).not.toContain(c)
  })
})

describe('migration 241 — shape', () => {
  it('replaces the function bodies without recreating 240’s triggers', () => {
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\.notifications_guard_provenance/)
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\.opportunity_matches_guard_computed/)
    expect(code).not.toMatch(/CREATE TRIGGER/)
    expect(code).not.toMatch(/DROP TRIGGER/)
  })

  it('records why 240’s own test did not catch this', () => {
    expect(sql).toMatch(/restated my list back to me/)
    expect(sql).toMatch(/240'?s? test asserted/)
  })

  it('carries a must-succeed probe for the capability it widens onto', () => {
    expect(sql).toMatch(/O2\s+MUST SUCCEED\s+-- artist sets applied = true/)
  })
})
