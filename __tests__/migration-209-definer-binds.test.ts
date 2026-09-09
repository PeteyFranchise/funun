import { readdirSync, readFileSync } from 'fs'
import path from 'path'

// ─── migration 209 — Tier 2 caller-identity binds on thirteen definers ────
//
// LIMITATION, STATED FIRST, BECAUSE THIS REPO HAS PAID FOR IT TWICE. A
// text-lock test proves what the SQL SAYS, never what a live PostgreSQL DOES.
// Migration 139's suite was green while a second trigger silently broke
// custody transfer. Migration 198's suite was green while its conflict clause
// raised 42702 on the first live call it ever received. Both surfaced only
// under an owner-run behavioural harness.
//
// Behaviour is plan 03's job: its Part A PRE-RUN is a MANDATORY GATE before
// this migration is applied, and its Part B is the only thing that proves the
// binds bite. Nothing in this file asserts that a bind takes effect — only
// that the migration instructs it, against the right parameter name, with the
// service-role escape present and the trigger-depth escape absent.
//
// PARSER DISCIPLINE, AND WHY IT IS NOT OPTIONAL HERE. Migration 209's header
// discusses the trigger-depth branch, `no_block`, policy statements and
// `CREATE OR REPLACE FUNCTION` IN PROSE, because it has to explain why each is
// present or absent. A file-wide assertion run against the UNSTRIPPED text
// would therefore be SELF-INVALIDATING: it would find the very words it exists
// to prohibit, inside the comment explaining the prohibition. That is the same
// defect class `38.0.3-INVENTORY.md` records, where the word "grant" inside a
// prose comment inverted the reported grant posture of every hardened RPC in
// the repo.
//
// So: strip `--` line comments FIRST, and REGION-SCOPE every negative
// assertion to a single function block. Never grep the file as a whole for a
// forbidden token.

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations')
const MIG_209 = '209_definer_helper_caller_binding.sql'

const raw209 = readFileSync(path.join(MIGRATIONS_DIR, MIG_209), 'utf8')

/**
 * Remove every `--` line comment, preserving line count. Single-quote state is
 * tracked WITHIN each line (SQL's `''` escape toggles twice and self-cancels),
 * so a `--` inside a string literal survives. Copied deliberately from
 * `__tests__/migration-208-definer-revokes.test.ts` rather than shared: these
 * two files must be able to disagree about parsing without one silently
 * changing the other's meaning.
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

const sql209 = stripLineComments(raw209)

/** Collapse all runs of whitespace to a single space, and trim. */
function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

// ─── The thirteen, and the three facts that are NOT uniform across them ───
//
// PARAMETER NAMES ARE NOT UNIFORM, AND THIS IS THE HEART OF THE TEST.
// `CREATE OR REPLACE FUNCTION` cannot rename an input parameter, and a bind
// written against a name the function does not have is a SILENT NO-OP that
// reads as a fix. A test that greps for `p_uid` across all thirteen would pass
// on the three functions where the bind does nothing at all.

const IDENTITY_PARAM: Record<string, string> = {
  workspace_project_permission: 'p_uid',
  workspace_member_role: 'p_uid',
  is_workspace_owner: 'p_uid',
  green_room_can_view_post: 'p_viewer', // migration 076:265-266 — NOT p_uid
  workspace_audit_visible: 'p_uid',
  custody_transfer_visible: 'p_uid',
  ownership_transfer_visible: 'p_uid',
  workspace_attachment_visible: 'p_uid',
  workspace_agreement_evidence_visible: 'p_uid',
  workspace_grant_visible_to_member: 'p_uid',
  is_split_sheet_initiator: 'uid', // migration 064:113 — bare `uid`
  is_split_sheet_party: 'uid', // migration 064:128 — bare `uid`
  is_green_room_eligible: 'p_uid',
}

/** Latest-definition-wins. Copying an older body silently reverts behaviour. */
const BODY_SOURCE: Record<string, string> = {
  workspace_project_permission: '197_workspace_structural_integrity.sql', // not 192, not 186
  workspace_member_role: '192_workspace_project_permission_v2.sql', // not 182
  is_workspace_owner: '192_workspace_project_permission_v2.sql', // not 182
  green_room_can_view_post: '076_rename_artist_profiles_to_user_profiles.sql', // not 059, not 057
  workspace_audit_visible: '197_workspace_structural_integrity.sql', // not 186
  custody_transfer_visible: '185_workspace_attachments_custody.sql',
  ownership_transfer_visible: '197_workspace_structural_integrity.sql',
  workspace_attachment_visible: '185_workspace_attachments_custody.sql',
  workspace_agreement_evidence_visible: '183_workspace_roster_relationships.sql',
  workspace_grant_visible_to_member: '184_workspace_permissions_grants.sql',
  is_split_sheet_initiator: '064_fix_split_sheet_rls_recursion.sql',
  is_split_sheet_party: '064_fix_split_sheet_rls_recursion.sql',
  is_green_room_eligible: '087_green_room_eligibility_security_definer.sql',
}

/** Lowercase signature spellings, as used by the prior REVOKE/GRANT pairs. */
const SIGNATURE: Record<string, string> = {
  workspace_project_permission: 'uuid, uuid, text',
  workspace_member_role: 'uuid, uuid',
  is_workspace_owner: 'uuid, uuid',
  green_room_can_view_post: 'uuid, uuid',
  workspace_audit_visible: 'uuid, uuid',
  custody_transfer_visible: 'uuid, uuid',
  ownership_transfer_visible: 'uuid, uuid',
  workspace_attachment_visible: 'uuid, uuid',
  workspace_agreement_evidence_visible: 'uuid, uuid',
  workspace_grant_visible_to_member: 'uuid, uuid',
  is_split_sheet_initiator: 'uuid, uuid',
  is_split_sheet_party: 'uuid, uuid',
  is_green_room_eligible: 'uuid',
}

const BOUND = Object.keys(IDENTITY_PARAM)

/** The one TEXT return of the thirteen — it takes the CASE shape, not a
 *  leading conjunct. A leading `(...) AND` on a TEXT-returning function is a
 *  type error that only surfaces on apply. */
const TEXT_RETURN = 'workspace_member_role'

/** Migration 174's six. This file must not redefine any of them: migrations
 *  146 and 160 have trigger-side callers that depend on 174's third branch. */
const MIGRATION_174_FUNCTIONS = [
  'is_project_owner',
  'project_member_role',
  'is_buyer_org_member',
  'is_work_owner',
  'work_member_tier',
  'idea_access_level',
]

// ─── Region-scoped block extraction ───────────────────────────────────────

type FnBlock = { header: string; body: string; full: string }

/**
 * Every `CREATE OR REPLACE FUNCTION public.<name>(...)` definition in `sql`,
 * split into its header (up to the opening `$$`) and its dollar-quoted body.
 * Returned in file order, so the LAST element is the latest definition.
 */
function findDefs(sql: string, name: string): FnBlock[] {
  const re = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${name}\\s*\\(`, 'g')
  const out: FnBlock[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) {
    const start = m.index
    const bodyOpen = sql.indexOf('$$', start)
    if (bodyOpen < 0) continue
    const bodyClose = sql.indexOf('$$', bodyOpen + 2)
    if (bodyClose < 0) continue
    out.push({
      header: sql.slice(start, bodyOpen),
      body: sql.slice(bodyOpen + 2, bodyClose),
      full: sql.slice(start, bodyClose + 2),
    })
  }
  return out
}

/** The single definition of `name` inside migration 209. */
function block209(name: string): FnBlock {
  const defs = findDefs(sql209, name)
  if (defs.length !== 1) {
    throw new Error(
      `migration 209 defines public.${name} ${defs.length} times; expected exactly 1`
    )
  }
  return defs[0]
}

/** The latest definition of `name` inside its named source migration. */
const sourceCache = new Map<string, string>()
function sourceSql(file: string): string {
  if (!sourceCache.has(file)) {
    sourceCache.set(file, stripLineComments(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')))
  }
  return sourceCache.get(file) as string
}

function sourceBlock(name: string): FnBlock {
  const file = BODY_SOURCE[name]
  const defs = findDefs(sourceSql(file), name)
  if (defs.length === 0) throw new Error(`${file} does not define public.${name}`)
  return defs[defs.length - 1]
}

/** Every top-level statement of migration 209, split on semicolons outside
 *  string literals. */
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
  return out.filter((s) => s.length > 0)
}

const STATEMENTS_209 = statements(sql209)

// The exact bound-predicate shapes, whitespace-collapsed. These strings are
// the contract: the drift guard removes them and asserts what remains is the
// predecessor body byte-for-byte (whitespace-normalised).
function boundGroup(param: string): string {
  return `( ${param} = (SELECT auth.uid()) OR (SELECT auth.role()) = 'service_role' )`
}
function boolPrefix(param: string): string {
  return `SELECT ${boundGroup(param)} AND `
}
function casePrefix(param: string): string {
  return `SELECT CASE WHEN ${param} = (SELECT auth.uid()) OR (SELECT auth.role()) = 'service_role' THEN (`
}
const CASE_SUFFIX = ') ELSE NULL END'

// ══════════════════════════════════════════════════════════════════════════

describe('migration 209 — assertion 0: the parser is doing real work', () => {
  // ANTI-VACUITY. Every negative assertion below is region-scoped and run
  // against the STRIPPED text. These three tests prove that both halves of
  // that sentence matter: the header really does contain the forbidden
  // constructs in prose, and stripping really does remove them. Without this,
  // a header that happened to be clean would make the negatives pass while
  // proving nothing about the stripper.

  it('the RAW header discusses the trigger-depth branch in prose', () => {
    expect(raw209).toContain('pg_trigger_depth')
  })

  it('the RAW header discusses policy statements in prose', () => {
    expect(raw209).toContain('CREATE POLICY')
  })

  it('stripping removes all of it — the stripped text has no prose', () => {
    expect(sql209).not.toContain('pg_trigger_depth')
    expect(sql209).not.toContain('CREATE POLICY')
    // ...while the real SQL survives intact.
    expect(sql209).toContain('CREATE OR REPLACE FUNCTION public.workspace_member_role')
    expect(sql209).toContain("NOTIFY pgrst, 'reload schema'")
  })
})

describe('migration 209 — assertion 1: all thirteen present, and EXACTLY thirteen', () => {
  it.each(BOUND)('%s is redefined exactly once', (fn) => {
    expect(findDefs(sql209, fn)).toHaveLength(1)
  })

  it('the file contains exactly 13 CREATE OR REPLACE FUNCTION statements', () => {
    const count = (sql209.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION/g) || []).length
    // Asserted against the LITERAL 13, not against BOUND.length. That is what
    // catches a fourteenth function being bound without a decision — a
    // length-derived expectation would silently absorb it.
    expect(count).toBe(13)
  })

  it('no bare CREATE FUNCTION (which would fail on an existing function)', () => {
    expect(sql209).not.toMatch(/CREATE\s+FUNCTION/i)
  })

  it('the thirteen names under test are exactly the thirteen Tier-2 helpers', () => {
    expect(BOUND).toHaveLength(13)
    expect(Object.keys(SIGNATURE)).toHaveLength(13)
    expect(Object.keys(BODY_SOURCE)).toHaveLength(13)
  })
})

describe('migration 209 — assertion 2: the identity conjunct names the RIGHT parameter', () => {
  // THE SINGLE MOST LIKELY REAL MISTAKE IN THIS MIGRATION. Parameter names are
  // NOT uniform: `p_uid` on eleven, `p_viewer` on green_room_can_view_post,
  // bare `uid` on the two split-sheet helpers. A bind against the wrong name
  // is a silent no-op that reads as a fix.
  it.each(BOUND)('%s binds its OWN identity parameter to (SELECT auth.uid())', (fn) => {
    const param = IDENTITY_PARAM[fn]
    const body = collapse(block209(fn).body)
    expect(body).toContain(`${param} = (SELECT auth.uid())`)
  })

  it.each(BOUND)('%s does NOT bind a parameter name it does not have', (fn) => {
    const param = IDENTITY_PARAM[fn]
    const body = collapse(block209(fn).body)
    for (const other of ['p_uid', 'p_viewer', 'uid']) {
      if (other === param) continue
      // `uid` is a substring of `p_uid`, so match on a word boundary that also
      // excludes a leading `_` or letter.
      const wrong = new RegExp(`(^|[^\\w])${other} = \\(SELECT auth\\.uid\\(\\)\\)`)
      expect(body).not.toMatch(wrong)
    }
  })

  it('green_room_can_view_post binds p_viewer, never p_uid (migration 076:265-266)', () => {
    const body = collapse(block209('green_room_can_view_post').body)
    expect(body).toContain("p_viewer = (SELECT auth.uid())")
    expect(body).not.toContain('p_uid')
  })

  it.each(['is_split_sheet_initiator', 'is_split_sheet_party'])(
    '%s binds bare `uid`, never p_uid (migration 064:113,128)',
    (fn) => {
      const body = collapse(block209(fn).body)
      expect(body).toContain('uid = (SELECT auth.uid())')
      expect(body).not.toContain('p_uid')
    }
  )
})

describe('migration 209 — assertion 3: the service-role disjunct is present in ALL thirteen (Q1-T2d)', () => {
  it.each(BOUND)('%s carries the service-role escape', (fn) => {
    const body = collapse(block209(fn).body)
    expect(body).toContain("(SELECT auth.role()) = 'service_role'")
  })

  it('green_room_can_view_post carries it — its absence BREAKS A LIVE ROUTE', () => {
    // lib/trust-safety/reports.ts:179 calls this through the SERVICE client
    // with a viewer who is not the caller. On a service connection auth.uid()
    // is NULL, so a strict bind returns false for every input, silently, and
    // the moderation queue shows nothing.
    const body = collapse(block209('green_room_can_view_post').body)
    expect(body).toContain("(SELECT auth.role()) = 'service_role'")
  })
})

describe('migration 209 — assertion 4: the trigger-depth escape is in NONE of the thirteen', () => {
  // Region-scoped, NOT file-wide: the header legitimately explains the
  // omission in prose (assertion 0 proves it does), and a file-wide negative
  // would be self-invalidating. The sibling assertion (c) in
  // __tests__/rls-helper-callsites.test.ts is what KEEPS this safe — it fails
  // if any trigger function ever calls one of these thirteen.
  it.each(BOUND)('%s does not call the trigger-depth builtin', (fn) => {
    const { full } = block209(fn)
    expect(full).not.toContain('pg_trigger_depth')
  })
})

describe('migration 209 — assertion 5: workspace_member_role uses the CASE shape', () => {
  const { body } = block209(TEXT_RETURN)
  const collapsed = collapse(body)

  it('is the only TEXT return of the thirteen', () => {
    expect(block209(TEXT_RETURN).header).toMatch(/RETURNS\s+TEXT/i)
    for (const fn of BOUND) {
      if (fn === TEXT_RETURN) continue
      expect(block209(fn).header).toMatch(/RETURNS\s+BOOLEAN/i)
    }
  })

  it.each(['CASE', 'WHEN', 'THEN', 'ELSE NULL', 'END'])('body contains %s', (kw) => {
    expect(collapsed).toContain(kw)
  })

  it('body does NOT use a leading conjunct — `) AND` would be a type error', () => {
    expect(collapsed).not.toContain(') AND')
  })

  it('the other twelve DO use the leading conjunct', () => {
    for (const fn of BOUND) {
      if (fn === TEXT_RETURN) continue
      expect(collapse(block209(fn).body)).toContain(`${boundGroup(IDENTITY_PARAM[fn])} AND`)
    }
  })
})

describe('migration 209 — assertion 6: DRIFT GUARD — body == predecessor + the bind, nothing else', () => {
  // This is the assertion that makes a thirteen-function migration reviewable
  // at a glance. It proves that NOTHING ELSE changed inside several hundred
  // lines of copied body: no qualification change, no formatting rewrite, no
  // "while I am here" fix.

  it.each(BOUND.filter((f) => f !== TEXT_RETURN))(
    '%s: removing the bound predicate yields the source migration body verbatim',
    (fn) => {
      const param = IDENTITY_PARAM[fn]
      const newBody = collapse(block209(fn).body)
      const oldBody = collapse(sourceBlock(fn).body)
      const prefix = boolPrefix(param)
      expect(newBody.startsWith(prefix)).toBe(true)
      const unbound = 'SELECT ' + newBody.slice(prefix.length)
      expect(unbound).toBe(oldBody)
    }
  )

  it(`${TEXT_RETURN}: unwrapping the CASE yields migration 192's body verbatim`, () => {
    const param = IDENTITY_PARAM[TEXT_RETURN]
    const newBody = collapse(block209(TEXT_RETURN).body)
    const oldBody = collapse(sourceBlock(TEXT_RETURN).body)
    const prefix = casePrefix(param)
    expect(newBody.startsWith(prefix)).toBe(true)
    expect(newBody.endsWith(CASE_SUFFIX)).toBe(true)
    const inner = newBody.slice(prefix.length, newBody.length - CASE_SUFFIX.length).trim()
    expect(inner).toBe(oldBody)
  })

  it('every named source really is the LATEST definition (latest-definition-wins)', () => {
    // Anti-vacuity for the guard above: if BODY_SOURCE named an older
    // migration, the diff would still pass while the migration silently
    // reverted behaviour. This proves no migration below 209 redefines any of
    // the thirteen after its named source.
    //
    // THE CORPUS IS BOUNDED ABOVE BY 209 ITSELF, and that bound is the
    // assertion's own stated intent ("no migration BELOW 209"), not a
    // convenience. It also matches the precedent in
    // `__tests__/migration-208-definer-revokes.test.ts`, whose latest-posture
    // scan is bounded the same way.
    //
    // It became load-bearing in phase 38.0.3 plan 05: migration 210 relocates
    // `no_block` and, in doing so, legitimately REPLACES
    // `green_room_can_view_post` — carrying 209's bound body forward with the
    // helper re-qualified. Without the bound, this assertion would report 210
    // as the "wrong source" for a migration authored before 210 existed, which
    // is a question about the future that 209 cannot answer.
    //
    // The forward direction is not left unguarded: that 210's replacement
    // still carries 209's Tier-2 binding (rather than reverting to migration
    // 076's body) is assertion 10 of
    // `__tests__/migration-210-no-block-relocation.test.ts`. Any FUTURE
    // migration that redefines one of the thirteen owes the repo the same
    // treatment — its own drift guard, in its own test file.
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && f < MIG_209)
      .sort()
    for (const fn of BOUND) {
      const defining = files.filter((f) => findDefs(sourceSql(f), fn).length > 0)
      expect(defining.length).toBeGreaterThan(0)
      expect(defining[defining.length - 1]).toBe(BODY_SOURCE[fn])
    }
  })
})

describe('migration 209 — assertion 7: every function keeps its four attributes and its return type', () => {
  it.each(BOUND)('%s keeps LANGUAGE sql STABLE SECURITY DEFINER SET search_path = %s', (fn) => {
    const { header } = block209(fn)
    expect(header).toContain('LANGUAGE sql')
    expect(header).toContain('STABLE')
    expect(header).toContain('SECURITY DEFINER')
    expect(header).toContain("SET search_path = ''")
  })

  it.each(BOUND)('%s keeps the return type its source migration declares', (fn) => {
    const newReturn = (block209(fn).header.match(/RETURNS\s+(\w+)/i) || [])[1]
    const oldReturn = (sourceBlock(fn).header.match(/RETURNS\s+(\w+)/i) || [])[1]
    expect(newReturn).toBeDefined()
    expect(oldReturn).toBeDefined()
    // is_green_room_eligible declares `boolean` in lowercase — normalise case
    // before comparing, but the type itself must be unchanged.
    expect(newReturn.toLowerCase()).toBe(oldReturn.toLowerCase())
  })

  it('is_green_room_eligible reproduces its lowercase header as it is', () => {
    const { header } = block209('is_green_room_eligible')
    expect(header).toContain('p_uid uuid')
    expect(header).toContain('RETURNS boolean')
  })

  it.each(BOUND)('%s keeps its source migration parameter list character-for-character', (fn) => {
    const params = (h: string) => collapse((h.match(/\(([\s\S]*?)\)\s*RETURNS/i) || [])[1] || '')
    expect(params(block209(fn).header)).toBe(params(sourceBlock(fn).header))
  })
})

describe('migration 209 — assertion 8: grant posture restated for all thirteen', () => {
  function revokes(fn: string): string[] {
    return STATEMENTS_209.filter((s) =>
      new RegExp(`^REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\s*\\(`, 'i').test(s.trim())
    )
  }
  function grants(fn: string): string[] {
    return STATEMENTS_209.filter((s) =>
      new RegExp(`^GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\s*\\(`, 'i').test(s.trim())
    )
  }

  it.each(BOUND)('%s has exactly one REVOKE naming PUBLIC, anon AND authenticated', (fn) => {
    const rs = revokes(fn)
    expect(rs).toHaveLength(1)
    const from = collapse(rs[0].split(/\bFROM\b/i)[1] || '')
    // All three named explicitly. `REVOKE ... FROM PUBLIC` does NOT remove
    // Supabase's DIRECT grants to anon/authenticated — the migration-047
    // defect that stayed invisible for two years.
    expect(from).toContain('PUBLIC')
    expect(from).toContain('anon')
    expect(from).toContain('authenticated')
  })

  it.each(BOUND)('%s has exactly one GRANT, to authenticated', (fn) => {
    const gs = grants(fn)
    expect(gs).toHaveLength(1)
    const to = collapse(gs[0].split(/\bTO\b/i)[1] || '')
    expect(to).toBe('authenticated')
  })

  it('there are exactly 13 REVOKE and 13 GRANT statements in the file', () => {
    const allRevokes = STATEMENTS_209.filter((s) => /^REVOKE\b/i.test(s.trim()))
    const allGrants = STATEMENTS_209.filter((s) => /^GRANT\b/i.test(s.trim()))
    expect(allRevokes).toHaveLength(13)
    expect(allGrants).toHaveLength(13)
  })

  it('nothing anywhere is granted to anon or to PUBLIC', () => {
    for (const s of STATEMENTS_209) {
      if (!/^GRANT\b/i.test(s.trim())) continue
      const to = collapse(s.split(/\bTO\b/i)[1] || '')
      expect(to).not.toMatch(/\banon\b/)
      expect(to).not.toMatch(/\bPUBLIC\b/)
    }
  })
})

describe('migration 209 — assertion 9: signature fidelity against the most recent prior statement', () => {
  // A REVOKE or GRANT against a signature that does not exist is a SILENT
  // NO-OP, and a silent no-op is the exact failure mode this phase exists to
  // fix. The comparison is against the function's most recent PRIOR
  // revoke/grant anywhere in the corpus, not against a hand-copied constant.
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && f !== MIG_209)
    .sort()

  function priorArgs(fn: string): { file: string; args: string } | null {
    let found: { file: string; args: string } | null = null
    for (const f of files) {
      const re = new RegExp(
        `(?:REVOKE|GRANT)\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\s*\\(([^)]*)\\)`,
        'gi'
      )
      let m: RegExpExecArray | null
      const s = sourceSql(f)
      while ((m = re.exec(s)) !== null) found = { file: f, args: collapse(m[1]).toLowerCase() }
    }
    return found
  }

  it.each(BOUND)('%s: 209 uses the same argument list as its most recent prior statement', (fn) => {
    const prior = priorArgs(fn)
    // Anti-vacuity: a null prior would make the comparison trivially pass.
    expect(prior).not.toBeNull()
    const mine = new RegExp(
      `REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\s*\\(([^)]*)\\)`,
      'i'
    ).exec(sql209)
    expect(mine).not.toBeNull()
    const mineArgs = collapse((mine as RegExpExecArray)[1]).toLowerCase()
    expect(mineArgs).toBe((prior as { args: string }).args)
    // ...and it matches the signature this test independently declares.
    expect(mineArgs).toBe(SIGNATURE[fn])
  })

  it.each(BOUND)('%s: the GRANT signature equals the REVOKE signature', (fn) => {
    const grab = (kw: string) =>
      collapse(
        (new RegExp(
          `${kw}\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\s*\\(([^)]*)\\)`,
          'i'
        ).exec(sql209) || [])[1] || 'MISSING'
      ).toLowerCase()
    expect(grab('GRANT')).toBe(grab('REVOKE'))
    expect(grab('GRANT')).toBe(SIGNATURE[fn])
  })
})

describe('migration 209 — assertion 10: no_block is NOT bound here (owner decision D4)', () => {
  // SCOPE NOTE, RECORDED BECAUSE THE PLAN'S WORDING CANNOT BE TAKEN LITERALLY.
  // Plan 02 assertion 10 says "`no_block` appears nowhere in the file". Taken
  // as raw text that is IMPOSSIBLE and would contradict Task 1: migration
  // 076's green_room_can_view_post body — which Task 1 requires be copied
  // VERBATIM — calls `public.no_block(p_viewer, p.author_id)`. The plan's own
  // key_links say so.
  //
  // So the assertion is implemented as what it means: no_block must not be
  // DEFINED, REVOKED, GRANTED or DROPPED here, and its ONLY appearance is that
  // one load-bearing call. The exact-count lock below is strictly stronger
  // than a raw-absence grep, and it still goes RED on the plan's mutation
  // (adding a no_block replace to the file).

  it('no_block is not redefined', () => {
    expect(findDefs(sql209, 'no_block')).toHaveLength(0)
    expect(sql209).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.no_block/i)
  })

  it('no_block is not revoked, granted or dropped', () => {
    expect(sql209).not.toMatch(/REVOKE[\s\S]{0,80}?FUNCTION\s+public\.no_block/i)
    expect(sql209).not.toMatch(/GRANT[\s\S]{0,80}?FUNCTION\s+public\.no_block/i)
    expect(sql209).not.toMatch(/DROP\s+FUNCTION[\s\S]{0,40}?no_block/i)
  })

  it('no_block appears exactly ONCE, as the call inside green_room_can_view_post', () => {
    const occurrences = (sql209.match(/no_block/g) || []).length
    expect(occurrences).toBe(1)
    expect(collapse(block209('green_room_can_view_post').body)).toContain(
      'public.no_block(p_viewer, p.author_id)'
    )
  })
})

describe('migration 209 — assertion 11: Tier 2 edits NO policy', () => {
  it.each(['CREATE POLICY', 'ALTER POLICY', 'DROP POLICY'])(
    'the stripped text contains zero %s statements',
    (kw) => {
      expect(sql209.toUpperCase()).not.toContain(kw)
    }
  )

  it('no statement in the file is a policy statement', () => {
    for (const s of STATEMENTS_209) {
      expect(s.trim().toUpperCase()).not.toMatch(/^(CREATE|ALTER|DROP)\s+POLICY\b/)
    }
  })
})

describe('migration 209 — assertion 12: migration 174 is untouched', () => {
  // Migrations 146 and 160 have trigger-side callers that still depend on
  // 174's pg_trigger_depth branch. Redefining one of its six here — even
  // "helpfully", to drop that branch — would break them.
  it.each(MIGRATION_174_FUNCTIONS)('%s is not redefined by migration 209', (fn) => {
    expect(findDefs(sql209, fn)).toHaveLength(0)
  })
})

describe('migration 209 — assertion 13: no cascading drop, and the reload notify is last', () => {
  it('no cascading modifier anywhere in the stripped text', () => {
    // With RLS enabled, cascading a policy away leaves the table DEFAULT-DENY
    // — a silent total read outage, not an opening.
    expect(sql209.toUpperCase()).not.toContain('CASCADE')
  })

  it('no DROP statement of any kind', () => {
    for (const s of STATEMENTS_209) expect(s.trim().toUpperCase()).not.toMatch(/^DROP\b/)
  })

  it("the last non-empty stripped line is NOTIFY pgrst, 'reload schema';", () => {
    const lines = sql209.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    expect(lines[lines.length - 1]).toBe("NOTIFY pgrst, 'reload schema';")
  })

  it('the last statement is the reload notify', () => {
    expect(STATEMENTS_209[STATEMENTS_209.length - 1].trim()).toBe("NOTIFY pgrst, 'reload schema'")
  })
})
