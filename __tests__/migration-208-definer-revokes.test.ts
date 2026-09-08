import { readdirSync, readFileSync } from 'fs'
import path from 'path'

// ─── migration 208 — Tier 1 targeted revokes + one drop ───────────────────
//
// LIMITATION, STATED FIRST, AND THIS REPO HAS PAID FOR IT TWICE. A text-lock
// test proves what the SQL SAYS, never what a live PostgreSQL DOES. Migration
// 139's suite was green while a second trigger silently broke custody
// transfer; migration 198's suite was green while its conflict clause raised
// 42702 on the first live call it ever received. Both surfaced only under an
// owner-run behavioural harness. Behaviour here is plan 03's job -- its
// Part A pre-run is a MANDATORY GATE before this file is applied, and this
// test asserts nothing about whether the revokes take effect, only about what
// the migration instructs.
//
// PARSER DISCIPLINE, AND WHY IT IS NOT OPTIONAL HERE. Migration 208's own
// header discusses drop modifiers, grants and a fallback REVOKE statement IN
// PROSE. An assertion run against the UNSTRIPPED text would therefore be
// self-invalidating: it would find the words it exists to prohibit, in the
// comment that explains why they are prohibited. This is the same class of
// defect `38.0.3-INVENTORY.md` records, where the word "grant" inside a prose
// comment inverted the reported grant posture of every hardened RPC in the
// repo. So: strip `--` line comments FIRST, then assert against the stripped
// text, always.

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations')
const MIG_208 = '208_definer_helper_targeted_revokes.sql'

const raw = readFileSync(path.join(MIGRATIONS_DIR, MIG_208), 'utf8')

/**
 * Remove every `--` line comment, preserving line count. Single-quote state is
 * tracked within the line (SQL's `''` escape toggles twice and self-cancels)
 * so that a `--` inside a string literal survives -- migration 208's own
 * COMMENT ON bodies contain prose dashes, and truncating them would corrupt
 * the statements this test reads.
 */
function stripLineComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      let inString = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === "'") {
          inString = !inString
          continue
        }
        if (!inString && ch === '-' && line[i + 1] === '-') return line.slice(0, i)
      }
      return line
    })
    .join('\n')
}

const sql = stripLineComments(raw)

const REVOKED = [
  { fn: 'workspace_access_enabled', args: '()' },
  { fn: 'workspace_grant_lineage_live', args: '(uuid)' },
  { fn: 'green_room_post_matches_custom_audience', args: '(uuid, uuid)' },
] as const

const DROPPED = { fn: 'workspace_roster_relationship_is_live', args: '(uuid, uuid)' } as const

/** Every top-level statement, split on semicolons outside string literals. */
function statements(text: string): string[] {
  const out: string[] = []
  let current = ''
  let inString = false
  for (const ch of text) {
    if (ch === "'") inString = !inString
    if (ch === ';' && !inString) {
      out.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) out.push(current.trim())
  return out.filter(Boolean)
}

const STATEMENTS = statements(sql)
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

describe('migration 208 — the stripper itself', () => {
  it('removes prose but preserves dashes inside string literals', () => {
    // If this ever regresses, every assertion below silently changes meaning.
    expect(stripLineComments('REVOKE EXECUTE ON FUNCTION f(); -- GRANT to anon\n')).not.toContain(
      'GRANT to anon'
    )
    expect(stripLineComments("COMMENT ON FUNCTION f() IS 'a -- b';\n")).toContain("'a -- b'")
  })

  it('the header really does discuss the forbidden constructs — anti-vacuity', () => {
    // Proves the stripping is doing work rather than the header happening to
    // be clean. The raw file MUST contain these; the stripped file must not.
    expect(raw).toMatch(/RESTRICT/)
    expect(raw).toMatch(/REVOKE EXECUTE ON FUNCTION\n--\s+public\.workspace_roster_relationship_is_live/)
  })
})

describe('migration 208 — the three targeted revokes', () => {
  it.each(REVOKED)('$fn has exactly one REVOKE statement', ({ fn }) => {
    const revokes = STATEMENTS.filter(
      (s) => /^REVOKE\b/i.test(s) && new RegExp(`\\bpublic\\.${fn}\\s*\\(`).test(s)
    )
    expect(revokes).toHaveLength(1)
  })

  it.each(REVOKED)('$fn is revoked FROM PUBLIC, anon AND authenticated', ({ fn }) => {
    // Migration 047 revoked FROM PUBLIC only. Supabase grants anon and
    // authenticated DIRECTLY, and a PUBLIC-only revoke does not remove a
    // direct grant -- which is how apply_to_opportunity_atomic stayed open
    // from 2024 until 2026-09-08 while the repo looked correct. Naming all
    // three is the entire correction.
    const revoke = STATEMENTS.find(
      (s) => /^REVOKE\b/i.test(s) && new RegExp(`\\bpublic\\.${fn}\\s*\\(`).test(s)
    )
    expect(revoke).toBeDefined()
    expect(norm(revoke!)).toContain('from public, anon, authenticated')
  })

  it('issues exactly three REVOKE statements and no more', () => {
    expect(STATEMENTS.filter((s) => /^REVOKE\b/i.test(s))).toHaveLength(3)
  })

  it('replaces the comment on each revoked function', () => {
    for (const { fn } of REVOKED) {
      const comment = STATEMENTS.find(
        (s) => /^COMMENT\s+ON\s+FUNCTION\b/i.test(s) && new RegExp(`\\bpublic\\.${fn}\\s*\\(`).test(s)
      )
      expect(comment).toBeDefined()
      // The comment must describe the ENFORCED state, not merely restate the
      // intent. Migration 185's comment already said "not a client-invoked
      // RPC" and nothing enforced it.
      expect(comment!.toLowerCase()).toContain('not client-callable')
      expect(comment!.toLowerCase()).toContain('security definer')
    }
  })
})

describe('migration 208 — grants nothing back', () => {
  it('contains ZERO GRANT statements', () => {
    // Not "no grant to authenticated" -- zero grants, full stop. The absence
    // of a grant IS the file. Anchored at statement start because the prose
    // in the COMMENT ON bodies legitimately uses the word "grant".
    expect(STATEMENTS.filter((s) => /^GRANT\b/i.test(s))).toEqual([])
  })

  it('contains ZERO CREATE OR REPLACE FUNCTION statements', () => {
    // Migration 208 changes reachability, never behaviour. A replaced body
    // here would be an unreviewed behaviour change smuggled into a grant
    // migration.
    expect(sql).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i)
  })
})

describe('migration 208 — the drop', () => {
  it('has exactly one DROP statement, naming workspace_roster_relationship_is_live', () => {
    const drops = STATEMENTS.filter((s) => /^DROP\b/i.test(s))
    expect(drops).toHaveLength(1)
    expect(drops[0]).toContain(`public.${DROPPED.fn}`)
  })

  it('writes NO drop modifier of either kind', () => {
    // PostgreSQL's DEFAULT is restrictive, and the default is what is wanted:
    // it makes the statement self-verifying for policy references, because a
    // refusal (2BP01) names every policy that still depends on the function.
    //
    // RESTRICT is not written explicitly, so that a future reader cannot
    // mistake the default for an oversight and "helpfully" change it. The
    // recursive modifier is catastrophic here and must never appear: with RLS
    // enabled, cascading a policy away leaves the table DEFAULT-DENY -- a
    // silent total read outage for every non-owner role, not an opening.
    expect(sql).not.toMatch(/\bCASCADE\b/i)
    expect(sql).not.toMatch(/\bRESTRICT\b/i)
  })

  it('does not also revoke the dropped function', () => {
    // The fallback revoke lives in the header as PROSE, for the owner to apply
    // by hand if the drop refuses. If it ever became executable SQL, the drop
    // and the revoke would both be in the file and the fallback would stop
    // being a fallback.
    const revokes = STATEMENTS.filter(
      (s) => /^REVOKE\b/i.test(s) && s.includes(DROPPED.fn)
    )
    expect(revokes).toEqual([])
  })
})

describe('migration 208 — PostgREST schema reload', () => {
  it('ends with the schema-cache reload notify', () => {
    // Without it the endpoints stay APPARENTLY live until the cache turns
    // over on its own, which would let a post-apply verification pass read
    // clean while the exposure was still reachable.
    const lines = sql.split('\n').map((l) => l.trim()).filter(Boolean)
    expect(lines[lines.length - 1]).toBe("NOTIFY pgrst, 'reload schema';")
  })
})

// ─── Signature fidelity ───────────────────────────────────────────────────
//
// A REVOKE or DROP against a signature that does not exist is a SILENT NO-OP,
// and a silent no-op is exactly the failure mode this whole phase exists to
// fix. So every argument list written in migration 208 is compared, character
// for character after lowercasing and whitespace normalisation, against the
// argument list used in that function's most recent PRIOR REVOKE/GRANT
// statement -- migrations 186, 192, 060 and 183 respectively.

function priorSignature(fn: string): { file: string; args: string } | null {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && f < MIG_208)
    .sort()
  let latest: { file: string; args: string } | null = null
  const re = new RegExp(`^(?:REVOKE|GRANT)\\b[^;]*?\\bON\\s+FUNCTION\\s+public\\.${fn}\\s*(\\([^)]*\\))`, 'im')
  for (const file of files) {
    const text = stripLineComments(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
    const m = re.exec(text)
    if (m) latest = { file, args: m[1] }
  }
  return latest
}

function migration208Signature(fn: string): string | null {
  const stmt = STATEMENTS.find(
    (s) => /^(REVOKE|DROP)\b/i.test(s) && new RegExp(`\\bpublic\\.${fn}\\s*\\(`).test(s)
  )
  if (!stmt) return null
  const m = new RegExp(`public\\.${fn}\\s*(\\([^)]*\\))`).exec(stmt)
  return m ? m[1] : null
}

describe('migration 208 — signature fidelity against the prior grant statements', () => {
  it.each([...REVOKED, DROPPED])(
    '$fn uses the same argument list as its most recent prior REVOKE/GRANT',
    ({ fn }) => {
      const prior = priorSignature(fn)
      expect(prior).not.toBeNull()

      const mine = migration208Signature(fn)
      expect(mine).not.toBeNull()

      expect(norm(mine!)).toBe(norm(prior!.args))
    }
  )

  it('anchors WHICH migration each prior signature came from', () => {
    // Locked so that a future migration re-issuing one of these grants makes
    // this test fail loudly rather than silently shifting the reference point
    // the assertion above compares against.
    expect(priorSignature('workspace_access_enabled')?.file).toBe(
      '186_workspace_rls_extension.sql'
    )
    expect(priorSignature('workspace_grant_lineage_live')?.file).toBe(
      '192_workspace_project_permission_v2.sql'
    )
    expect(priorSignature('green_room_post_matches_custom_audience')?.file).toBe(
      '060_green_room_block_visibility_and_audience_roles.sql'
    )
    expect(priorSignature('workspace_roster_relationship_is_live')?.file).toBe(
      '183_workspace_roster_relationships.sql'
    )
  })
})

describe('migration 208 — the TRAP exemption is stated in the file itself', () => {
  it('names the rule, the exemption and the test that proves it', () => {
    // The exemption must outlive this plan. It is stated in three places: the
    // migration header (here), the invariant test's failure messages, and the
    // plan SUMMARY. A reader who finds only the revoke, with no evidence
    // attached, cannot tell it apart from the blanket revoke the SCOPE
    // forbids.
    expect(raw).toContain('THE TRAP')
    expect(raw).toContain('__tests__/rls-helper-callsites.test.ts')
    expect(raw).toMatch(/ZERO policies/)
    expect(raw).toContain('HUMAN-GATED')
  })
})
