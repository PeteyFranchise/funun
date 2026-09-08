import { readFileSync } from 'fs'
import path from 'path'

// Cross-module drift guards (plan 08). These are imported from source, not
// restated, so a future divergence between the TypeScript union and the SQL
// literals fails this suite instead of reaching production — the Phase 38
// owner-floor-message drift, prevented in the shape migration 197's suite
// already uses for OWNERSHIP_TRANSFER_STATE_VALUES.
import { OWNERSHIP_TRANSFER_STATE_VALUES } from '@/lib/workspaces/ownership-transfer'
import { LEGAL_ROSTER_EDGES } from '@/lib/workspaces/roster'
import { WORKSPACE_ROLE_VALUES } from '@/lib/workspaces/types'
import { CUSTODY_TRANSFER_STATE_VALUES } from '@/lib/workspaces/custody-transfer'

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

/**
 * Every `INSERT INTO public.workspace_audit_log` in `body`, as a map from
 * COLUMN NAME to the expression written into it (plan 11).
 *
 * Written as a parser rather than a regex because the target_id expression
 * is followed by `changes`, which is always a `jsonb_build_object(...)` call
 * — nested parentheses and quoted literals that a flat comma split walks
 * straight into. Tracks paren depth and single-quoted string state and
 * splits on TOP-LEVEL commas only.
 *
 * This exists so the audit-target assertions can name the column they are
 * checking instead of counting positions, which would break silently the
 * first time a future section writes its column list in a different order.
 */
function auditInsertColumnValues(body: string): Record<string, string>[] {
  const marker = 'INSERT INTO public.workspace_audit_log'
  const rows: Record<string, string>[] = []
  let at = body.indexOf(marker)

  while (at >= 0) {
    const openColumns = body.indexOf('(', at)
    const closeColumns = body.indexOf(')', openColumns)
    const columns = body
      .slice(openColumns + 1, closeColumns)
      .split(',')
      .map((column) => column.trim())

    const valuesAt = body.indexOf('VALUES', closeColumns)
    const openValues = body.indexOf('(', valuesAt)

    const values: string[] = []
    let current = ''
    let depth = 0
    let inString = false
    let cursor = openValues

    for (; cursor < body.length; cursor += 1) {
      const character = body[cursor]

      if (inString) {
        current += character
        if (character === "'") inString = false
        continue
      }
      if (character === "'") {
        inString = true
        current += character
        continue
      }
      if (character === '(') {
        depth += 1
        if (depth === 1) continue
      }
      if (character === ')') {
        depth -= 1
        if (depth === 0) {
          values.push(current.trim())
          break
        }
      }
      if (character === ',' && depth === 1) {
        values.push(current.trim())
        current = ''
        continue
      }
      current += character
    }

    const row: Record<string, string> = {}
    columns.forEach((column, index) => {
      row[column] = normalizeWhitespace(values[index] ?? '')
    })
    rows.push(row)

    at = body.indexOf(marker, cursor)
  }

  return rows
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

  // REPLACES plan 06's 'declares itself incomplete until plan 11'. That test
  // was correct for four plans and is now the OPPOSITE of what the file must
  // say: plan 11 appended sections (h) and (i), and its checkpoint asks the
  // owner to review this file AS A FINISHED ARTIFACT — which the plan-06
  // notice explicitly told a reader not to do. The header and its twin test
  // change together, which is the same discipline LO1_RANKS and the header's
  // rank table are held to. It is NOT a weakening: the assertion is stronger,
  // because it additionally requires the stale notice to be GONE rather than
  // merely contradicted further down.
  // AMENDED AGAIN by the quick task .planning/quick/260907-revoke-rpc/, for
  // the same reason and by the same discipline: the file grew a section (j),
  // so a header still claiming the inventory stops at (i) would be false. The
  // header and its twin test change together — NEVER the test alone, and
  // never the header alone. It is NOT a weakening. Every clause the plan-11
  // version asserted is still asserted verbatim, and one is ADDED: the
  // reopening must be recorded in the header rather than folded in silently,
  // so a reader who trusted "closed by plan 11" learns that it was reopened
  // once, why, and by whom.
  it('declares itself COMPLETE through section (j), and keeps the staged-authorship record', () => {
    expect(prose).toContain('THIS FILE IS COMPLETE')
    expect(prose).toContain('Sections (a) through (j) all exist')
    expect(prose).toMatch(/Plans 08, 10 and 11 APPENDed to this file/)
    expect(prose).not.toContain('THIS FILE IS INCOMPLETE')
    // The reopening is on the record, not folded in silently.
    expect(prose).toContain('THE ONE REOPENING, RECORDED RATHER THAN QUIETLY FOLDED IN')
    expect(prose).toContain('.planning/quick/260907-revoke-rpc/')
    // Complete is not applied. The distinction is load-bearing: 198 pushes
    // with 197 and the plans 12-16 TypeScript in one window at plan 17.
    expect(prose).toContain('COMPLETE AND UNAPPLIED ARE DIFFERENT THINGS')
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
/**
 * The half `auditedRefusalViolation` does NOT check, found by mutation while
 * writing plan 10 and added rather than left implied.
 *
 * That helper proves an audit INSERT precedes the refusal's RETURN and that
 * no other branch's RETURN sits between them. It says nothing about a RAISE
 * placed between the two — and a RAISE there is precisely the failure R-26
 * exists to prevent: it rolls the transaction back and TAKES THE AUDIT ROW
 * WITH IT, so the refusal this phase exists to be able to show someone later
 * silently never happened. Every call site's test is named "…and raises in
 * none of them"; this is the assertion that makes the name true.
 */
function raisingRefusalViolation(fn: string, code: string): string | null {
  const block = functionBlock(fn)
  const returnAt = block.indexOf(`RETURN QUERY SELECT '${code}'`)
  if (returnAt < 0) return `public.${fn} has no branch returning the outcome '${code}'`

  const insertAt = block.lastIndexOf('INSERT INTO public.workspace_audit_log', returnAt)
  if (insertAt < 0) {
    return `public.${fn}: the '${code}' refusal returns without any preceding audit INSERT (R-26)`
  }

  if (/\bRAISE\b/.test(block.slice(insertAt, returnAt))) {
    return (
      `public.${fn}: the '${code}' refusal RAISEs between writing its audit row and ` +
      'returning — a RAISE rolls the transaction back and takes that audit row with ' +
      'it, so the refusal is never recorded (R-26)'
    )
  }
  return null
}

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
      .flatMap((code) => [
        auditedRefusalViolation('workspace_change_member_role_or_status', code),
        // R-26 has two halves and auditedRefusalViolation only proves the first.
        // A RAISE placed between the audit INSERT and the RETURN rolls that row
        // back, so the refusal would be unaudited while still passing the audit
        // check. Plan 10 found exactly that by mutation; this section predates
        // the helper it added.
        raisingRefusalViolation('workspace_change_member_role_or_status', code),
      ])
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
      .flatMap((code) => [
        auditedRefusalViolation('workspace_nominate_owner', code),
        raisingRefusalViolation('workspace_nominate_owner', code),
      ])
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
      .flatMap((code) => [
        auditedRefusalViolation('workspace_respond_ownership_nomination', code),
        raisingRefusalViolation('workspace_respond_ownership_nomination', code),
      ])
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

// ══ Section (f) — public.workspace_redeem_invitation ═════════════════════

describe('public.workspace_redeem_invitation — WSR-10 / WSR-16 / F11', () => {
  const block = () => functionBlock('workspace_redeem_invitation')

  // Asserted as an iterated SET rather than one string match, so a missing
  // literal NAMES ITSELF in the failure instead of collapsing nine outcomes
  // into a single unhelpful boolean.
  const OUTCOMES = [
    'ok',
    'not_found',
    'not_in_cohort',
    'expired',
    'not_pending',
    'email_mismatch',
    'owner_invitation_forbidden',
    'owner_seat_conflict',
    'illegal_transition',
  ]

  it('returns every outcome code plan 14 must map', () => {
    const body = block()
    const missing = OUTCOMES.filter((code) => !body.includes(`RETURN QUERY SELECT '${code}'`))
    expect(missing).toEqual([])
  })

  it('accepts the token HASH and never the raw token, and asserts no authority', () => {
    const body = block()
    const params = body.slice(body.indexOf('(') + 1, body.indexOf('RETURNS TABLE'))
    const declared = [...params.matchAll(/\bp_[a-z_]+\b/g)].map((m) => m[0])

    // Lock the whole signature, not just the absence of one name. Two things
    // fail here if a future edit widens it: a `p_token` carrying the RAW
    // token, which must never reach SQL because it would then reach
    // pg_stat_statements and any statement log; and a `p_actor_role` or
    // equivalent letting a caller assert its own authority (R-21).
    expect([...new Set(declared)].sort()).toEqual([
      'p_actor_email',
      'p_actor_id',
      'p_require_cohort',
      'p_token_hash',
    ])
  })

  it('consults the cohort gate before it reads the invitation at all (R-24)', () => {
    const body = block()
    const gate = body.indexOf('public.workspace_access_permitted(')
    const invitationRead = body.indexOf('FROM public.workspace_invitations')
    expect(gate).toBeGreaterThan(0)
    expect(invitationRead).toBeGreaterThan(0)

    // Reading the invitation before the eligibility gate would leak its
    // existence to an ineligible caller — and R-25 maps a cohort miss to
    // 404 precisely so nobody outside the pilot learns the feature exists.
    expect(gate).toBeLessThan(invitationRead)
    expect(gate).toBeLessThan(body.indexOf('INSERT INTO'))
    expect(gate).toBeLessThan(body.indexOf('UPDATE public.'))
  })

  it('passes p_require_cohort through rather than deciding the bound in SQL', () => {
    expect(normalizeWhitespace(block())).toContain(
      'FROM public.workspace_access_permitted(p_actor_id, p_require_cohort) a'
    )
  })

  it('writes the seat as ONE statement — no lookup-then-update-or-insert fork (F11)', () => {
    const body = block()

    const inserts = [...body.matchAll(/INSERT INTO\s+public\.workspace_members\b/g)]
    expect(inserts.length).toBe(1)

    // `DO UPDATE SET` belongs to the INSERT above and is not a statement of
    // its own; a standalone `UPDATE public.workspace_members` would be the
    // fork returning, which is the half of F11 that let two concurrent
    // redemptions both miss the seat and both take the INSERT branch.
    const updates = [...body.matchAll(/\bUPDATE\s+public\.workspace_members\b/g)]
    expect(updates).toEqual([])
  })

  it('infers the PARTIAL unique index by restating its predicate', () => {
    // Without `WHERE user_id IS NOT NULL` PostgreSQL has no partial index to
    // match and the statement does not plan at all. The predicate is not
    // decoration.
    expect(normalizeWhitespace(block())).toContain(
      'ON CONFLICT (workspace_id, user_id) WHERE user_id IS NOT NULL DO UPDATE SET'
    )
  })

  it('writes at least two audit rows, one per mutated table', () => {
    const body = block()
    const audits = [...body.matchAll(/INSERT INTO public\.workspace_audit_log\b/g)]

    // Migration 197 installs its deferred constraint triggers PER TABLE and
    // each matches on target_id = NEW.id, so one row cannot satisfy both the
    // workspace_invitations assertion and the workspace_members one.
    expect(audits.length).toBeGreaterThanOrEqual(2)
    expect(body).toContain("'workspace.invitation.accepted', NULL, 'workspace_invitation', v_invitation_id")
    expect(body).toContain("'workspace.member.activated', NULL, 'workspace_member', v_member_id")
  })

  it('never writes a null audit target — the shape that fails migration 197', () => {
    const body = block()
    // The route today writes `targetId: pendingSeat?.id ?? null`, which is
    // null whenever no pending seat existed, and a null target_id matches no
    // row in the deferred assertion. Every audit INSERT here names a v_ local
    // holding a real row id.
    const targets = [...body.matchAll(/'(workspace_invitation|workspace_member)',\s*(v_[a-z_]+)/g)]
    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) {
      expect(target[2]).not.toBe('NULL')
    }
    expect(body).not.toMatch(/'workspace_(?:invitation|member)',\s*NULL/)
  })

  it('puts no restricted PII key in anything it builds (WSR-19)', () => {
    const body = block()

    // Migration 197 section (f) refuses these keys at ANY depth on
    // workspace_audit_log.changes. Scanning EVERY quoted literal in the
    // block is strictly stronger than scanning only the jsonb_build_object
    // calls, and it costs nothing: no legitimate literal in this function is
    // one of these words.
    const literals = new Set([...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))
    const restricted = [
      'email',
      'phone',
      'contact_email',
      'contact_phone',
      'address',
      'tax_id',
      'token',
      'token_hash',
      'ipi',
      'isni',
    ]
    expect(restricted.filter((key) => literals.has(key))).toEqual([])
  })

  it('never reads auth.users or auth.uid — the identity comes from the route', () => {
    const body = block()
    expect(body).not.toContain('auth.users')
    expect(body).not.toContain('auth.uid')
  })

  it('never sets updated_at by hand — update_updated_at() would overwrite it', () => {
    expect(block()).not.toMatch(/updated_at\s*=/)
  })

  it('locks the workspace, then the seat, then the invitation (LO-1: 1 -> 2 -> 4)', () => {
    expect(lockedTablesInOrder(block())).toEqual([
      'workspaces',
      'workspace_members',
      'workspace_invitations',
    ])
  })

  it('revalidates the invitation status AFTER the lock, so the CAS is structural', () => {
    const body = block()
    const invitationLock = body.indexOf(
      'FOR NO KEY UPDATE',
      body.indexOf('FROM public.workspace_invitations i\n   WHERE i.token_hash = p_token_hash\n     FOR NO KEY UPDATE')
    )
    const statusCheck = body.indexOf("IF v_invitation_status <> 'pending'")
    expect(invitationLock).toBeGreaterThan(0)
    expect(statusCheck).toBeGreaterThan(invitationLock)

    // The route's `.eq('status', 'pending')` filter is gone because there is
    // nothing left for it to do — and its result was never checked anyway,
    // which is the whole of F11's first half. Asserted PER STATEMENT rather
    // than across the body: a lazy match over the whole function would run
    // past this UPDATE and find the seat subquery's own `status = 'pending'`,
    // which is a different clause about a different table.
    const statements = [...body.matchAll(/UPDATE\s+public\.workspace_invitations[\s\S]*?;/g)]
    expect(statements.length).toBeGreaterThan(0)
    for (const statement of statements) {
      const flat = normalizeWhitespace(statement[0])
      expect(flat).toContain('WHERE id = v_invitation_id;')
      expect(flat).not.toMatch(/status\s*=\s*'pending'/)
    }
  })

  it('audits every AUTHORITY refusal before returning its code, and raises in none of them', () => {
    const codes = ['email_mismatch', 'owner_invitation_forbidden', 'owner_seat_conflict']
    const violations = [
      ...codes.map((code) => auditedRefusalViolation('workspace_redeem_invitation', code)),
      ...codes.map((code) => raisingRefusalViolation('workspace_redeem_invitation', code)),
    ].filter((violation): violation is string => violation !== null)
    expect(violations).toEqual([])
  })

  it('audits the self-healed expiry, because that branch MUTATES', () => {
    const body = block()
    const update = body.indexOf("UPDATE public.workspace_invitations\n       SET status = 'expired'")
    const audit = body.indexOf("'workspace.invitation.expired'")
    const ret = body.indexOf("RETURN QUERY SELECT 'expired'")
    expect(update).toBeGreaterThan(0)
    expect(audit).toBeGreaterThan(update)
    expect(ret).toBeGreaterThan(audit)

    // A RAISE here would roll back the audit row AND the expiry write, and
    // migration 197's deferred assertion on workspace_invitations would abort
    // the transaction at COMMIT if the write committed unaudited.
    expect(body.slice(update, ret)).not.toContain('RAISE')
  })

  it('does not audit the outcomes that are not authority refusals (R-26)', () => {
    const body = block()
    for (const code of ['not_pending', 'illegal_transition', 'not_in_cohort', 'not_found']) {
      const returnAt = body.indexOf(`RETURN QUERY SELECT '${code}'`)
      expect(returnAt).toBeGreaterThan(0)
      // Both audit-id columns come back NULL because no audit row was written.
      expect(body.slice(returnAt, returnAt + 200)).toContain('NULL::UUID')
    }
  })

  it('refuses an owner-role invitation rather than trusting migration 197’s guard', () => {
    const body = block()
    // guard_workspace_owner_role_change's FIRST statement is
    // `IF current_user IN ('postgres') THEN RETURN NEW`, and current_user IS
    // postgres inside this postgres-owned definer function — so the trigger
    // ADMITS an owner seat created here. The exemption is role-scoped.
    expect(body).toContain("IF v_invitation_role = 'owner' THEN")
    expect(body.indexOf("IF v_invitation_role = 'owner' THEN")).toBeLessThan(
      body.indexOf('INSERT INTO public.workspace_members')
    )
  })

  it('documents its lock order, preconditions, triggers and same-transaction audit', () => {
    const comment = normalizeWhitespace(
      sql.slice(sql.indexOf('COMMENT ON FUNCTION public.workspace_redeem_invitation'))
    )
    for (const phrase of [
      'LOCK RANKS, IN ORDER',
      'REVALIDATED AFTER THE LOCKS',
      'TRIGGERS THAT FIRE',
      'OUTCOME VOCABULARY',
      'THE RAW TOKEN NEVER REACHES SQL',
      'idx_workspace_members_unique_user',
      'Granted to service_role only',
    ]) {
      expect(comment).toContain(phrase)
    }
  })
})

// ══ Section (g) — public.workspace_transition_roster_relationship ═════════

describe('public.workspace_transition_roster_relationship — WSR-12 / F16', () => {
  const block = () => functionBlock('workspace_transition_roster_relationship')

  const OUTCOMES = ['ok', 'not_found', 'stale', 'forbidden', 'illegal_transition']

  it('returns every outcome code plan 12 must map', () => {
    const body = block()
    const missing = OUTCOMES.filter((code) => !body.includes(`RETURN QUERY SELECT '${code}'`))
    expect(missing).toEqual([])
  })

  it('names every LEGAL_ROSTER_EDGES state and no state outside that union', () => {
    const body = block()
    const known = Object.keys(LEGAL_ROSTER_EDGES)
    expect(known.length).toBeGreaterThan(0)

    // Imported from source, never restated, so a future divergence between
    // the TypeScript state machine and this SQL fails here instead of
    // reaching production.
    expect(known.filter((state) => !body.includes(`'${state}'`))).toEqual([])

    const found = new Set<string>()
    const comparison = /state\s*(?:=|<>|IS\s+(?:NOT\s+)?DISTINCT\s+FROM)\s*'([a-z_]+)'/gi
    let match: RegExpExecArray | null
    while ((match = comparison.exec(body)) !== null) found.add(match[1])

    const membership = /state\s+(?:NOT\s+)?IN\s*\(([^)]*)\)/gi
    while ((match = membership.exec(body)) !== null) {
      for (const literal of match[1].matchAll(/'([a-z_]+)'/g)) found.add(literal[1])
    }

    expect(found.size).toBeGreaterThan(0)
    expect([...found].filter((state) => !known.includes(state))).toEqual([])
  })

  it('handles all four actions and their four resulting states', () => {
    const body = block()
    for (const action of ['accept', 'refuse', 'block', 'end']) {
      expect(body).toContain(`'${action}'`)
    }
    for (const state of ['accepted', 'refused', 'blocked', 'ended']) {
      expect(body).toContain(`'${state}'`)
    }
  })

  it('compares p_expected_state against the LOCKED row (F16)', () => {
    const body = block()
    const lock = body.indexOf(
      'FOR NO KEY UPDATE',
      body.indexOf('FROM public.workspace_roster_relationships r\n   WHERE r.id = p_relationship_id\n     FOR NO KEY UPDATE')
    )
    const cas = body.indexOf('p_expected_state IS NOT NULL')
    expect(lock).toBeGreaterThan(0)
    expect(cas).toBeGreaterThan(lock)

    // A comparison made before the lock proves nothing at all: the routes
    // read the row in one transaction and wrote in another with no condition
    // on the state, so two concurrent PATCHes could both read `proposed` and
    // the loser could overwrite the winner's terminal state.
    expect(normalizeWhitespace(body)).toContain(
      'v_relationship.state IS DISTINCT FROM p_expected_state'
    )
  })

  it('upserts the block row AFTER the state change and INSIDE the same function', () => {
    const body = block()
    const update = body.indexOf("SET state      = 'blocked'")
    const insert = body.indexOf('INSERT INTO public.workspace_roster_blocks')
    expect(update).toBeGreaterThan(0)
    expect(insert).toBeGreaterThan(0)

    // Both offsets come from the same function body, so "inside the same
    // transaction" is structural rather than asserted. A SEPARATE
    // TRANSACTION IS EXACTLY WHAT F16'S SIDE-EFFECT HALF WAS: a crash between
    // the two leaves a `blocked` relationship with no block row, and
    // assertCanPropose reads the BLOCK TABLE and not the state, so the
    // workspace would then be permitted to re-propose to a Member who had
    // just blocked it.
    expect(insert).toBeGreaterThan(update)
    expect(normalizeWhitespace(body)).toContain(
      'ON CONFLICT (workspace_id, member_user_id) DO NOTHING'
    )
  })

  it('consults the kill switch only on the accept path', () => {
    const body = block()
    const branch = body.indexOf("IF p_action = 'accept' THEN")
    const gate = body.indexOf('public.workspace_access_enabled()')
    expect(branch).toBeGreaterThan(0)
    expect(gate).toBeGreaterThan(branch)

    // The asymmetry is DELIBERATE and must survive a tidy-up: refuse, block
    // and end have to keep working while the platform control is off,
    // because D-18 makes revocation unconditional and disabling a Member's
    // escape hatch during an incident would trap them in exactly the
    // relationship the control exists to contain. A guard hoisted to the top
    // of the body would ban all four.
    const branchEnd = body.indexOf('END IF;', body.indexOf('END IF;', gate) + 1)
    expect(gate).toBeLessThan(branchEnd)
    expect(body.slice(0, branch)).not.toContain('public.workspace_access_enabled()')
  })

  it('locks the workspace, the relationship, then the block row (LO-1: 1 -> 3 -> 3.5)', () => {
    expect(lockedTablesInOrder(block())).toEqual([
      'workspaces',
      'workspace_roster_relationships',
      'workspace_roster_blocks',
    ])
  })

  it('re-derives the workspace-side authority from the database, active and unexpired', () => {
    expect(normalizeWhitespace(block())).toContain(
      'SELECT m.role INTO v_actor_role FROM public.workspace_members m ' +
        'WHERE m.workspace_id = v_workspace_id AND m.user_id = p_actor_id ' +
        "AND m.status = 'active' AND (m.expires_at IS NULL OR m.expires_at > now())"
    )
  })

  it('accepts no parameter that would let a caller assert their own authority (R-21)', () => {
    const body = block()
    expect(body).not.toMatch(/p_actor_role\b/)

    // p_actor_side names the calling SURFACE and selects which authority
    // check runs; it never substitutes for one, and the signature lock is
    // what stops a future edit from adding one that would.
    const params = body.slice(body.indexOf('(') + 1, body.indexOf('RETURNS TABLE'))
    const declared = [...params.matchAll(/\bp_[a-z_]+\b/g)].map((m) => m[0])
    expect([...new Set(declared)].sort()).toEqual([
      'p_action',
      'p_actor_id',
      'p_actor_side',
      'p_expected_state',
      'p_relationship_id',
    ])
  })

  it('permits only `end` from the workspace surface', () => {
    // A workspace may never accept, refuse or block on a Member's behalf:
    // D-05 makes a proposal inert until the named Member affirms it, and a
    // workspace that could accept its own proposal would make consent a
    // formality.
    expect(normalizeWhitespace(block())).toContain(
      "v_authorized := v_actor_role IN ('owner', 'admin') AND p_action = 'end'"
    )
  })

  it('updates one row per statement, always keyed on the primary key', () => {
    const body = block()
    const statements = [...body.matchAll(/UPDATE\s+public\.workspace_roster_relationships[\s\S]*?;/g)]
    expect(statements.length).toBeGreaterThan(0)
    for (const statement of statements) {
      expect(normalizeWhitespace(statement[0])).toContain('WHERE id = v_relationship.id;')
    }
  })

  it('never sets updated_at by hand — the table’s trigger would overwrite it', () => {
    expect(block()).not.toMatch(/updated_at\s*=/)
  })

  it('audits the AUTHORITY refusal before returning its code, and raises in none of it', () => {
    const fn = 'workspace_transition_roster_relationship'
    expect(auditedRefusalViolation(fn, 'forbidden')).toBeNull()
    expect(raisingRefusalViolation(fn, 'forbidden')).toBeNull()
  })

  it('does not audit the stale CAS or the illegal transition — neither is an authority refusal', () => {
    const body = block()
    for (const code of ['stale', 'illegal_transition']) {
      const returnAt = body.indexOf(`RETURN QUERY SELECT '${code}'`)
      expect(returnAt).toBeGreaterThan(0)
      expect(body.slice(returnAt, returnAt + 160)).toContain('NULL::UUID')
    }
  })

  it('keeps the audit action strings the two routes already emit', () => {
    const body = block()
    for (const action of [
      'roster.accepted',
      'roster.refused',
      'roster.blocked',
      'roster.ended',
      'workspace.roster.ended',
    ]) {
      expect(body).toContain(`'${action}'`)
    }
  })

  it('does not collapse blocked into refused at the write (R-23)', () => {
    // R-23 collapses the two only in the WORKSPACE-FACING READ (migration
    // 197's workspace_roster_page), so the workspace cannot distinguish a
    // decline from a block while the Member's own view keeps the true state.
    // Collapsing here would throw away a value migration 183's CHECK and
    // LEGAL_ROSTER_EDGES both define.
    expect(normalizeWhitespace(block())).toContain("WHEN 'block' THEN 'blocked'")
  })

  it('documents its lock order, the same-transaction side effect and its outcomes', () => {
    const comment = normalizeWhitespace(
      sql.slice(sql.indexOf('COMMENT ON FUNCTION public.workspace_transition_roster_relationship'))
    )
    for (const phrase of [
      'LOCK RANKS, IN ORDER',
      'REVALIDATED AFTER THE LOCK',
      'SAME TRANSACTION AS THE STATE CHANGE',
      'TRIGGERS THAT FIRE',
      'OUTCOME VOCABULARY',
      'Granted to service_role only',
    ]) {
      expect(comment).toContain(phrase)
    }
  })
})

// ══ Section (h) — public.workspace_accept_custody_transfer ═══════════════

describe('public.workspace_accept_custody_transfer — WSR-09 / WSR-13 / F9', () => {
  const block = () => functionBlock('workspace_accept_custody_transfer')

  it('exists with the signature plan 16 maps to HTTP statuses', () => {
    // The parameter list carries trailing `--` comments on the same lines as
    // the parameters, which the comment-line strip leaves in place, so the
    // four names are asserted individually rather than as one flattened
    // string. The four-argument arity is pinned by the REVOKE/GRANT pair.
    const signature = normalizeWhitespace(
      block().slice(0, block().indexOf('RETURNS TABLE'))
    )
    for (const parameter of [
      'p_actor_id       UUID',
      'p_transfer_id    UUID',
      'p_action         TEXT',
      'p_expected_state TEXT',
    ]) {
      expect(signature).toContain(normalizeWhitespace(parameter))
    }
    expect(normalizeWhitespace(block())).toContain(
      'RETURNS TABLE ( outcome TEXT, transfer_id UUID, project_id UUID, audit_id UUID )'
    )
    expect(flatSql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.workspace_accept_custody_transfer( ' +
        'UUID, UUID, TEXT, TEXT ) FROM PUBLIC, anon, authenticated;'
    )
  })

  it('returns every outcome code plan 16 must map', () => {
    const body = block()
    const missing = [
      'ok',
      'not_found',
      'stale',
      'already_resolved',
      'forbidden',
      'stale_custodian',
    ].filter((code) => !body.includes(`RETURN QUERY SELECT '${code}'`))
    expect(missing).toEqual([])
  })

  it('serves all three responses, and their three terminal states, from one function', () => {
    const body = normalizeWhitespace(block())
    for (const action of ['accept', 'decline', 'withdraw']) {
      expect(body).toContain(`'${action}'`)
    }
    expect(body).toContain("WHEN 'accept' THEN 'accepted'")
    expect(body).toContain("WHEN 'decline' THEN 'declined'")
    expect(body).toContain("ELSE 'withdrawn'")
  })

  // The drift guard: CUSTODY_TRANSFER_STATE_VALUES is imported from source,
  // never restated, so a future divergence between the TypeScript union and
  // these SQL literals fails this suite instead of reaching production.
  it('names every CUSTODY_TRANSFER_STATE_VALUES literal', () => {
    const body = block()
    const missing = CUSTODY_TRANSFER_STATE_VALUES.filter(
      (state) => !body.includes(`'${state}'`)
    )
    expect(missing).toEqual([])
  })

  it('calls the sanctioned public.transfer_vault_project_custody()', () => {
    expect(block()).toContain('public.transfer_vault_project_custody(')
  })

  // Deliberately its OWN test, with its OWN failure message, rather than
  // leaning on the file-wide assertion higher up. The file-wide one says
  // "no function SETs user_id"; this one says WHY that matters HERE, at the
  // one call site that has any reason to want to.
  it('issues no UPDATE against public.vault_projects — the exemption is role-scoped', () => {
    const violations = /UPDATE\s+public\.vault_projects\b/.test(block())
      ? [
          'public.workspace_accept_custody_transfer UPDATEs public.vault_projects directly. ' +
            'That UPDATE WOULD SUCCEED: migrations 190 and 196 both exempt ' +
            "current_user IN ('postgres'), which is TRUE inside any postgres-owned " +
            'SECURITY DEFINER function — including this one — even though both of their ' +
            'headers describe the exemption as function-scoped. Succeeding is exactly why ' +
            'it must not be written. Call public.transfer_vault_project_custody() instead: ' +
            'the nested definer call runs in the same transaction, so atomicity is kept, ' +
            'and its double filter and NULL-return stale-custodian semantics come free.',
        ]
      : []
    expect(violations).toEqual([])
  })

  it('locks rank 7 workspace_custody_transfers before rank 8 vault_projects', () => {
    expect(lockedTablesInOrder(block())).toEqual([
      'workspace_custody_transfers',
      'vault_projects',
    ])
  })

  it('consults no kill switch — custody is a Member act (F1/F7)', () => {
    const violations = /workspace_access_enabled/.test(block())
      ? [
          'public.workspace_accept_custody_transfer consults the D-56 kill switch. It must ' +
            'not: custody is a MEMBER act, app/api/vault/custody-transfers/route.ts has ' +
            'carried ZERO workspace-derived authority since the F1 fix deleted ' +
            "assertMayOffer's workspace-admin branch, and " +
            'workspace_custody_transfers.workspace_id is NULLABLE for exactly that reason — ' +
            'a transfer may be offered outside any workspace context at all, so there may ' +
            'be no workspace whose feature control could be consulted.',
        ]
      : []
    expect(violations).toEqual([])
  })

  // The ordering that keeps the outcome-code discipline from rebuilding F9.
  it('moves custody BEFORE the diary UPDATE, so the NULL branch has mutated nothing', () => {
    const body = block()
    const custodyAt = body.indexOf('public.transfer_vault_project_custody(')
    const diaryAt = body.indexOf('UPDATE public.workspace_custody_transfers')
    expect(custodyAt).toBeGreaterThan(-1)
    expect(diaryAt).toBeGreaterThan(-1)
    expect(custodyAt).toBeLessThan(diaryAt)
  })

  it('re-checks the custodian against the LOCKED vault_projects row before accepting', () => {
    const body = normalizeWhitespace(block())
    expect(body).toContain('SELECT p.user_id INTO v_custodian')
    expect(body).toContain('v_custodian IS DISTINCT FROM v_transfer.from_user_id')
  })

  it('replaces the route’s only double-resolve protection with a post-lock check', () => {
    expect(normalizeWhitespace(block())).toContain("IF v_transfer.state <> 'offered' THEN")
  })

  it('refuses the offerer accepting or declining their own offer (the F1 shape)', () => {
    const body = normalizeWhitespace(block())
    expect(body).toContain('v_transfer.to_user_id IS NOT DISTINCT FROM p_actor_id')
    expect(body).toContain('v_transfer.offered_by IS DISTINCT FROM p_actor_id')
  })

  it('accepts no parameter that would let a caller assert their own authority (R-21)', () => {
    const signature = normalizeWhitespace(
      block().slice(0, block().indexOf('RETURNS TABLE'))
    )
    for (const forbidden of ['p_actor_role', 'p_role', 'p_is_custodian', 'p_authorized']) {
      expect(signature).not.toContain(forbidden)
    }
  })

  it('audits every AUTHORITY refusal before returning its code, and raises in none of them', () => {
    const violations: string[] = []
    for (const code of ['forbidden', 'stale_custodian']) {
      const audited = auditedRefusalViolation('workspace_accept_custody_transfer', code)
      if (audited) violations.push(audited)
      // The second helper, added by plan 10 after it proved by mutation that
      // a RAISE placed BETWEEN an audited refusal's INSERT and its RETURN
      // survives the first one. Both, always — that is what makes the name
      // of this test true.
      const raising = raisingRefusalViolation('workspace_accept_custody_transfer', code)
      if (raising) violations.push(raising)
    }
    expect(violations).toEqual([])
  })

  it('does not audit the stale CAS or the already-resolved outcome (R-26)', () => {
    const body = block()
    for (const code of ['stale', 'already_resolved']) {
      const returnAt = body.indexOf(`RETURN QUERY SELECT '${code}'`)
      expect(returnAt).toBeGreaterThan(-1)
      const insertAt = body.lastIndexOf('INSERT INTO public.workspace_audit_log', returnAt)
      // Either there is no audit INSERT before it at all, or the nearest one
      // belongs to an earlier branch that has already returned.
      if (insertAt >= 0) {
        expect(body.slice(insertAt, returnAt)).toMatch(/RETURN QUERY SELECT/)
      }
    }
  })

  // The stated choice about the nullable workspace_id, machine-checked so a
  // later edit cannot quietly write an unguarded audit row that fails the
  // NOT NULL constraint on the direct Member-to-Member path.
  it('guards every audit INSERT on the transfer having a workspace', () => {
    const body = block()
    const violations: string[] = []
    let at = body.indexOf('INSERT INTO public.workspace_audit_log')
    while (at >= 0) {
      const window = normalizeWhitespace(body.slice(Math.max(0, at - 120), at))
      if (!window.includes('IF v_transfer.workspace_id IS NOT NULL THEN')) {
        violations.push(
          `an audit INSERT at offset ${at} is not guarded by ` +
            '`IF v_transfer.workspace_id IS NOT NULL THEN` — ' +
            'workspace_audit_log.workspace_id is NOT NULL (migration 182) while ' +
            'workspace_custody_transfers.workspace_id is nullable (migration 185), so an ' +
            'unguarded INSERT fails outright for a transfer offered outside any workspace'
        )
      }
      at = body.indexOf('INSERT INTO public.workspace_audit_log', at + 1)
    }
    expect(violations).toEqual([])
  })

  it('keeps the audit action strings the route already emits', () => {
    const body = block()
    for (const action of [
      'custody.transfer.accepted',
      'custody.transfer.declined',
      'custody.transfer.withdrawn',
    ]) {
      expect(body).toContain(`'${action}'`)
    }
  })

  it('audits the transfer row’s OWN id, never the project or the workspace', () => {
    const targets = auditInsertColumnValues(block()).map((row) => row.target_id)
    expect(targets.length).toBeGreaterThan(0)
    expect([...new Set(targets)]).toEqual(['v_transfer.id'])
  })

  it('updates one row, keyed on the primary key', () => {
    const body = normalizeWhitespace(block())
    expect(body).toContain(
      "UPDATE public.workspace_custody_transfers SET state = v_new_state, " +
        'responded_at = now() WHERE id = v_transfer.id;'
    )
    expect(body.match(/UPDATE public\.workspace_custody_transfers/g)).toHaveLength(1)
  })

  it('sets responded_at by hand, because this table has no timestamp trigger', () => {
    const body = block()
    expect(body).toContain('responded_at = now()')
    expect(body).not.toContain('updated_at')
  })

  it('documents the sanctioned call, the lock order, the triggers and its outcomes', () => {
    const comment = normalizeWhitespace(
      sql.slice(sql.indexOf('COMMENT ON FUNCTION public.workspace_accept_custody_transfer'))
    )
    for (const phrase of [
      'LOCK RANKS, IN ORDER',
      'REVALIDATED AFTER THE LOCK',
      'NEVER WRITES vault_projects.user_id ITSELF',
      'THE CUSTODY MOVE IS ISSUED BEFORE THE DIARY UPDATE',
      'TRIGGERS THAT FIRE ON THE NESTED UPDATE',
      'THE D-56 KILL SWITCH IS DELIBERATELY NOT CONSULTED',
      'THE AUDIT ROW IS WRITTEN WHENEVER workspace_id IS NOT NULL',
      'OUTCOME VOCABULARY',
      'Granted to service_role only',
    ]) {
      expect(comment).toContain(phrase)
    }
  })
})

// ══ Section (i) — the terminal-state guard, and the re-scoped assertion ══

describe('public.guard_custody_transfer_transition — the guard this table never had', () => {
  const block = () => functionBlock('guard_custody_transfer_transition')

  it('exists as a trigger function, and is therefore held to the trigger posture', () => {
    expect(functionNames()).toContain('guard_custody_transfer_transition')
    expect(block()).toMatch(/RETURNS\s+TRIGGER/)
    // rpcFunctionNames() excludes RETURNS TRIGGER declarations, so this
    // function is correctly NOT required to be SECURITY DEFINER, to carry a
    // lock_timeout, or to take a service_role grant. Asserted, not assumed.
    expect(rpcFunctionNames()).not.toContain('guard_custody_transfer_transition')
    expect(block()).not.toContain('SECURITY DEFINER')
    expect(block()).not.toContain('lock_timeout')
  })

  it('refuses any UPDATE whose OLD.state is not offered', () => {
    expect(normalizeWhitespace(block())).toContain("IF OLD.state <> 'offered' THEN")
    expect(block()).toContain("USING ERRCODE = 'check_violation'")
  })

  it('refuses a NEW.state outside the three legal exits', () => {
    expect(normalizeWhitespace(block())).toContain(
      "IF NEW.state NOT IN ('accepted', 'declined', 'withdrawn') THEN"
    )
  })

  it('holds the five identity columns immutable, null-safely', () => {
    const body = normalizeWhitespace(block())
    for (const column of [
      'project_id',
      'from_user_id',
      'to_user_id',
      'offered_by',
      'workspace_id',
    ]) {
      expect(body).toContain(`NEW.${column} IS DISTINCT FROM OLD.${column}`)
    }
  })

  it('is installed BEFORE UPDATE FOR EACH ROW on public.workspace_custody_transfers', () => {
    expect(flatSql).toContain(
      'CREATE TRIGGER guard_custody_transfer_transition ' +
        'BEFORE UPDATE ON public.workspace_custody_transfers ' +
        'FOR EACH ROW EXECUTE FUNCTION public.guard_custody_transfer_transition();'
    )
  })

  it('takes no EXECUTE grant — trigger-internal only', () => {
    expect(flatSql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.guard_custody_transfer_transition() ' +
        'FROM PUBLIC, anon, authenticated;'
    )
    expect(flatSql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.guard_custody_transfer_transition/
    )
  })
})

describe('the re-scoped custody audit assertion agrees with section (h)', () => {
  // THE ONE PLACE IN THE PHASE where the audit-assertion trigger and a
  // nullable column can contradict each other. workspace_audit_log.
  // workspace_id is NOT NULL (182); workspace_custody_transfers.workspace_id
  // is nullable (185); migration 197's assertion fires unconditionally. All
  // three cannot hold, and the unconditional form would abort every direct
  // Member-to-Member custody resolution at COMMIT — the CURRENT route
  // included. Section (i) re-creates the trigger, under its own name, scoped
  // to rows that have a workspace.
  it('re-creates migration 197’s custody assertion with a WHEN clause', () => {
    expect(flatSql).toContain(
      'DROP TRIGGER IF EXISTS assert_workspace_custody_transfer_change_audited ' +
        'ON public.workspace_custody_transfers;'
    )
    expect(flatSql).toContain(
      'CREATE CONSTRAINT TRIGGER assert_workspace_custody_transfer_change_audited ' +
        'AFTER UPDATE OF state ON public.workspace_custody_transfers ' +
        'DEFERRABLE INITIALLY DEFERRED FOR EACH ROW ' +
        'WHEN (NEW.workspace_id IS NOT NULL) ' +
        'EXECUTE FUNCTION public.assert_workspace_change_is_audited();'
    )
  })

  it('leaves migration 197’s other three assertion triggers alone', () => {
    for (const trigger of [
      'assert_workspace_member_change_audited',
      'assert_workspace_roster_relationship_change_audited',
      'assert_workspace_invitation_change_audited',
    ]) {
      expect(executable).not.toContain(trigger)
    }
  })

  it('states the reasoning, and points at the owner checkpoint', () => {
    expect(prose).toContain('THE NULLABLE workspace_id ON THE AUDIT PATH')
    expect(prose).toContain('MIGRATION 197 IS NOT EDITED')
    expect(prose).toContain('it is unsatisfiable')
  })
})

// ══ Section (j) — public.workspace_revoke_invitation ═════════════════════

describe('public.workspace_revoke_invitation — WSR-10 / D-12 / D-14', () => {
  const block = () => functionBlock('workspace_revoke_invitation')

  // The vocabulary the DELETE handler of
  // app/api/workspaces/[workspaceId]/invitations/route.ts maps to HTTP.
  const OUTCOMES = ['ok', 'not_found', 'forbidden', 'not_pending', 'stale']

  it('exists with the signature the revoke route maps to HTTP statuses', () => {
    const flat = normalizeWhitespace(block())
    expect(flat).toContain('CREATE OR REPLACE FUNCTION public.workspace_revoke_invitation(')
    for (const parameter of [
      'p_actor_id UUID',
      'p_workspace_id UUID',
      'p_invitation_id UUID',
      'p_expected_status TEXT',
    ]) {
      expect(flat).toContain(parameter)
    }
    // R-21: no parameter through which a caller could assert its own role.
    expect(flat).not.toContain('p_actor_role')
  })

  it('returns every outcome code the revoke route must map', () => {
    const body = block()
    for (const outcome of OUTCOMES) {
      expect(body).toContain(`RETURN QUERY SELECT '${outcome}'`)
    }
  })

  it('locks the workspace, the paired seats, then the invitation (LO-1: 1 -> 2 -> 4)', () => {
    // Two mutated tables, so the ranked order is load-bearing rather than
    // incidental. A future edit that locked the invitation before the seats
    // would take rank 4 before rank 2 and invert LO-1.
    expect(lockedTablesInOrder(block())).toEqual([
      'workspaces',
      'workspace_members',
      'workspace_invitations',
    ])
  })

  it('locks the paired seats in ascending id order (LO-1 within-table rule)', () => {
    // Several pending seats can pair with one invited address, because
    // idx_workspace_members_unique_user is PARTIAL and does not constrain
    // NULL-user_id rows. Without ORDER BY, two concurrent revocations with
    // overlapping seat sets take the same rows in opposite orders — a
    // textbook deadlock, and the same hazard section (d) guards against.
    expect(normalizeWhitespace(block())).toContain(
      'PERFORM 1 FROM public.workspace_members m ' +
        'WHERE m.workspace_id = p_workspace_id ' +
        "AND m.status = 'pending' AND m.role = v_pre_role AND m.role <> 'owner' " +
        'AND lower(m.invited_email) = lower(v_pre_email) ' +
        'ORDER BY m.id FOR NO KEY UPDATE'
    )
  })

  it('re-checks the unlocked pre-read against the LOCKED invitation row', () => {
    // The pre-read exists only to NAME the rank-2 rows: the seats are paired
    // to the invitation by address and role, and neither is known until the
    // invitation has been read, so reading it unlocked is the only way to
    // acquire rank 2 before rank 4. It therefore proves nothing, and this
    // assertion is what keeps it proving nothing: if the locked row disagrees
    // with the pre-read, the rank-2 locks are on the wrong rows and the
    // function must return without mutating anything.
    const flat = normalizeWhitespace(block())
    expect(flat).toContain(
      'IF lower(v_invitation_email) IS DISTINCT FROM lower(v_pre_email) ' +
        'OR v_invitation_role IS DISTINCT FROM v_pre_role THEN'
    )
    const body = block()
    const drift = body.indexOf('IF lower(v_invitation_email) IS DISTINCT FROM')
    expect(drift).toBeGreaterThan(0)
    // and it happens BEFORE the first mutation, so the drift branch cannot
    // return having already written something.
    expect(drift).toBeLessThan(body.indexOf('UPDATE public.workspace_invitations'))
  })

  it('re-derives the actor authority from the database, active and unexpired', () => {
    expect(normalizeWhitespace(block())).toContain(
      'SELECT m.role INTO v_actor_role FROM public.workspace_members m ' +
        'WHERE m.workspace_id = p_workspace_id AND m.user_id = p_actor_id ' +
        "AND m.status = 'active' AND (m.expires_at IS NULL OR m.expires_at > now())"
    )
    // canManageWorkspaceMembers, expressed where the locks are held.
    expect(normalizeWhitespace(block())).toContain(
      "IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'admin') THEN"
    )
  })

  it('audits the AUTHORITY refusal before returning its code, and raises in none of it', () => {
    const fn = 'workspace_revoke_invitation'
    expect(auditedRefusalViolation(fn, 'forbidden')).toBeNull()
    expect(raisingRefusalViolation(fn, 'forbidden')).toBeNull()
  })

  it('does not audit not_pending or the stale CAS — neither is an authority refusal', () => {
    // R-26. Losing a race, or naming an invitation somebody already resolved,
    // is a business outcome about the caller's stale copy. Auditing those
    // would bury the refusal above that does belong on the record.
    const body = block()
    for (const outcome of ['not_pending', 'stale']) {
      const returnAt = body.indexOf(`RETURN QUERY SELECT '${outcome}'`)
      expect(returnAt).toBeGreaterThan(0)
      // The audit id column is NULL on these paths.
      expect(body.slice(returnAt, returnAt + 140)).toContain('NULL::UUID')
    }
  })

  it('sweeps the seats one row per statement, keyed on the primary key', () => {
    // A single statement touching two workspace_members rows would fire each
    // BEFORE ROW guard twice, each invocation blind to the other's pending
    // change — this file's header rule. And migration 197's deferred
    // assertion is FOR EACH ROW matching target_id = NEW.id, so each seat
    // needs its own audit row regardless.
    const body = block()
    const statements = [...body.matchAll(/UPDATE\s+public\.workspace_members[\s\S]*?;/g)]
    expect(statements).toHaveLength(1)
    expect(normalizeWhitespace(statements[0][0])).toBe(
      "UPDATE public.workspace_members SET status = 'removed' WHERE id = v_seat_id;"
    )
    // …and it is inside the FOREACH, which is what makes "one row per
    // statement" a sweep rather than a single-seat handler.
    expect(body).toContain('FOREACH v_seat_id IN ARRAY v_seat_ids')
  })

  it('collects the seats from the LOCKED invitation, never from the pre-read', () => {
    expect(normalizeWhitespace(block())).toContain(
      'SELECT COALESCE(array_agg(m.id ORDER BY m.id), ARRAY[]::UUID[]) ' +
        'INTO v_seat_ids FROM public.workspace_members m ' +
        'WHERE m.workspace_id = p_workspace_id ' +
        "AND m.status = 'pending' AND m.role = v_invitation_role " +
        "AND m.role <> 'owner' " +
        'AND lower(m.invited_email) = lower(v_invitation_email)'
    )
  })

  it('never touches an owner seat from this path (R-05 / R-22)', () => {
    // Owner seats move only at workspace creation or through the two-sided
    // transfer. Migration 197's guard_workspace_owner_role_change returns at
    // its postgres exemption inside this postgres-owned definer function and
    // would therefore ADMIT the write, so the exclusion has to be explicit
    // here — exactly as section (f) refuses an owner-role invitation rather
    // than trusting the same guard. Both the locking statement and the
    // collecting statement carry it: excluding it from only one would lock
    // rows it then refused to name, or name rows it never locked.
    const owners = [...normalizeWhitespace(block()).matchAll(/m\.role <> 'owner'/g)]
    expect(owners).toHaveLength(2)
  })

  it('writes one audit row per mutated table, each targeting the mutated row', () => {
    // Migration 197 installs its deferred assertions PER TABLE and each
    // matches on target_id = NEW.id, so an invitation audit row cannot
    // satisfy the workspace_members assertion and vice versa. This is the
    // exact defect the route had: one log line for two mutated tables.
    const body = block()
    expect(body).toContain(
      "'workspace.invitation.revoked', NULL,\n    'workspace_invitation', v_invitation_id"
    )
    expect(body).toContain(
      "'workspace.member.status_changed', NULL,\n      'workspace_member', v_seat_id"
    )
    // No audit INSERT names a null target — the shape migration 197 refuses.
    expect(body).not.toMatch(/'workspace_(?:invitation|member)',\s*NULL/)
  })

  it('never sets updated_at by hand — update_updated_at() would overwrite it', () => {
    expect(block()).not.toMatch(/updated_at\s*=/)
  })

  it('consults the D-56 kill switch before any write', () => {
    const body = block()
    const gate = body.indexOf('public.workspace_access_enabled()')
    expect(gate).toBeGreaterThan(0)
    expect(gate).toBeLessThan(body.indexOf('INSERT INTO'))
    expect(gate).toBeLessThan(body.indexOf('UPDATE public.'))
  })

  it('puts no restricted PII key in anything it builds (WSR-19)', () => {
    const literals = new Set([...block().matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))
    const restricted = [
      'email',
      'phone',
      'contact_email',
      'contact_phone',
      'address',
      'tax_id',
      'token',
      'token_hash',
      'ipi',
      'isni',
    ]
    expect(restricted.filter((key) => literals.has(key))).toEqual([])
  })

  it('never reads auth.users or auth.uid — the identity comes from the route', () => {
    expect(block()).not.toContain('auth.users')
    expect(block()).not.toContain('auth.uid')
  })

  it('documents its lock order, preconditions, triggers and same-transaction audit', () => {
    const comment = normalizeWhitespace(
      sql.slice(
        sql.indexOf('COMMENT ON FUNCTION public.workspace_revoke_invitation'),
        sql.indexOf(
          "';",
          sql.indexOf('COMMENT ON FUNCTION public.workspace_revoke_invitation')
        )
      )
    )
    expect(comment).toContain('ONE transaction')
    expect(comment).toContain('LOCK RANKS, IN ORDER')
    expect(comment).toContain('FOR NO KEY UPDATE')
    expect(comment).toContain('REVALIDATED AFTER THE LOCKS')
    expect(comment).toContain('ONE-ROW STATEMENTS')
    expect(comment).toContain('AN OWNER SEAT IS NEVER TOUCHED')
    expect(comment).toContain('TRIGGERS THAT FIRE')
    for (const outcome of OUTCOMES) {
      expect(comment).toContain(outcome)
    }
    expect(comment).toContain('service_role only')
  })
})

// ══ Whole-file completeness — the guard against a later truncation ═══════

describe('migration 198 is COMPLETE — every function it should carry is present', () => {
  // Enumerated as an ARRAY so a missing one names itself in the failure
  // message. This is the guard against an accidental truncation during a
  // later edit: the loops above all iterate whatever happens to be in the
  // file, so a file that lost half its functions would still pass every one
  // of them. This test is the one that would not.
  const EXPECTED_FUNCTIONS = [
    'workspace_create',
    'workspace_change_member_role_or_status',
    'workspace_nominate_owner',
    'workspace_respond_ownership_nomination',
    'workspace_redeem_invitation',
    'workspace_transition_roster_relationship',
    'workspace_accept_custody_transfer',
    'guard_custody_transfer_transition',
    // Section (j), appended by .planning/quick/260907-revoke-rpc/ after plan
    // 11 closed the file. Added to the enumeration rather than left out of
    // it: the whole point of this array is that a function which vanished in
    // a later edit names itself, and one that is never listed cannot.
    'workspace_revoke_invitation',
  ]

  it('declares all nine functions plans 06, 08, 10, 11 and the revoke quick task authored', () => {
    const present = new Set(functionNames())
    const missing = EXPECTED_FUNCTIONS.filter((name) => !present.has(name)).map(
      (name) =>
        `migration 198 no longer declares public.${name} — it was authored into this ` +
        'file and nothing in this phase removes it, so this is a truncation or a ' +
        'bad merge, not a deliberate deletion'
    )
    expect(missing).toEqual([])
  })

  it('declares eight RPCs and one trigger function, and nothing else', () => {
    expect(functionNames().sort()).toEqual([...EXPECTED_FUNCTIONS].sort())
    expect(rpcFunctionNames()).toHaveLength(8)
  })
})

// ══ Cross-function — the text-lock twin of migration 197's assertions ═════

describe('every mutating function writes an audit row in the same transaction', () => {
  // The text-lock twin of migration 197's four deferred constraint triggers.
  // Written as a LOOP OVER functionNames() so plan 11's custody RPC inherits
  // it the moment it is appended, with no edit to this block at all — the
  // same affordance plan 06 built for the LO-1, LO-2, LO-4 and grant loops.
  //
  // R-06 alone does not buy this. Putting the audit INSERT inside the RPC
  // makes the audit non-PARTIAL, not non-BYPASSABLE: a future author who
  // simply omits it is caught by nothing at all, which is finding F14's
  // shape moved one layer up.
  const AUDITED_TABLES = [
    'workspace_members',
    'workspace_roster_relationships',
    'workspace_invitations',
    'workspace_custody_transfers',
  ]

  it('has at least one function mutating an audited table', () => {
    const mutating = functionNames().filter((name) => {
      const body = functionBlock(name)
      return AUDITED_TABLES.some((table) =>
        new RegExp(`(?:INSERT INTO|\\bUPDATE)\\s+public\\.${table}\\b`).test(body)
      )
    })
    expect(mutating.length).toBeGreaterThan(0)
  })

  it('writes workspace_audit_log in every function that mutates one', () => {
    const violations: string[] = []
    for (const name of functionNames()) {
      const body = functionBlock(name)
      const mutated = AUDITED_TABLES.filter((table) =>
        new RegExp(`(?:INSERT INTO|\\bUPDATE)\\s+public\\.${table}\\b`).test(body)
      )
      if (mutated.length === 0) continue
      if (!/INSERT INTO public\.workspace_audit_log\b/.test(body)) {
        violations.push(
          `public.${name} mutates ${mutated.map((t) => `public.${t}`).join(', ')} ` +
            'but never INSERTs into public.workspace_audit_log — migration 197’s ' +
            'deferred constraint trigger would abort its transaction at COMMIT (WSR-13)'
        )
      }
    }
    expect(violations).toEqual([])
  })

  it('never lets a mutating function pass its own workspace id as an audit target', () => {
    // Migration 197's assertion matches on target_id = NEW.id, the MUTATED
    // ROW's own id. A workspace id there is the same defect as a null one:
    // it matches no mutated row, so the transaction aborts at COMMIT.
    const violations: string[] = []
    for (const name of functionNames()) {
      const body = functionBlock(name)
      for (const match of body.matchAll(
        /'(workspace_member|workspace_invitation|workspace_roster_relationship|workspace_custody_transfer|workspace_ownership_transfer)',\s*([A-Za-z_][\w.]*)/g
      )) {
        if (/^(?:v_workspace_id|p_workspace_id|NULL)$/.test(match[2])) {
          violations.push(
            `public.${name} audits target_type ${match[1]} with target_id ${match[2]}, ` +
              'which is not the mutated row’s own id (WSR-13)'
          )
        }
      }
    }
    expect(violations).toEqual([])
  })

  // ADDED by plan 11, alongside the assertion above rather than replacing it.
  // That one catches a WRONG id under a known target_type; this one catches a
  // LITERAL NULL under ANY target_type, including one nobody has enumerated
  // yet. Both matter: migration 197's assert_workspace_change_is_audited
  // matches on `l.target_id = NEW.id`, and NULL is not equal to anything, so
  // a null target lands in the audit table and STILL aborts the transaction
  // at COMMIT — the shape app/api/workspaces/invitations/accept/route.ts
  // writes today with `targetId: pendingSeat?.id ?? null`, which plan 14
  // fixes. Reads the target_id column BY NAME, not by position.
  it('never writes a literal NULL into an audit row’s target_id', () => {
    const violations: string[] = []
    let inspected = 0

    for (const name of functionNames()) {
      for (const row of auditInsertColumnValues(functionBlock(name))) {
        inspected += 1
        const target = row.target_id ?? ''
        if (/^NULL(::UUID)?$/i.test(target)) {
          violations.push(
            `public.${name} writes an audit row whose target_id is the literal ${target} — ` +
              'migration 197’s deferred constraint trigger matches on target_id = NEW.id, ' +
              'and NULL equals nothing, so the transaction aborts at COMMIT (WSR-13)'
          )
        }
      }
    }

    // The loop must have something to look at, or it proves nothing.
    expect(inspected).toBeGreaterThan(0)
    expect(violations).toEqual([])
  })

  // The twin of the assertion above: an audit row's workspace_id must be a
  // real workspace reference, because workspace_audit_log.workspace_id is
  // NOT NULL (migration 182) and a NULL there fails the INSERT outright
  // rather than at COMMIT. Section (h) is the one place in this file where
  // that could go wrong, because workspace_custody_transfers.workspace_id is
  // nullable — which is exactly why every audit INSERT there sits inside an
  // `IS NOT NULL` guard.
  it('never writes a literal NULL into an audit row’s workspace_id', () => {
    const violations: string[] = []
    for (const name of functionNames()) {
      for (const row of auditInsertColumnValues(functionBlock(name))) {
        const workspace = row.workspace_id ?? ''
        if (/^NULL(::UUID)?$/i.test(workspace)) {
          violations.push(
            `public.${name} writes an audit row whose workspace_id is the literal ${workspace} — ` +
              'workspace_audit_log.workspace_id is NOT NULL (migration 182), so that INSERT fails'
          )
        }
      }
    }
    expect(violations).toEqual([])
  })
})

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
    //
    // PRECISION FIX (plan 11), NOT A WEAKENING — the fourth instance of the
    // class of false positive plans 06, 08 and 10 each corrected, and
    // corrected the same way. `CREATE CONSTRAINT TRIGGER <name>` creates a
    // trigger every bit as much as `CREATE TRIGGER <name>` does; the original
    // pattern simply could not see the constraint-trigger spelling, which
    // migration 197 uses for all four of its deferred audit assertions and
    // which section (i) uses to re-create one of them under its own name.
    // Recognising it removes no protection: a DROP naming a trigger this file
    // does not create, in EITHER spelling, is still an offender. Proved by
    // mutation both ways.
    const offenders: string[] = []
    const re = /DROP TRIGGER(?:\s+IF EXISTS)?\s+([a-z0-9_]+)/gi
    let match: RegExpExecArray | null
    while ((match = re.exec(executable)) !== null) {
      const trigger = match[1]
      if (!new RegExp(`CREATE (?:CONSTRAINT )?TRIGGER\\s+${trigger}\\b`).test(executable)) {
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
