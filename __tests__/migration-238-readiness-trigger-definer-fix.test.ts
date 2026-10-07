import fs from 'fs'
import path from 'path'
import { readdirSync } from 'fs'

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations')
const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '238_readiness_trigger_definer_fix.sql'), 'utf8')

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

describe('migration 238 — readiness trigger SECURITY DEFINER fix', () => {
  it('flips both callers of calculate_vault_readiness to SECURITY DEFINER', () => {
    for (const fn of ['update_vault_readiness', 'recompute_readiness_on_distributor']) {
      const def = code.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(\\)[\\s\\S]*?AS \\$\\$`))?.[0] ?? ''
      expect(def).not.toBe('')
      expect(def).toMatch(/SECURITY DEFINER/)
      expect(def).toMatch(/SET search_path = ''/)
    }
  })

  it('schema-qualifies every reference, as an empty search_path requires', () => {
    const bodies = code.match(/AS \$\$[\s\S]*?\$\$;/g) ?? []
    expect(bodies.length).toBe(2)
    for (const b of bodies) {
      expect(b).toMatch(/UPDATE public\.vault_projects/)
      expect(b).toMatch(/public\.calculate_vault_readiness\(/)
      // An unqualified reference would resolve to nothing with search_path = ''.
      expect(b).not.toMatch(/\s(?<!public\.)calculate_vault_readiness\(/)
      expect(b).not.toMatch(/UPDATE vault_projects/)
    }
  })

  it('revokes EXECUTE on both — they are genuinely trigger-internal', () => {
    for (const fn of ['update_vault_readiness', 'recompute_readiness_on_distributor']) {
      expect(code).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\(\\) FROM PUBLIC, anon, authenticated`))
    }
  })

  it('changes no scoring logic — access control only', () => {
    // calculate_vault_readiness itself must not be redefined here; 068 owns
    // the current body and a silent rewrite would change scores.
    expect(code).not.toMatch(/CREATE OR REPLACE FUNCTION public\.calculate_vault_readiness/)
    expect(code).not.toMatch(/vault_readiness_score = \d/)
  })

  it('does not recreate the triggers — CREATE OR REPLACE preserves attachment', () => {
    expect(code).not.toMatch(/CREATE TRIGGER/)
    expect(code).not.toMatch(/DROP TRIGGER/)
  })

  it('records the false premise it is correcting, so 070 is not re-derived later', () => {
    expect(sql).toMatch(/does not require a role-level EXECUTE grant/)
    expect(sql).toMatch(/is false|second half of that sentence is false/i)
    expect(sql).toMatch(/070:206/)
  })

  it('carries a probe that proves the score actually changed, not just that the error stopped', () => {
    expect(sql).toMatch(/MUST SUCCEED -- the project's vault_readiness_score actually changed/)
    expect(sql).toMatch(/silently no-ops/)
  })
})

describe('migration 238 — standing corpus invariant', () => {
  it('no SECURITY INVOKER function anywhere calls calculate_vault_readiness', () => {
    // The defect class: calculate_vault_readiness has no EXECUTE grant for
    // authenticated (070:206), so any INVOKER caller breaks every client
    // write to the table its trigger is attached to.
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
    const latestBody = new Map<string, string>()

    for (const file of files) {
      const stripped = stripLineComments(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
      const defs = stripped.match(/CREATE OR REPLACE FUNCTION\s+(public\.)?[a-z_]+\s*\([\s\S]*?\$\$;/gi) ?? []
      for (const d of defs) {
        const name = d.match(/CREATE OR REPLACE FUNCTION\s+(?:public\.)?([a-z_]+)/i)?.[1]
        if (name) latestBody.set(name, d)
      }
    }

    const offenders: string[] = []
    for (const [name, body] of latestBody) {
      if (name === 'calculate_vault_readiness') continue
      if (!/calculate_vault_readiness\s*\(/.test(body)) continue
      if (!/SECURITY DEFINER/i.test(body)) offenders.push(name)
    }

    expect(offenders).toEqual([])
  })
})
