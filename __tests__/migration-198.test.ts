import { readFileSync } from 'fs'
import path from 'path'

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
  while ((match = LOCK_CLAUSE.exec(masked)) !== null) {
    const line = masked.slice(0, match.index).split('\n').length - 1
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
      // UPDATE and would otherwise be read as an UPDATE target.
      const body = functionBlock(name).replace(LOCK_CLAUSE, ' ')
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
