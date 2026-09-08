import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'

// ─── RLS helper call-site invariant — Phase 38.0.3 ────────────────────────
//
// WHY THIS FILE EXISTS, STATED FIRST. Migration 174 bound six helpers to
// auth.uid() without enumerating every caller of those helpers. One caller was
// a trigger: review_work_version_comment_carry (migration 160) has silently
// stripped cross-user @mentions ever since, because a bound helper answers
// "false" to a question asked ON BEHALF OF somebody else and a trigger has no
// auth.uid() to be. Nothing caught it. A one-off analysis cannot catch the
// next one; a standing test can.
//
// So this file re-derives, on every `npm test`, the finding the whole
// three-tier design of Phase 38.0.3 rests on:
//
//   (a) every RLS-policy call site of every helper Tier 2 will bind already
//       passes the CALLER'S OWN identity — `auth.uid()` — at the identity
//       argument position, so binding those helpers changes no policy's
//       behaviour and no policy has to be edited;
//   (b) the four Tier-1 helpers are named by ZERO policies, which is the
//       entire justification for revoking EXECUTE on them;
//   (c) no CURRENT trigger function calls a Tier-2 helper, which is what
//       makes it safe for the Tier-2 binding migration to omit migration
//       174's pg_trigger_depth() escape branch;
//   (d) the only application .rpc() call sites are the two known
//       service-client ones, which is what keeps the service_role disjunct
//       in the Tier-2 bind honest.
//
// THE TRAP, AND THIS TEST'S ROLE IN IT. `38.0.3-SCOPE.md` states in capitals:
// do NOT blanket-revoke EXECUTE from `authenticated`. RLS policy expressions
// are evaluated with the privileges of the QUERYING role, so revoking a helper
// that a policy calls breaks every read gated by that policy. That rule is
// correct and this test does not weaken it. It sharpens it:
//
//   A revoke is permitted only for a function whose POLICY CALL-SITE COUNT IS
//   PROVEN ZERO, and the proof must be a test in the repo — assertion (b)
//   below — not a claim in a plan.
//
// If assertion (b) ever goes red, the Tier-1 revoke migration became wrong
// retroactively and a policy somewhere is about to fail with permission
// denied.
//
// PARSER DISCIPLINE. Line comments are stripped FIRST and unconditionally.
// `38.0.3-INVENTORY.md` records a parser defect where the word "grant" inside
// a prose comment inverted the reported grant posture of every hardened RPC in
// the repo — before the fix, that document would have claimed every Phase 38
// hardening was wide open. Dollar-quoted regions are then mapped so a call
// site can be classified as INSIDE A FUNCTION BODY versus INSIDE A POLICY,
// because those two have opposite security consequences: a definer body runs
// as the function OWNER and needs no EXECUTE from the caller, a policy does.

// ─── Corpus ───────────────────────────────────────────────────────────────

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations')

/** Every migration, filename-sorted. Nothing is excluded: a migration added
 *  tomorrow is picked up automatically and cannot slip past the invariant. */
function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

const CORPUS: { file: string; sql: string }[] = migrationFiles().map((file) => ({
  file,
  sql: readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'),
}))

// ─── The three tiers ──────────────────────────────────────────────────────

/** Tier 1 — revoked/dropped outright because ZERO policies name them. */
const TIER1 = [
  'workspace_access_enabled',
  'workspace_grant_lineage_live',
  'green_room_post_matches_custom_audience',
  'workspace_roster_relationship_is_live',
] as const

/** Tier 2 — bound to auth.uid() by plan 02. Policies DO name these, so they
 *  keep their EXECUTE grant; the body, not the grant, does the work. */
const TIER2 = [
  'workspace_project_permission',
  'workspace_member_role',
  'is_workspace_owner',
  'green_room_can_view_post',
  'workspace_audit_visible',
  'custody_transfer_visible',
  'ownership_transfer_visible',
  'workspace_attachment_visible',
  'workspace_agreement_evidence_visible',
  'workspace_grant_visible_to_member',
  'is_split_sheet_initiator',
  'is_split_sheet_party',
  'is_green_room_eligible',
] as const

/** Tier 3 — relocated rather than bound (owner decision D4), because
 *  no_block(a,b) is symmetric and any bind that permits the policy path also
 *  answers "did X block me?", re-opening threat T-08-03. */
const TIER3 = ['no_block'] as const

/**
 * ZERO-BASED index of the caller-supplied IDENTITY argument, per helper.
 *
 * These are NOT uniform, and getting one wrong is precisely how this test
 * would pass while proving nothing — it would be reading a row-derived id
 * (a project_id, a post_id) and cheerfully confirming it is not auth.uid().
 *
 *   - eleven two-argument helpers and the one three-argument helper take
 *     (row_id, uid[, permission])            -> index 1
 *   - is_green_room_eligible takes (uid)     -> index 0
 *   - no_block(a, b) takes the VIEWER FIRST  -> index 0
 */
const IDENTITY_INDEX: Record<string, number> = {
  workspace_project_permission: 1,
  workspace_member_role: 1,
  is_workspace_owner: 1,
  green_room_can_view_post: 1,
  workspace_audit_visible: 1,
  custody_transfer_visible: 1,
  ownership_transfer_visible: 1,
  workspace_attachment_visible: 1,
  workspace_agreement_evidence_visible: 1,
  workspace_grant_visible_to_member: 1,
  is_split_sheet_initiator: 1,
  is_split_sheet_party: 1,
  is_green_room_eligible: 0,
  no_block: 0,
}

// ─── Parser ───────────────────────────────────────────────────────────────

/**
 * Step 1, and it is first for a reason (see the header): remove every `--`
 * line comment. Line count is preserved so offsets stay reportable.
 *
 * Single-quote state is tracked WITHIN each line (with SQL's `''` escape,
 * which toggles twice and therefore self-cancels) so that a `--` inside a
 * string literal — this repo's COMMENT ON bodies are full of prose dashes —
 * is not mistaken for the start of a comment.
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
        if (!inString && ch === '-' && line[i + 1] === '-') {
          return line.slice(0, i)
        }
      }
      return line
    })
    .join('\n')
}

/** Step 2: character ranges of every `$$ … $$` / `$TAG$ … $TAG$` region. */
function dollarRegions(sql: string): { start: number; end: number }[] {
  const marker = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/g
  const regions: { start: number; end: number }[] = []
  const openers: { tag: string; index: number; length: number }[] = []
  let m: RegExpExecArray | null

  while ((m = marker.exec(sql)) !== null) {
    openers.push({ tag: m[1] ?? '', index: m.index, length: m[0].length })
  }

  let i = 0
  while (i < openers.length) {
    const open = openers[i]
    let j = i + 1
    while (j < openers.length && openers[j].tag !== open.tag) j++
    if (j >= openers.length) break
    regions.push({ start: open.index, end: openers[j].index + openers[j].length })
    i = j + 1
  }
  return regions
}

function insideAny(regions: { start: number; end: number }[], index: number): boolean {
  return regions.some((r) => index >= r.start && index < r.end)
}

type PolicyStatement = { name: string; table: string; text: string; offset: number }

/**
 * Step 3: every CREATE/ALTER POLICY statement that begins at TOP LEVEL — i.e.
 * outside every dollar-quoted region. Anchored at line start so a mention of
 * the words inside a quoted COMMENT body cannot masquerade as a statement.
 */
function policyStatements(sql: string): PolicyStatement[] {
  const regions = dollarRegions(sql)
  const header = /^[ \t]*(?:CREATE|ALTER)\s+POLICY\s+(?:IF\s+NOT\s+EXISTS\s+)?("[^"]+"|[A-Za-z0-9_]+)([\s\S]*?)\bON\s+((?:[A-Za-z0-9_]+\.)?[A-Za-z0-9_]+)/gim
  const out: PolicyStatement[] = []
  let m: RegExpExecArray | null

  while ((m = header.exec(sql)) !== null) {
    const start = m.index
    if (insideAny(regions, start)) continue

    // Scan forward to the terminating semicolon, skipping string literals and
    // any dollar-quoted region.
    let i = m.index
    let inString = false
    let end = sql.length
    while (i < sql.length) {
      if (insideAny(regions, i)) {
        i++
        continue
      }
      const ch = sql[i]
      if (ch === "'") inString = !inString
      else if (ch === ';' && !inString) {
        end = i + 1
        break
      }
      i++
    }

    out.push({
      name: m[1].replace(/"/g, ''),
      table: m[3],
      text: sql.slice(start, end),
      offset: start,
    })
    header.lastIndex = end
  }
  return out
}

/**
 * Step 4: the BALANCED argument list of every call to `fnName`, qualified or
 * bare, split on TOP-LEVEL commas only.
 *
 * A naive split(',') is wrong against real call sites in this repo:
 * dmt_insert_participant passes
 *   no_block(auth.uid(), CASE WHEN a_id = auth.uid() THEN b_id ELSE a_id END)
 * and several policies nest scalar subselects inside an argument.
 */
function callArgs(statement: string, fnName: string): string[][] {
  const opener = new RegExp(`(?:\\bpublic\\s*\\.\\s*)?\\b${fnName}\\s*\\(`, 'gi')
  const out: string[][] = []
  let m: RegExpExecArray | null

  while ((m = opener.exec(statement)) !== null) {
    // Reject a longer identifier that merely ENDS with fnName.
    const prev = statement[m.index - 1]
    if (prev && /[A-Za-z0-9_]/.test(prev)) continue

    let i = m.index + m[0].length
    let depth = 1
    let inString = false
    const args: string[] = []
    let current = ''

    while (i < statement.length && depth > 0) {
      const ch = statement[i]
      if (ch === "'") {
        inString = !inString
        current += ch
      } else if (inString) {
        current += ch
      } else if (ch === '(') {
        depth++
        current += ch
      } else if (ch === ')') {
        depth--
        if (depth === 0) break
        current += ch
      } else if (ch === ',' && depth === 1) {
        args.push(current)
        current = ''
      } else {
        current += ch
      }
      i++
    }
    args.push(current)
    out.push(args.map((a) => a.trim()).filter((a, idx) => !(idx === 0 && a === '')))
    opener.lastIndex = i
  }
  return out
}

type FunctionDef = { name: string; returns: string; body: string }

/** Step 5: every CREATE [OR REPLACE] FUNCTION, with its return type and body. */
function functionDefs(sql: string): FunctionDef[] {
  const regions = dollarRegions(sql)
  const header = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\s*\.\s*)?([A-Za-z0-9_]+)\s*\(/gi
  const out: FunctionDef[] = []
  let m: RegExpExecArray | null

  while ((m = header.exec(sql)) !== null) {
    if (insideAny(regions, m.index)) continue
    const body = regions.find((r) => r.start > m!.index)
    const between = sql.slice(m.index, body ? body.start : m.index + 400)
    const returns = /\bRETURNS\s+(?:TABLE\s*\(|SETOF\s+)?([A-Za-z0-9_]+)/i.exec(between)
    out.push({
      name: m[1],
      returns: (returns?.[1] ?? 'unknown').toUpperCase(),
      body: body ? sql.slice(body.start, body.end) : '',
    })
  }
  return out
}

const STRIPPED: { file: string; sql: string }[] = CORPUS.map(({ file, sql }) => ({
  file,
  sql: stripLineComments(sql),
}))

type Site = { file: string; policy: string; table: string; args: string[] }

/** Every POLICY call site of `fnName`, across the whole corpus. */
function policyCallSites(fnName: string): Site[] {
  const out: Site[] = []
  for (const { file, sql } of STRIPPED) {
    for (const stmt of policyStatements(sql)) {
      for (const args of callArgs(stmt.text, fnName)) {
        out.push({ file, policy: stmt.name, table: stmt.table, args })
      }
    }
  }
  return out
}

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()

// ─── Assertion (a) — every policy call site passes the CALLER'S identity ──
//
// Locked per-helper counts. These are the measured baseline and they are
// asserted EXACTLY, not as ">= 0", so that a parser which silently matches
// nothing fails loudly instead of passing vacuously. Tier-2's counts are
// stable across the rest of Phase 38.0.3: plan 02 replaces function BODIES
// and touches no policy.
const TIER2_EXPECTED_SITES: Record<(typeof TIER2)[number], number> = {
  workspace_project_permission: 18,
  workspace_member_role: 13,
  is_workspace_owner: 6,
  green_room_can_view_post: 12,
  workspace_audit_visible: 1,
  custody_transfer_visible: 1,
  ownership_transfer_visible: 1,
  workspace_attachment_visible: 1,
  workspace_agreement_evidence_visible: 1,
  workspace_grant_visible_to_member: 1,
  is_split_sheet_initiator: 1,
  is_split_sheet_party: 1,
  is_green_room_eligible: 1,
}

const TIER2_EXPECTED_TOTAL = 58

describe('(a) every RLS-policy call site passes auth.uid() as the identity argument', () => {
  it.each([...TIER2, ...TIER3])(
    '%s — identity argument is auth.uid() at every policy call site',
    (fn) => {
      const idx = IDENTITY_INDEX[fn]
      expect(idx).toBeDefined()

      const offenders = policyCallSites(fn)
        .filter((s) => norm(s.args[idx] ?? '') !== 'auth.uid()')
        .map(
          (s) =>
            `${s.file} :: policy "${s.policy}" on ${s.table} :: ` +
            `${fn}(${s.args.join(', ')}) -> argument[${idx}] = ${JSON.stringify(
              s.args[idx] ?? '<missing>'
            )}`
        )

      // A policy that passes anything other than auth.uid() here means the
      // Tier-2 bind would CHANGE that policy's answer, and the phase's
      // "no policy is edited" claim is false.
      expect(offenders).toEqual([])
    }
  )

  it.each(Object.entries(TIER2_EXPECTED_SITES))(
    '%s is named by exactly %i policy call sites — anti-vacuity lock',
    (fn, expected) => {
      expect(policyCallSites(fn)).toHaveLength(expected as number)
    }
  )

  it('finds 58 Tier-2 policy call sites in total', () => {
    const total = TIER2.reduce((n, fn) => n + policyCallSites(fn).length, 0)
    expect(total).toBe(TIER2_EXPECTED_TOTAL)
  })

  it('finds no_block policy call sites (15 today; plan 05 relocates it)', () => {
    // NOT locked to an exact number on purpose. Owner decision D4 relocates
    // no_block to a non-exposed schema, which rewrites these policies to call
    // private.no_block and will legitimately drive this count to zero in
    // public. Until then it must not be zero, or assertion (a) above is
    // vacuous for the one helper D4 says is the most sensitive.
    expect(policyCallSites('no_block').length).toBeGreaterThan(0)
  })

  it('the policy parser actually finds policies — self-check', () => {
    // A regex that matches nothing would make every assertion in this file
    // pass while proving nothing at all. Anchor on files known to create
    // policies, and on the corpus total.
    const total = STRIPPED.reduce((n, { sql }) => n + policyStatements(sql).length, 0)
    expect(total).toBeGreaterThan(200)

    for (const file of [
      '060_green_room_block_visibility_and_audience_roles.sql',
      '183_workspace_roster_relationships.sql',
      '197_workspace_structural_integrity.sql',
    ]) {
      const entry = STRIPPED.find((e) => e.file === file)
      expect(entry).toBeDefined()
      expect(policyStatements(entry!.sql).length).toBeGreaterThan(0)
    }
  })

  it('strips line comments before parsing — self-check', () => {
    // The INVENTORY's parser defect, reproduced as a guard: the word inside a
    // comment must not survive into the parsed text.
    const sample = "REVOKE EXECUTE ON FUNCTION f() FROM PUBLIC; -- GRANT to anon, authenticated\n"
    expect(stripLineComments(sample)).not.toContain('GRANT')
    // ...but a dash inside a string literal must survive.
    const quoted = "COMMENT ON FUNCTION f() IS 'a -- b';\n"
    expect(stripLineComments(quoted)).toContain("'a -- b'")
  })
})

// ─── Assertion (b) — the Tier-1 four are named by ZERO policies ───────────

describe('(b) the Tier-1 helpers are named by ZERO RLS policies', () => {
  it.each(TIER1)('%s has no policy call site anywhere in the corpus', (fn) => {
    const sites = policyCallSites(fn).map(
      (s) => `${s.file} :: policy "${s.policy}" on ${s.table} :: ${fn}(${s.args.join(', ')})`
    )

    // THIS IS THE ENTIRE JUSTIFICATION FOR THE TIER-1 REVOKE MIGRATION.
    //
    // `38.0.3-SCOPE.md`'s TRAP rule says a plan that blanket-revokes EXECUTE
    // from `authenticated` is wrong. Tier 1 is its ONE DOCUMENTED EXEMPTION,
    // and this assertion is the exemption's proof: these four functions are
    // named by no policy, so their only callers are SECURITY DEFINER bodies,
    // which execute with the privileges of the function OWNER and never need
    // an EXECUTE grant from the caller.
    //
    // A NON-ZERO COUNT HERE MEANS THE TIER-1 REVOKE MIGRATION IS WRONG AND A
    // POLICY IS ABOUT TO FAIL WITH `42501 permission denied for function`.
    // Do not "fix" this test by deleting the helper from TIER1. Fix it by
    // reverting the revoke for that helper and binding it instead.
    expect(sites).toEqual([])
  })
})

// ─── Assertion (c) — no CURRENT trigger function calls a Tier-2 helper ────

/**
 * Latest-definition-wins fold. This is NOT a stylistic preference.
 *
 * Migration 185 defined guard_custody_transfer_offered_by_holder() calling
 * workspace_member_role(NEW.workspace_id, NEW.offered_by) — a genuinely
 * cross-user call that a bind WOULD have broken. Migration 187 replaced that
 * function and removed the call. Scanning historical text produces a false
 * positive that would have derailed Tier 2 entirely.
 */
function currentFunctionDefs(files: { file: string; sql: string }[]): Map<string, FunctionDef> {
  const latest = new Map<string, FunctionDef>()
  for (const { sql } of files) {
    for (const def of functionDefs(sql)) latest.set(def.name, def)
  }
  return latest
}

describe('(c) no current trigger function calls a Tier-2 helper', () => {
  it('every RETURNS TRIGGER function, at its latest definition, is free of Tier-2 calls', () => {
    const latest = currentFunctionDefs(STRIPPED)
    const triggers = [...latest.values()].filter((d) => d.returns === 'TRIGGER')

    expect(triggers.length).toBeGreaterThan(20) // anti-vacuity

    const offenders: string[] = []
    for (const def of triggers) {
      for (const fn of TIER2) {
        if (callArgs(def.body, fn).length > 0) {
          offenders.push(`${def.name}() calls ${fn}()`)
        }
      }
    }

    // A trigger has no auth.uid() to be. If one of them calls a Tier-2 helper,
    // then OMITTING migration 174's pg_trigger_depth() > 0 escape branch from
    // the Tier-2 binding migration (plan 02) IS NO LONGER SAFE — the bound
    // helper will answer `false`/NULL inside that trigger and the trigger will
    // silently do the wrong thing. That is exactly how migration 160's
    // review_work_version_comment_carry came to strip cross-user mentions.
    expect(offenders).toEqual([])
  })

  it('latest-definition-wins is actually doing work — regression anchor', () => {
    // Migration 185's definition of the guard DID call workspace_member_role.
    // If this stops being true, the fold above is no longer being exercised by
    // any real case and mutation #4 in the plan would be untestable.
    const m185 = STRIPPED.find((e) => e.file === '185_workspace_attachments_custody.sql')
    expect(m185).toBeDefined()
    const historic = functionDefs(m185!.sql).find(
      (d) => d.name === 'guard_custody_transfer_offered_by_holder'
    )
    expect(historic).toBeDefined()
    expect(callArgs(historic!.body, 'workspace_member_role').length).toBeGreaterThan(0)

    // ...and migration 187 replaced it, removing the call. That replacement is
    // what makes the CURRENT picture clean.
    const current = currentFunctionDefs(STRIPPED).get('guard_custody_transfer_offered_by_holder')
    expect(current).toBeDefined()
    expect(callArgs(current!.body, 'workspace_member_role')).toHaveLength(0)
  })
})

// ─── Assertion (d) — exactly two application .rpc() call sites ────────────

const ALL_HELPERS = [...TIER1, ...TIER2, ...TIER3]

function sourceFiles(): string[] {
  const roots = ['app', 'lib', 'components'].map((d) => path.join(process.cwd(), d))
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next') continue
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry)) out.push(full)
    }
  }
  for (const root of roots) walk(root)
  return out.sort()
}

describe('(d) the only application .rpc() call sites are the two known service-client ones', () => {
  it('finds exactly two, and they are the expected pair', () => {
    const found: string[] = []
    for (const file of sourceFiles()) {
      const text = readFileSync(file, 'utf8')
      for (const fn of ALL_HELPERS) {
        const re = new RegExp(`\\.rpc\\(\\s*['"\`]${fn}['"\`]`, 'g')
        const hits = text.match(re) ?? []
        for (let i = 0; i < hits.length; i++) {
          found.push(`${path.relative(process.cwd(), file)} -> ${fn}`)
        }
      }
    }

    // This assertion is what keeps the `auth.role() = 'service_role'` disjunct
    // in the Tier-2 bind honest. Both known call sites use a SERVICE client,
    // for which auth.uid() is NULL — so the bind must let service_role
    // through. A THIRD call site appearing, especially one using a
    // user-scoped client, is a decision somebody must make deliberately
    // rather than discover in production.
    expect(found.sort()).toEqual([
      'lib/green-room/placements-admin.ts -> no_block',
      'lib/trust-safety/reports.ts -> green_room_can_view_post',
    ])
    expect(found).toHaveLength(2)
  })
})
