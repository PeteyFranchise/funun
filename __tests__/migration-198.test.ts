import { readFileSync } from 'fs'
import path from 'path'

// Cross-module drift guards (plan 08). These are imported from source, not
// restated, so a future divergence between the TypeScript union and the SQL
// literals fails this suite instead of reaching production — the Phase 38
// owner-floor-message drift, prevented in the shape migration 197's suite
// already uses for OWNERSHIP_TRANSFER_STATE_VALUES.
import { OWNERSHIP_TRANSFER_STATE_VALUES } from '@/lib/workspaces/ownership-transfer'
import { WORKSPACE_ROLE_VALUES } from '@/lib/workspaces/types'

// ─── migration 198 — the transactional workspace RPC family ───────────────
//
// LIMITATION, STATED FIRST: a text-lock test proves what the SQL SAYS. It
// cannot prove what a live PostgreSQL DOES. This repo has no live-Postgres
// harness and no plan in this phase opens a database connection.
//
// That distinction is taken seriously here because it has already cost this
// project a production outage. Migration 139 asserted in a parenthetical
// that a SECURITY DEFINER function would not fire a trigger; migration 190's
// suite was green, its function existed, and the route called it correctly —
// and custody transfer still raised 42501 in production, because a second,
// differently-named trigger also fires on vault_projects. Only migration 196
// and a behavioural run surfaced it. A green suite here is pre-push review
// evidence, not proof.
//
// The behavioural proof for this migration is plan 17's owner-run
// single-shot production harness, not this file.
//
// HOW LATER PLANS EXTEND THIS FILE. Plans 08, 10 and 11 append RPCs to
// migration 198. They ADD describe blocks and ADD entries to the shared
// fixtures below. **They never rewrite the harness.** The LO-1 lock-order,
// LO-2 lock-mode, LO-4 bounded-wait, grant-posture and declaration-posture
// assertions all iterate the functions actually present in the file, so a
// function appended by a later plan is covered the moment it is written,
// with no edit to those describe blocks at all.

const MIGRATION_PATH = 'supabase/migrations/198_workspace_transactional_rpcs.sql'

const migration = readFileSync(path.join(process.cwd(), MIGRATION_PATH), 'utf8')

// Executable SQL only, with `--` comment lines stripped, so "the migration
// does not do X" assertions cannot be defeated (or falsely tripped) by
// prose. Mirrors __tests__/migration-190.test.ts and -196.test.ts.
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// The header prose, de-wrapped: `--` markers removed and whitespace
// collapsed, so header assertions test what the header SAYS rather than
// where its 79-column line breaks happen to fall.
const prose = normalizeWhitespace(
  migration
    .split('\n')
    .filter((line) => line.trimStart().startsWith('--'))
    .map((line) => line.trimStart().replace(/^--\s?/, ''))
    .join(' ')
)

// `sql` still contains every COMMENT ON FUNCTION statement, whose string
// literal necessarily quotes table names, lock modes and rule names as
// documentation. That is prose inside a string, not a clause this migration
// executes, so the negative structural assertions run against a view with
// those statements removed.
const executable = sql.replace(/COMMENT ON FUNCTION[\s\S]*?';\n/g, '')

// A line-preserving mask of the raw file: comment lines become empty lines,
// so offsets still map to real line numbers. Used only by the lock-site
// scan, which needs to report a line number and look at the comment lines
// immediately above a locking clause.
const masked = migration
  .split('\n')
  .map((line) => (line.trimStart().startsWith('--') ? '' : line))
  .join('\n')

// PRECISION FIX (plan 08), NOT A WEAKENING — read the next sentence before
// changing it. `masked` strips `--` comment LINES but keeps every
// COMMENT ON FUNCTION statement, whose string literal necessarily quotes
// lock modes as documentation: section (c)'s comment says, correctly, "FOR
// NO KEY UPDATE and not FOR UPDATE per LO-2". `lockSites()` read that prose
// as two real `FOR UPDATE` clauses and reported an LO-2 violation on a file
// whose every locking clause is FOR NO KEY UPDATE. That is the SAME
// distinction plan 06 already drew for `executable` five lines above —
// prose inside a string is not a clause this migration executes — applied
// to the one view that had not yet been given it.
//
// The replacement preserves the LINE COUNT of what it blanks, so the line
// numbers `lockSites()` reports still point at the real file. It removes no
// executable statement: a genuine `FOR UPDATE` in a function body is
// outside any COMMENT ON FUNCTION and is still scanned, still resolved to a
// table, and still required to carry its justifying comment. Proved by
// mutation both ways.
const maskedExecutable = masked.replace(/COMMENT ON FUNCTION[\s\S]*?';\n/g, (block) =>
  '\n'.repeat((block.match(/\n/g) ?? []).length)
)

// `IS DISTINCT FROM` and `IS NOT DISTINCT FROM` are null-safe COMPARISON
// OPERATORS. The `FROM` in them introduces no relation, but it is
// indistinguishable from a `FROM` clause to a regex that looks only at the
// keyword — so `v_member.role IS DISTINCT FROM p_expected_role` was read as
// a reference to an unqualified relation named `p_expected_role`. Stripped
// before the schema-qualification scan for the same reason that scan
// already strips LOCK_CLAUSE: "FOR NO KEY UPDATE" contains the token
// UPDATE. Neither strip removes a real relation reference.
const DISTINCT_FROM = /\bIS\s+(?:NOT\s+)?DISTINCT\s+FROM\b/gi

// PRECISION FIX (plan 10), NOT A WEAKENING — the third instance of exactly
// the same class of false positive plan 06 and plan 08 already corrected,
// and corrected the same way. `ON CONFLICT ... DO UPDATE SET` is an upsert's
// conflict action: the token UPDATE there introduces NO relation at all, the
// target relation was already named by the `INSERT INTO public.<t>` this
// clause belongs to, and PostgreSQL forbids naming one after it. To a regex
// that looks only at the keyword it is indistinguishable from a real
// `UPDATE <relation>`, so `DO UPDATE SET status = 'active'` was read as a
// reference to an unqualified relation named `SET`.
//
// This removes no executable statement and hides no real reference: the
// INSERT that owns the clause is still scanned and still required to be
// schema-qualified, and a genuine `UPDATE workspace_members` anywhere in a
// body is untouched by this strip and still caught. Proved by mutation both
// ways. Same reasoning as LOCK_CLAUSE ("FOR NO KEY UPDATE" contains UPDATE)
// and DISTINCT_FROM ("IS DISTINCT FROM" contains FROM) above.
const DO_UPDATE = /\bDO\s+UPDATE\b/gi

const flatSql = normalizeWhitespace(sql)

// ══ Shared harness — plans 08, 10 and 11 reuse all of this ═══════════════

/** Every `CREATE OR REPLACE FUNCTION public.<name>` in the file, in order. */
function functionNames(): string[] {
  const re = /CREATE OR REPLACE FUNCTION\s+public\.([a-z0-9_]+)\s*\(/g
  const names: string[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(sql)) !== null) names.push(match[1])
  return names
}

/** A function body, from its header line to its closing `$$;`. */
function functionBlock(name: string): string {
  const header = `CREATE OR REPLACE FUNCTION public.${name}(`
  const start = sql.indexOf(header)
  if (start < 0) throw new Error(`migration 198 declares no public.${name}`)
  const end = sql.indexOf('\n$$;', start)
  if (end < 0) throw new Error(`public.${name} has no closing $$;`)
  return sql.slice(start, end)
}

/**
 * Trigger functions are held to a DIFFERENT posture than RPCs: they are not
 * called by anyone, so they take no grant, are not SECURITY DEFINER in this
 * repo's idiom (migration 196's guard tests current_user itself), and need
 * no lock_timeout because they run inside their caller's transaction. The
 * RPC-only assertions below iterate this list, not `functionNames()`.
 */
function rpcFunctionNames(): string[] {
  return functionNames().filter((name) => !/RETURNS\s+TRIGGER/i.test(functionBlock(name)))
}

/**
 * RULE LO-1 — the global lock order, as machine-readable data.
 *
 * THIS CONSTANT AND THE RANK TABLE IN MIGRATION 198'S HEADER ARE TWINS AND
 * MUST CHANGE TOGETHER. The header states the rule for a human; this states
 * it for the suite. Auxiliary tables inherit their parent's rank + 0.5 and
 * are touched after it.
 */
const LO1_RANKS: Record<string, number> = {
  workspaces: 1,
  workspace_members: 2,
  workspace_roster_relationships: 3,
  workspace_roster_blocks: 3.5,
  workspace_agreement_evidence: 3.5,
  workspace_permission_requests: 3.5,
  workspace_invitations: 4,
  workspace_attachments: 5,
  workspace_grants: 6,
  workspace_permission_bundles: 6.5,
  workspace_custody_transfers: 7,
  workspace_ownership_transfers: 7,
  vault_projects: 8,
  workspace_audit_log: 9,
}

const LOCK_CLAUSE = /FOR\s+(NO\s+KEY\s+UPDATE|UPDATE|KEY\s+SHARE|SHARE)\b/g
const TABLE_REF = /(?:FROM|UPDATE)\s+public\.([a-z0-9_]+)/g

/**
 * Every table locked inside `body`, in source order. For each locking
 * clause, the table is resolved by looking backwards to the nearest
 * preceding `FROM public.<t>` or `UPDATE public.<t>`.
 */
function lockedTablesInOrder(body: string): string[] {
  const refs: { index: number; table: string }[] = []
  TABLE_REF.lastIndex = 0
  let ref: RegExpExecArray | null
  while ((ref = TABLE_REF.exec(body)) !== null) {
    refs.push({ index: ref.index, table: ref[1] })
  }

  const locked: string[] = []
  LOCK_CLAUSE.lastIndex = 0
  let lock: RegExpExecArray | null
  while ((lock = LOCK_CLAUSE.exec(body)) !== null) {
    const at = lock.index
    const preceding = refs.filter((candidate) => candidate.index < at)
    locked.push(preceding.length ? preceding[preceding.length - 1].table : '<unresolved>')
  }
  return locked
}

/** Every locking clause in the executable SQL, with its raw line number. */
function lockSites(): { line: number; mode: string }[] {
  const sites: { line: number; mode: string }[] = []
  LOCK_CLAUSE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = LOCK_CLAUSE.exec(maskedExecutable)) !== null) {
    const line = maskedExecutable.slice(0, match.index).split('\n').length - 1
    sites.push({ line, mode: normalizeWhitespace(match[1]).toUpperCase() })
  }
  return sites
}

// ══ Header discipline ════════════════════════════════════════════════════

describe('migration 198 — header states the doctrine every later plan copies', () => {
  it('is HUMAN-GATED and names the four forbidden supabase commands', () => {
    expect(prose).toContain('HUMAN-GATED')
    expect(prose).toContain('supabase db push')
    expect(prose).toContain('supabase db reset')
    expect(prose).toContain('supabase migration up')
    expect(prose).toContain('supabase db query')
  })

  it('states that it is pushed with 197 and never staged alone', () => {
    expect(prose).toContain('PUSHED WITH 197 — NEVER STAGED ALONE')
    expect(prose).toContain('never staged ahead of that window')
  })

  it('declares itself incomplete until plan 11', () => {
    expect(prose).toContain('THIS FILE IS INCOMPLETE AS OF PLAN 06')
    expect(prose).toMatch(/Plans 08, 10 and 11 APPEND to this file/)
  })

  it('takes its number from the LIVE LEDGER and reserves 199-200 and 201-202', () => {
    expect(prose).toContain('LIVE LEDGER')
    expect(prose).toContain('Migration-file headers are NOT a source of migration numbers')
    expect(prose).toMatch(/199-200\s+Phase 38\.2/)
    expect(prose).toMatch(/201-202\s+the Playbook rich-content model/)
  })

  it('explains why the RPCs exist — one PostgREST transaction, and names all five findings', () => {
    expect(prose).toContain('ONE SQL transaction at READ COMMITTED')
    for (const finding of ['F9', 'F11', 'F15', 'F16', 'F14']) {
      expect(prose).toContain(finding)
    }
    expect(prose).toContain('app/api/vault/custody-transfers/route.ts')
    expect(prose).toContain('app/api/workspaces/invitations/accept/route.ts')
    expect(prose).toContain('app/api/roster/relationships/route.ts')
    expect(prose).toContain('lib/workspaces/audit.ts')
  })

  it('states LO-1 as a rule and names all nine primary ranks in the rank table', () => {
    expect(prose).toContain('RULE LO-1 — THE GLOBAL LOCK ORDER')
    expect(prose).toContain('THIS IS A RULE, NOT A PREFERENCE')
    expect(prose).toContain('strictly ascending rank order')
    const ranked = [
      'public.workspaces',
      'public.workspace_members',
      'public.workspace_roster_relationships',
      'public.workspace_invitations',
      'public.workspace_attachments',
      'public.workspace_grants',
      'public.workspace_custody_transfers',
      'public.vault_projects',
      'public.workspace_audit_log',
    ]
    for (const table of ranked) expect(prose).toContain(table)
  })

  it('gives LO-1 its four reasons, not just the rule', () => {
    expect(prose).toContain('foreign-key direction, parent before child')
    expect(prose).toContain('FOR KEY SHARE')
    expect(prose).toContain('most contended row')
    expect(prose).toContain('takes no row lock')
    expect(prose).toContain('consistent order')
  })

  it('states LO-2 as FOR NO KEY UPDATE with its reason and its one honest unknown', () => {
    expect(prose).toContain('RULE LO-2')
    expect(prose).toContain('`FOR NO KEY UPDATE`, NOT `FOR UPDATE`')
    expect(prose).toContain('Every locking clause in this file is FOR NO KEY UPDATE')
    expect(prose).toContain('foreign-key PARENTS')
    expect(prose).toContain('THE ONE HONEST UNKNOWN')
    expect(prose).toContain('idx_workspace_members_unique_user')
    expect(prose).toContain('NOT verified against a live database')
  })

  it('states LO-3 (no lock upgrades) and LO-4 (bounded wait) by name', () => {
    expect(prose).toContain('RULE LO-3 — NO LOCK UPGRADES')
    expect(prose).toContain('RULE LO-4 — BOUNDED WAIT')
    expect(prose).toContain("lock_timeout = '3s'")
    expect(prose).toContain('55P03')
    expect(prose).toContain('40P01')
    expect(prose).toContain('Do NOT use NOWAIT')
    expect(prose).toContain('Do NOT use SKIP LOCKED')
  })

  it('states R-26 with the mechanical reason a refusal must not RAISE', () => {
    expect(prose).toContain('RULE R-26 — RAISE VERSUS OUTCOME CODE')
    expect(prose).toContain(
      'A RAISE ROLLS THE TRANSACTION BACK, INCLUDING ANY AUDIT ROW ALREADY WRITTEN IN IT'
    )
    expect(prose).toContain('MUST NOT RAISE')
    expect(prose).toContain('Validation errors')
  })

  it('states R-21 Option A AND writes its R-05 limitation down rather than glossing it', () => {
    expect(prose).toContain('RULE R-21 — ACTOR BINDING: OPTION A')
    expect(prose).toContain('NEVER accepts a role parameter')
    expect(prose).toContain('THE LIMITATION, WRITTEN DOWN AND NOT GLOSSED')
    expect(prose).toContain('PARTIAL satisfaction of R-05')
    expect(prose).toContain('do not describe this file as fully satisfying R-05')
  })

  it('states flatly that SECURITY DEFINER does not bypass triggers, and carries the inventory', () => {
    expect(prose).toContain('SECURITY DEFINER DOES NOT BYPASS TRIGGERS')
    expect(prose).toContain('guard_workspace_never_zero_owners')
    expect(prose).toContain('guard_owner_immutable')
    expect(prose).toContain('update_updated_at')
  })

  it('states the promote-before-demote owner-floor write order and the one-row-per-statement rule', () => {
    expect(prose).toContain(
      'PROMOTE THE SUCCESSOR IN STATEMENT 1 AND DEMOTE THE INCUMBENT IN STATEMENT 2'
    )
    expect(prose).toContain('42501')
    expect(prose).toContain('ONE ROW PER STATEMENT AGAINST workspace_members')
    expect(prose).toContain('Never issue a multi-row UPDATE against workspace_members')
  })

  it('records the role-scoped exemption and this file’s answer to it', () => {
    expect(prose).toContain('THE ROLE-SCOPED EXEMPTION')
    expect(prose).toContain("current_user IN ('postgres')")
    expect(prose).toContain('silently joins that exemption set')
    expect(prose).toContain('transfer_vault_project_custody()')
    expect(prose).toContain('Migrations 190 and 196 are deliberately NOT edited')
  })

  it('states why no backfill exists, and that D-52 territory is untouched', () => {
    expect(prose).toContain('ZERO rows on production')
    expect(prose).toContain('D-52')
  })

  it('carries the canonical template as a findable reference block with all six numbered steps', () => {
    expect(prose).toContain('THE TEMPLATE — copy this shape')
    for (const step of [
      'BOUND THE WAIT',
      'CONSULT THE KILL SWITCH',
      'LOCK IN ASCENDING LO-1 RANK',
      'REVALIDATE AFTER THE LOCK',
      'MUTATE',
      'AUDIT IN THE SAME TRANSACTION',
    ]) {
      expect(prose).toContain(step)
    }
    expect(prose).toContain(
      'EVERY DEVIATION FROM THIS SHAPE MUST BE JUSTIFIED IN A COMMENT AT THE POINT OF DEVIATION'
    )
  })

  it('names migration 123 as the security template and refuses migration 046’s half', () => {
    expect(prose).toContain('migration 123')
    expect(prose).toContain('046')
    expect(prose).toContain('it has no REVOKE at all')
    expect(prose).toContain('never copy 046')
  })
})

// ══ LO-1 — the lock-order assertion every later plan inherits ════════════

describe('LO-1 — every function locks in strictly ascending rank order', () => {
  it('declares at least one function', () => {
    expect(functionNames().length).toBeGreaterThan(0)
  })

  it('resolves every locked table to a known LO-1 rank', () => {
    const unknown: string[] = []
    for (const name of functionNames()) {
      for (const table of lockedTablesInOrder(functionBlock(name))) {
        if (!(table in LO1_RANKS)) {
          unknown.push(
            `public.${name} locks "${table}", which has no LO-1 rank — either a typo or a table nobody ranked`
          )
        }
      }
    }
    expect(unknown).toEqual([])
  })

  it('never acquires a lower rank after a higher one, in any function', () => {
    const violations: string[] = []
    for (const name of functionNames()) {
      const tables = lockedTablesInOrder(functionBlock(name))
      for (let i = 1; i < tables.length; i += 1) {
        const previous = tables[i - 1]
        const current = tables[i]
        const previousRank = LO1_RANKS[previous]
        const currentRank = LO1_RANKS[current]
        if (previousRank === undefined || currentRank === undefined) continue
        if (currentRank < previousRank) {
          violations.push(
            `public.${name}: LO-1 violation — locks public.${previous} (rank ${previousRank}) ` +
              `then public.${current} (rank ${currentRank}); ranks must never decrease`
          )
        }
      }
    }
    expect(violations).toEqual([])
  })
})

// ══ LO-2 / LO-3 / LO-4 — lock mode and bounded wait ══════════════════════

describe('LO-2 — every locking clause is FOR NO KEY UPDATE unless justified in place', () => {
  it('uses no stronger mode without a comment naming a DELETE or a key-column change', () => {
    const rawLines = migration.split('\n')
    const violations: string[] = []
    for (const site of lockSites()) {
      if (site.mode === 'NO KEY UPDATE') continue
      const window = rawLines
        .slice(Math.max(0, site.line - 10), site.line)
        .filter((line) => line.trimStart().startsWith('--'))
        .join(' ')
      const justified = /\bDELETE\b/i.test(window) || /key column/i.test(window)
      if (!justified) {
        violations.push(
          `line ${site.line + 1}: "FOR ${site.mode}" with no justifying comment in the preceding ` +
            `10 lines naming a DELETE or a key-column change (LO-2)`
        )
      }
    }
    expect(violations).toEqual([])
  })

  it('never uses SKIP LOCKED or NOWAIT in executable SQL', () => {
    expect(executable).not.toMatch(/SKIP\s+LOCKED/i)
    expect(executable).not.toMatch(/\bNOWAIT\b/i)
  })
})

describe('LO-4 — every RPC bounds its lock wait', () => {
  it('sets lock_timeout in every RPC body', () => {
    const missing = rpcFunctionNames().filter(
      (name) => !/lock_timeout/.test(functionBlock(name))
    )
    expect(missing).toEqual([])
  })
})

// ══ R-21 — grant posture, iterated over every RPC in the file ════════════

describe('R-21 — migration 123’s grant posture, explicitly not migration 046’s', () => {
  // Migration 046 creates a SECURITY DEFINER function with NO REVOKE at
  // all, so PUBLIC — and therefore anon — holds EXECUTE on it. That is the
  // half of 046 this file refuses to copy. These assertions loop over the
  // functions actually present, so plans 08, 10 and 11 inherit them.
  it('REVOKEs EXECUTE from PUBLIC, anon and authenticated on every RPC', () => {
    const missing: string[] = []
    for (const name of rpcFunctionNames()) {
      const pattern = new RegExp(
        `REVOKE EXECUTE ON FUNCTION public\\.${name}\\s*\\([^)]*\\)\\s*FROM PUBLIC, anon, authenticated`
      )
      if (!pattern.test(flatSql)) missing.push(`public.${name} has no REVOKE EXECUTE`)
    }
    expect(missing).toEqual([])
  })

  it('GRANTs EXECUTE to service_role on every RPC', () => {
    const missing: string[] = []
    for (const name of rpcFunctionNames()) {
      const pattern = new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\s*\\([^)]*\\)\\s*TO service_role`
      )
      if (!pattern.test(flatSql)) missing.push(`public.${name} is not granted to service_role`)
    }
    expect(missing).toEqual([])
  })

  it('grants nothing in this file to authenticated or anon', () => {
    expect(flatSql).not.toMatch(/GRANT EXECUTE[^;]*TO[^;]*\bauthenticated\b/)
    expect(flatSql).not.toMatch(/GRANT EXECUTE[^;]*TO[^;]*\banon\b/)
  })
})

// ══ The role-scoped exemption guard ══════════════════════════════════════

describe('the 190/196 exemption is role-scoped — this file must not use it', () => {
  // Migrations 190 and 196 exempt current_user IN ('postgres'), which is
  // true inside ANY postgres-owned SECURITY DEFINER function, so every RPC
  // here silently joins that exemption set. This is the text-lock form of
  // the phase's answer: no function here writes vault_projects.user_id;
  // the custody RPC calls transfer_vault_project_custody() instead.
  it('no function issues an UPDATE on public.vault_projects that SETs user_id', () => {
    const offenders: string[] = []
    const re = /UPDATE\s+public\.vault_projects\b[\s\S]*?;/g
    let match: RegExpExecArray | null
    while ((match = re.exec(executable)) !== null) {
      const statement = match[0]
      const setAt = statement.search(/\bSET\b/i)
      if (setAt >= 0 && /\buser_id\s*=/.test(statement.slice(setAt))) {
        offenders.push(normalizeWhitespace(statement))
      }
    }
    expect(offenders).toEqual([])
  })
})

// ══ Declaration posture ══════════════════════════════════════════════════

describe('declaration posture — every function', () => {
  it('declares SECURITY DEFINER on every RPC', () => {
    const missing = rpcFunctionNames().filter(
      (name) => !/SECURITY DEFINER/.test(functionBlock(name))
    )
    expect(missing).toEqual([])
  })

  it("declares SET search_path = '' on every function, RPC or trigger", () => {
    const missing = functionNames().filter(
      (name) => !functionBlock(name).includes("SET search_path = ''")
    )
    expect(missing).toEqual([])
  })

  it('schema-qualifies every table reference inside every function body', () => {
    const violations: string[] = []
    for (const name of functionNames()) {
      // Strip locking clauses first: "FOR NO KEY UPDATE" contains the token
      // UPDATE and would otherwise be read as an UPDATE target. Strip the
      // null-safe comparison operator for the identical reason — see
      // DISTINCT_FROM's comment above — and the upsert conflict action for
      // the same reason again, see DO_UPDATE. None of the three hides a real
      // relation reference.
      const body = functionBlock(name)
        .replace(LOCK_CLAUSE, ' ')
        .replace(DISTINCT_FROM, ' ')
        .replace(DO_UPDATE, ' ')
      const re = /(?:FROM|JOIN|INSERT INTO|UPDATE)\s+([A-Za-z_"][\w".]*)/g
      let match: RegExpExecArray | null
      while ((match = re.exec(body)) !== null) {
        if (!match[1].startsWith('public.')) {
          violations.push(`public.${name} references unqualified relation "${match[1]}"`)
        }
      }
      const rowtype = /([A-Za-z_][\w.]*)%ROWTYPE/g
      while ((match = rowtype.exec(body)) !== null) {
        if (!match[1].startsWith('public.')) {
          violations.push(`public.${name} declares unqualified %ROWTYPE "${match[1]}"`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})

// ══ Section (b) — public.workspace_create (WSR-23 / R-15) ════════════════

describe('public.workspace_create — the first RPC stamped from the template', () => {
  const block = () => functionBlock('workspace_create')

  it('exists with the signature plans 12-16 map to HTTP statuses', () => {
    const flat = normalizeWhitespace(block())
    expect(flat).toContain(
      'CREATE OR REPLACE FUNCTION public.workspace_create( p_actor_id UUID, p_name TEXT, p_slug TEXT, p_workspace_type TEXT, p_roster_enabled BOOLEAN, p_catalogue_enabled BOOLEAN, p_subject_member_id UUID )'
    )
    expect(flat).toContain(
      'RETURNS TABLE ( outcome TEXT, workspace_id UUID, slug TEXT, audit_id UUID )'
    )
  })

  it('consults the D-56 kill switch before any other work', () => {
    const body = block()
    const gate = body.indexOf('public.workspace_access_enabled()')
    expect(gate).toBeGreaterThan(0)
    expect(gate).toBeLessThan(body.indexOf('INSERT INTO'))
    expect(gate).toBeLessThan(body.indexOf('RAISE EXCEPTION'))
  })

  it('returns an outcome code for the disabled switch rather than raising', () => {
    const flat = normalizeWhitespace(block())
    expect(flat).toContain(
      "IF NOT public.workspace_access_enabled() THEN RETURN QUERY SELECT 'disabled'::TEXT"
    )
  })

  it('raises invalid_parameter_value on a workspace_type outside migration 182’s three literals', () => {
    const flat = normalizeWhitespace(block())
    expect(flat).toContain("NOT IN ('artist_team', 'management', 'label')")
    expect(flat).toContain("USING ERRCODE = 'invalid_parameter_value'")
  })

  it('writes workspace, then owner seat, then audit row — LO-1 rank 1, 2, 9', () => {
    const body = block()
    const workspace = body.indexOf('INSERT INTO public.workspaces')
    const seat = body.indexOf('INSERT INTO public.workspace_members')
    const audit = body.indexOf('INSERT INTO public.workspace_audit_log')
    expect(workspace).toBeGreaterThan(0)
    expect(seat).toBeGreaterThan(workspace)
    expect(audit).toBeGreaterThan(seat)
  })

  it('seats the actor as an active owner with the role as a literal, never a parameter', () => {
    const flat = normalizeWhitespace(block())
    expect(flat).toContain(
      'INSERT INTO public.workspace_members ( workspace_id, user_id, role, status, invited_by )'
    )
    expect(flat).toContain("v_workspace_id, p_actor_id, 'owner', 'active', p_actor_id")
    expect(flat).not.toMatch(/p_role\b/)
  })

  it('sets subject_member_id only for an artist_team workspace (D-07)', () => {
    const flat = normalizeWhitespace(block())
    expect(flat).toContain("IF p_workspace_type = 'artist_team' THEN v_subject_id := p_subject_member_id; ELSE v_subject_id := NULL; END IF;")
  })

  it('retries the slug unique_violation with a bounded numeric cap', () => {
    const body = block()
    expect(body).toMatch(/EXCEPTION\s+WHEN\s+unique_violation\s+THEN/)
    const cap = body.match(/v_attempt\s*>=\s*(\d+)/)
    expect(cap).not.toBeNull()
    expect(Number(cap?.[1])).toBeGreaterThan(0)
    expect(Number(cap?.[1])).toBeLessThanOrEqual(10)
    expect(body).toMatch(/substr\(\s*gen_random_uuid\(\)::text, 1, 8\s*\)/)
  })

  it('does not reimplement the TypeScript slug transform in SQL', () => {
    const body = block()
    expect(body).not.toMatch(/slugify/i)
    expect(body).not.toMatch(/regexp_replace/i)
    expect(body).not.toMatch(/lower\s*\(\s*p_name/i)
  })

  it('writes an audit row carrying no restricted PII in changes (WSR-19)', () => {
    const flat = normalizeWhitespace(block())
    expect(flat).toContain("'workspace.created'")
    expect(flat).toContain('RETURNING id INTO v_audit_id')
    const changes = flat.slice(flat.indexOf('jsonb_build_object'))
    expect(changes).not.toMatch(/email/i)
    expect(changes).not.toMatch(/p_name/)
  })

  it('returns the ok outcome with the workspace id, slug and audit id', () => {
    expect(normalizeWhitespace(block())).toContain(
      "RETURN QUERY SELECT 'ok'::TEXT, v_workspace_id, v_slug, v_audit_id;"
    )
  })

  it('documents its lock order, preconditions, triggers and same-transaction audit', () => {
    const comment = sql.slice(sql.indexOf('COMMENT ON FUNCTION public.workspace_create'))
    expect(comment).toContain('ONE transaction')
    expect(comment).toContain('LO-1')
    expect(comment).toContain('workspace_access_enabled()')
    expect(comment).toContain('guard_workspace_owner_role_change')
    expect(comment).toContain('created_by')
    expect(comment).toContain('service_role only')
  })
})

// ══ Section (c) — public.workspace_change_member_role_or_status ══════════

/**
 * The audited-refusal shape, asserted the same way in sections (c), (d) and
 * (e): the branch returning `code` must INSERT its audit row and capture the
 * id into v_audit_id BEFORE returning, with no other RETURN QUERY in
 * between — which is what proves the INSERT belongs to THIS branch rather
 * than to an earlier one.
 *
 * This is the machine-checkable half of R-26. A refusal that RAISEs, or one
 * that returns without auditing, loses the record this phase exists to
 * guarantee: a RAISE rolls the transaction back INCLUDING the audit row
 * written moments earlier in it.
 */
function auditedRefusalViolation(fn: string, code: string): string | null {
  const block = functionBlock(fn)
  const returnAt = block.indexOf(`RETURN QUERY SELECT '${code}'`)
  if (returnAt < 0) return `public.${fn} has no branch returning the outcome '${code}'`

  const insertAt = block.lastIndexOf('INSERT INTO public.workspace_audit_log', returnAt)
  if (insertAt < 0) {
    return `public.${fn}: the '${code}' refusal returns without any preceding audit INSERT (R-26)`
  }

  const between = block.slice(insertAt, returnAt)
  if (!between.includes('RETURNING id INTO v_audit_id')) {
    return `public.${fn}: the '${code}' refusal's audit INSERT does not capture its id into v_audit_id`
  }
  if (/RETURN QUERY SELECT/.test(between)) {
    return (
      `public.${fn}: the nearest audit INSERT before the '${code}' refusal belongs to an ` +
      `earlier branch — this branch returns without auditing (R-26)`
    )
  }
  return null
}

describe('public.workspace_change_member_role_or_status — WSR-11 / WSR-07 / F15', () => {
  const block = () => functionBlock('workspace_change_member_role_or_status')

  // Asserted as an iterated SET rather than one big string match, so a
  // missing literal NAMES ITSELF in the failure instead of collapsing nine
  // outcomes into a single unhelpful boolean.
  const OUTCOMES = [
    'ok',
    'not_found',
    'forbidden',
    'forbidden_owner_row',
    'promotion_requires_transfer',
    'no_self_role_change',
    'stale',
    'illegal_transition',
    'floor',
  ]

  it('returns every outcome code plan 12 must map', () => {
    const body = block()
    const missing = OUTCOMES.filter((code) => !body.includes(`RETURN QUERY SELECT '${code}'`))
    expect(missing).toEqual([])
  })

  it('accepts no parameter that would let a caller assert their own role (R-21)', () => {
    const body = block()
    expect(body).not.toMatch(/p_actor_role\b/)
    expect(body).not.toMatch(/p_role\b/)

    // Lock the whole signature, not just the absence of one name: any future
    // parameter carrying an actor-supplied authority claim fails here.
    const params = body.slice(body.indexOf('(') + 1, body.indexOf('RETURNS TABLE'))
    const declared = [...params.matchAll(/\bp_[a-z_]+\b/g)].map((m) => m[0])
    expect([...new Set(declared)].sort()).toEqual([
      'p_actor_id',
      'p_expected_role',
      'p_expected_status',
      'p_member_id',
      'p_new_role',
      'p_new_status',
      'p_workspace_id',
    ])
  })

  it('never sets updated_at by hand — update_updated_at() would overwrite it', () => {
    expect(block()).not.toMatch(/updated_at\s*=/)
  })

  it('counts the owner floor AFTER the workspace_members row lock (F15)', () => {
    const body = block()
    // Anchored on the locked SELECT's FROM clause, NOT on the first
    // occurrence of the table name — that one is the %ROWTYPE declaration
    // in DECLARE, and searching forward from it would find the rank-1
    // workspaces lock instead, making this assertion weaker than its name.
    const memberLock = body.indexOf(
      'FOR NO KEY UPDATE',
      body.indexOf('FROM public.workspace_members m')
    )
    const floorCount = body.indexOf('SELECT count(*) INTO v_other_owners')
    expect(memberLock).toBeGreaterThan(0)
    expect(floorCount).toBeGreaterThan(0)

    // The whole of F15 is that the count used to happen in a DIFFERENT
    // transaction from the write. Counting before the lock would prove
    // nothing at all — a precondition checked before the lock is a
    // precondition about a row somebody else may already have changed.
    expect(floorCount).toBeGreaterThan(memberLock)
  })

  it('counts the floor with expires_at honoured on both sides (R-28)', () => {
    const flat = normalizeWhitespace(block())
    expect(flat).toContain(
      "SELECT count(*) INTO v_other_owners FROM public.workspace_members m " +
        "WHERE m.workspace_id = p_workspace_id AND m.role = 'owner' AND m.status = 'active' " +
        'AND (m.expires_at IS NULL OR m.expires_at > now()) AND m.id <> v_member.id'
    )
  })

  it('audits every AUTHORITY refusal before returning its code, and raises in none of them', () => {
    const violations = [
      'forbidden',
      'forbidden_owner_row',
      'promotion_requires_transfer',
      'no_self_role_change',
      'floor',
    ]
      .map((code) => auditedRefusalViolation('workspace_change_member_role_or_status', code))
      .filter((violation): violation is string => violation !== null)
    expect(violations).toEqual([])
  })

  it('does not audit the stale CAS or the illegal transition — neither is an authority refusal', () => {
    const body = block()
    for (const code of ['stale', 'illegal_transition']) {
      const returnAt = body.indexOf(`RETURN QUERY SELECT '${code}'`)
      expect(returnAt).toBeGreaterThan(0)
      // The returned audit id is NULL because no audit row was written.
      expect(body.slice(returnAt, returnAt + 120)).toContain('NULL::UUID')
    }
  })

  it('re-derives the actor authority from the database, active and unexpired', () => {
    expect(normalizeWhitespace(block())).toContain(
      'SELECT m.role INTO v_actor_role FROM public.workspace_members m ' +
        'WHERE m.workspace_id = p_workspace_id AND m.user_id = p_actor_id ' +
        "AND m.status = 'active' AND (m.expires_at IS NULL OR m.expires_at > now())"
    )
  })

  it('updates one row keyed on the primary key — never a multi-row UPDATE', () => {
    const body = block()
    const statements = [...body.matchAll(/UPDATE\s+public\.workspace_members[\s\S]*?;/g)]
    expect(statements.length).toBe(1)
    expect(normalizeWhitespace(statements[0][0])).toBe(
      'UPDATE public.workspace_members SET role = COALESCE(p_new_role, role), ' +
        'status = COALESCE(p_new_status, status) WHERE id = v_member.id;'
    )
  })

  it('consults the D-56 kill switch before any write', () => {
    const body = block()
    const gate = body.indexOf('public.workspace_access_enabled()')
    expect(gate).toBeGreaterThan(0)
    expect(gate).toBeLessThan(body.indexOf('INSERT INTO'))
    expect(gate).toBeLessThan(body.indexOf('UPDATE public.'))
  })
})

// ══ Section (d) — public.workspace_nominate_owner ════════════════════════

describe('public.workspace_nominate_owner — WSR-08 / R-22', () => {
  const block = () => functionBlock('workspace_nominate_owner')

  const OUTCOMES = [
    'ok',
    'forbidden',
    'no_self_nomination',
    'successor_not_a_member',
    'already_owner',
    'nomination_open',
  ]

  it('returns every outcome code plan 12 must map', () => {
    const body = block()
    const missing = OUTCOMES.filter((code) => !body.includes(`RETURN QUERY SELECT '${code}'`))
    expect(missing).toEqual([])
  })

  it('locks rank 1 workspaces before rank 2 workspace_members', () => {
    expect(lockedTablesInOrder(block())).toEqual(['workspaces', 'workspace_members'])
  })

  it('locks the two rank-2 seats in ascending id order (LO-1 within-table rule)', () => {
    // Both the actor's seat and the successor's seat are rank 2, so LO-1's
    // ordering rule cannot be satisfied by rank alone. Without ORDER BY,
    // two nominations in opposite pairings take the same two rows in
    // opposite orders — a textbook deadlock.
    expect(normalizeWhitespace(block())).toContain(
      'FROM public.workspace_members m WHERE m.workspace_id = p_workspace_id ' +
        'AND m.user_id IN (p_actor_id, p_successor_user_id) ORDER BY m.id FOR NO KEY UPDATE'
    )
  })

  it('checks for an open nomination explicitly rather than relying on the unique index', () => {
    const flat = normalizeWhitespace(block())
    expect(flat).toContain(
      'SELECT t.id INTO v_open_nomination FROM public.workspace_ownership_transfers t ' +
        "WHERE t.workspace_id = p_workspace_id AND t.state = 'offered'"
    )
    // The index stays the backstop; it must not be the user-visible error.
    expect(block()).toContain("RETURN QUERY SELECT 'nomination_open'")
  })

  it('requires an ACTIVE unexpired owner seat, re-derived rather than parameterised (R-21)', () => {
    const body = block()
    expect(body).not.toMatch(/p_actor_role\b/)
    expect(normalizeWhitespace(body)).toContain("IF v_actor_role IS DISTINCT FROM 'owner' THEN")
  })

  it('sets offered_by and from_user_id from the same re-derived actor', () => {
    expect(normalizeWhitespace(block())).toContain(
      'INSERT INTO public.workspace_ownership_transfers ( workspace_id, from_user_id, ' +
        'to_user_id, offered_by, state ) VALUES ( p_workspace_id, p_actor_id, ' +
        "p_successor_user_id, p_actor_id, 'offered' )"
    )
  })

  it('audits the two AUTHORITY refusals before returning their codes (R-26)', () => {
    const violations = ['forbidden', 'no_self_nomination']
      .map((code) => auditedRefusalViolation('workspace_nominate_owner', code))
      .filter((violation): violation is string => violation !== null)
    expect(violations).toEqual([])
  })
})

// ══ Section (e) — the write-order lock ═══════════════════════════════════

describe('public.workspace_respond_ownership_nomination — WSR-08 / R-22', () => {
  const block = () => functionBlock('workspace_respond_ownership_nomination')

  const OUTCOMES = [
    'ok',
    'not_found',
    'stale',
    'already_resolved',
    'forbidden',
    'nominator_no_longer_owner',
    'successor_no_longer_a_member',
  ]

  it('returns every outcome code plan 12 must map', () => {
    const body = block()
    const missing = OUTCOMES.filter((code) => !body.includes(`RETURN QUERY SELECT '${code}'`))
    expect(missing).toEqual([])
  })

  // ─────────────────────────────────────────────────────────────────────
  // THE MOST IMPORTANT ASSERTION IN PLAN 08.
  //
  // It compares SOURCE OFFSETS rather than trusting a reader's eye,
  // because the failure it prevents is invisible on inspection and only
  // appears at runtime, in production, as SQLSTATE 42501 on a path a
  // person is standing in front of.
  // ─────────────────────────────────────────────────────────────────────
  it('promotes the successor BEFORE demoting the nominator', () => {
    const body = block()
    const promote = body.search(/UPDATE\s+public\.workspace_members\s+SET\s+role\s*=\s*'owner'/)
    const demote = body.search(/UPDATE\s+public\.workspace_members\s+SET\s+role\s*=\s*'admin'/)

    const ordered = promote >= 0 && demote >= 0 && promote < demote
    const failure =
      `public.workspace_respond_ownership_nomination writes the promotion at offset ${promote} ` +
      `and the demotion at offset ${demote}. THE PROMOTION MUST COME FIRST. ` +
      'guard_workspace_never_zero_owners runs inside this transaction and SEES ITS UNCOMMITTED ' +
      'WRITES FROM EARLIER STATEMENTS: promoting first means the floor count that runs when the ' +
      'demotion fires the guard counts the freshly-promoted successor and passes. Demote-then-' +
      'promote counts ZERO remaining owners and raises SQLSTATE 42501, failing the whole ' +
      'transfer. This is not a style preference — do not reorder these two statements (R-22).'

    expect(ordered ? [] : [failure]).toEqual([])
  })

  it('transfers ownership rather than adding a second owner (R-22)', () => {
    const body = block()
    // The demotion must exist at all: without it the nominator stays an
    // owner and the "transfer" has silently become an add-a-second-owner,
    // which R-22 explicitly defers to a later phase.
    expect(body).toMatch(/UPDATE\s+public\.workspace_members\s+SET\s+role\s*=\s*'admin'/)
  })

  it('mutates member rows one row per statement, keyed on the primary key', () => {
    const statements = [...block().matchAll(/UPDATE\s+public\.workspace_members[\s\S]*?;/g)]
    expect(statements.length).toBe(2)
    for (const statement of statements) {
      expect(normalizeWhitespace(statement[0])).toMatch(/WHERE id = v_\w+_member_id;$/)
    }
  })

  it('writes three audit rows on the accept path — one per mutated row', () => {
    const body = block()
    const inserts = body.match(/INSERT INTO public\.workspace_audit_log/g) ?? []
    // Migration 197's deferred constraint triggers are scoped per table and
    // match on target_id = NEW.id, so each of the three mutated rows needs
    // its own audit row naming it or the transaction fails at COMMIT.
    expect(inserts.length).toBeGreaterThanOrEqual(3)

    const acceptAudits = body.slice(body.indexOf("IF p_action = 'accept' THEN", body.indexOf('(5)')))
    expect(acceptAudits).toContain("'workspace_member', v_successor_member_id")
    expect(acceptAudits).toContain("'workspace_member', v_nominator_member_id")
    expect(body).toContain("'workspace_ownership_transfer', p_transfer_id")
  })

  it('refuses the nominator accepting their own nomination, whatever else is true', () => {
    const flat = normalizeWhitespace(block())
    // The F1 attack shape at the ownership layer: one actor performing both
    // sides of an act R-05 requires to be two-sided.
    expect(flat).toContain(
      "IF (p_action IN ('accept', 'decline') AND (p_actor_id <> v_to_user_id " +
        'OR p_actor_id = v_offered_by OR p_actor_id = v_from_user_id))'
    )
    expect(auditedRefusalViolation('workspace_respond_ownership_nomination', 'forbidden')).toBeNull()
  })

  it('audits the accept-path authority refusals before returning their codes (R-26)', () => {
    const violations = ['nominator_no_longer_owner', 'successor_no_longer_a_member']
      .map((code) => auditedRefusalViolation('workspace_respond_ownership_nomination', code))
      .filter((violation): violation is string => violation !== null)
    expect(violations).toEqual([])
  })

  it('locks ranks 1 then 2 then 7, reading the transfer unlocked first', () => {
    expect(lockedTablesInOrder(block())).toEqual([
      'workspaces',
      'workspace_members',
      'workspace_ownership_transfers',
    ])
    // The unlocked pre-read is what makes ascending acquisition possible at
    // all: the rank-1 and rank-2 rows are not known until the transfer has
    // been read. It must therefore prove nothing — the locked re-read is
    // what every precondition is decided against.
    const body = block()
    const preRead = body.indexOf('FROM public.workspace_ownership_transfers t')
    const workspaceLock = body.indexOf('FROM public.workspaces w')
    expect(preRead).toBeGreaterThan(0)
    expect(preRead).toBeLessThan(workspaceLock)
  })

  it('locks the two rank-2 seats in ascending id order (LO-1 within-table rule)', () => {
    expect(normalizeWhitespace(block())).toContain(
      'FROM public.workspace_members m WHERE m.workspace_id = v_workspace_id ' +
        'AND m.user_id IN (v_from_user_id, v_to_user_id) ORDER BY m.id FOR NO KEY UPDATE'
    )
  })

  it('never sets updated_at by hand, but does set responded_at, which no trigger maintains', () => {
    const body = block()
    expect(body).not.toMatch(/updated_at\s*=/)
    expect(body).toMatch(/responded_at\s*=\s*now\(\)/)
  })
})

// ══ Cross-module drift guards ════════════════════════════════════════════

describe('the SQL and the TypeScript modules agree — imported, never restated', () => {
  it('handles every OWNERSHIP_TRANSFER_STATE_VALUES literal in the responder', () => {
    const body = functionBlock('workspace_respond_ownership_nomination')
    const missing = OWNERSHIP_TRANSFER_STATE_VALUES.filter(
      (state) => !body.includes(`'${state}'`)
    )
    expect(missing).toEqual([])
  })

  it('uses only role literals from the WORKSPACE_ROLE_VALUES union', () => {
    const known = new Set<string>(WORKSPACE_ROLE_VALUES)
    const found = new Set<string>()

    // `<something>role = 'x'`, `<something>role <> 'x'`, and the null-safe
    // comparison — every shape this migration actually uses.
    const comparison = /role\s*(?:=|<>|IS\s+(?:NOT\s+)?DISTINCT\s+FROM)\s*'([a-z_]+)'/gi
    let match: RegExpExecArray | null
    while ((match = comparison.exec(executable)) !== null) found.add(match[1])

    // `<something>role IN ('a', 'b')` and its NOT form.
    const membership = /role\s+(?:NOT\s+)?IN\s*\(([^)]*)\)/gi
    while ((match = membership.exec(executable)) !== null) {
      for (const literal of match[1].matchAll(/'([a-z_]+)'/g)) found.add(literal[1])
    }

    expect(found.size).toBeGreaterThan(0)
    expect([...found].filter((role) => !known.has(role))).toEqual([])
  })
})

// ══ Negative structural guarantees ═══════════════════════════════════════

describe('negative structural guarantees against executable SQL', () => {
  it('creates and drops no policy — all policy work is migration 197’s', () => {
    expect(executable).not.toMatch(/CREATE POLICY/i)
    expect(executable).not.toMatch(/DROP POLICY/i)
  })

  it('never disables a trigger or touches session_replication_role', () => {
    expect(executable).not.toMatch(/DISABLE\s+TRIGGER/i)
    expect(executable).not.toMatch(/session_replication_role/i)
  })

  it('drops no trigger it does not itself create', () => {
    // A later plan may legitimately write `DROP TRIGGER IF EXISTS <name> ON
    // <table>;` immediately before CREATEing that same trigger — the house
    // idempotency idiom (migration 182). Dropping any OTHER trigger from
    // this file would be removing a guard, which is review-blocking.
    const offenders: string[] = []
    const re = /DROP TRIGGER(?:\s+IF EXISTS)?\s+([a-z0-9_]+)/gi
    let match: RegExpExecArray | null
    while ((match = re.exec(executable)) !== null) {
      const trigger = match[1]
      if (!new RegExp(`CREATE TRIGGER\\s+${trigger}\\b`).test(executable)) {
        offenders.push(`drops trigger ${trigger}, which this migration does not create`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('touches no D-52 legacy account territory', () => {
    for (const forbidden of [
      'handle_new_user',
      'member_type',
      'industry_roles',
      'capability_grants',
      'project_members',
    ]) {
      expect(executable).not.toContain(forbidden)
    }
  })
})

// ══ File shape ═══════════════════════════════════════════════════════════

describe('file shape — the schema reload stays last', () => {
  it("ends with NOTIFY pgrst, 'reload schema';", () => {
    const lastStatement = sql
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .pop()
    expect(lastStatement).toBe("NOTIFY pgrst, 'reload schema';")
  })

  it('tells plans 08, 10 and 11 to append above that line', () => {
    expect(prose).toContain('MUST REMAIN THE LAST STATEMENT IN THIS FILE')
  })
})
