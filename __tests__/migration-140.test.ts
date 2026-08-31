import { readFileSync } from 'fs'
import path from 'path'
import { WRITER_DESIGNATIONS } from '@/lib/catalogue/designation'

// ─── migration 140 — one nullable, CHECK-constrained writer_designation ──────
// Text-lock + structural test, human-gated like every migration in this phase.
// The load-bearing assertions are of RESTRAINT: it adds exactly one column,
// constrains it to the designation module's own value set, admits NULL, and
// does NOT touch the legacy `role` column, RLS, or grants.

const migration140 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/140_split_party_writer_designation.sql'),
  'utf8'
)

const sqlOnly = migration140
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

const sqlNoDocs = sqlOnly.replace(/COMMENT ON [\s\S]*?';\n/g, '')

describe('migration 140 — the column exists and is shaped correctly', () => {
  it('adds a single nullable writer_designation column, idempotently', () => {
    expect(sqlOnly).toMatch(
      /ALTER TABLE public\.split_sheet_parties\s+ADD COLUMN IF NOT EXISTS writer_designation TEXT/
    )
    // No NOT NULL, no DEFAULT — an unstated role is honest NULL, not a
    // fabricated Composer.
    expect(sqlNoDocs).not.toMatch(/writer_designation TEXT[\s\S]*NOT NULL/)
    expect(sqlNoDocs).not.toMatch(/writer_designation[\s\S]*DEFAULT/i)
  })

  it('constrains the value set to exactly the designation module, plus NULL', () => {
    expect(sqlOnly).toMatch(/writer_designation IS NULL/)
    for (const d of WRITER_DESIGNATIONS) {
      expect(sqlOnly).toContain(`'${d}'`)
    }
    // Guard against drift: the SQL must not admit a value the module lacks.
    const inList = sqlOnly.match(/writer_designation IN \(([\s\S]*?)\)/)?.[1] ?? ''
    const quoted = Array.from(inList.matchAll(/'([a-z_]+)'/g)).map(m => m[1])
    expect(quoted.sort()).toEqual([...WRITER_DESIGNATIONS].sort())
  })

  it('reloads the PostgREST schema cache last', () => {
    expect(sqlOnly.trimEnd().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})

describe('migration 140 — restraint', () => {
  it('does not touch the legacy free-text role column', () => {
    expect(sqlNoDocs).not.toMatch(/\brole\b/)
  })

  it('does not alter RLS or grants on the recursion-sensitive pair', () => {
    expect(sqlNoDocs).not.toMatch(/POLICY/i)
    expect(sqlNoDocs).not.toMatch(/\bGRANT\b/i)
    expect(sqlNoDocs).not.toMatch(/\bREVOKE\b/i)
    expect(sqlNoDocs).not.toMatch(/ROW LEVEL SECURITY/i)
  })

  it('touches only split_sheet_parties', () => {
    const tables = Array.from(sqlNoDocs.matchAll(/ALTER TABLE\s+public\.(\w+)/g)).map(m => m[1])
    expect(new Set(tables)).toEqual(new Set(['split_sheet_parties']))
  })
})
