import { readFileSync } from 'fs'
import path from 'path'

// ─── migration 210 — Tier 3: relocating `no_block` out of `public` ────────
//
// LIMITATION, STATED FIRST, BECAUSE THIS REPO HAS PAID FOR IT TWICE. A
// text-lock test proves what the SQL SAYS, never what a live PostgreSQL DOES.
// Migration 139's suite was green while a second trigger silently broke
// custody transfer. Migration 198's suite was green while its conflict clause
// raised 42702 on the first live call it ever received. Both surfaced only
// under an owner-run behavioural harness.
//
// Nothing in this file proves that the relocated helper is reachable, that the
// eleven policies still enforce blocks, or that the `public` copy is gone.
// That is plan 06's job: `38.0.3-VERIFY-A2-NO-BLOCK.sql` is a MANDATORY GATE
// that must be run BEFORE migration 210 is applied — its `pg_proc.prosrc`
// enumeration is the only thing standing between this phase and a body caller
// the drop cannot see — and `38.0.3-VERIFY-B2-NO-BLOCK.sql` is the only thing
// that proves enforcement survived.
//
// WHAT THIS FILE DOES PROVE, and it is not nothing: that the migration's SIX
// SECTIONS ARE IN THE ORDER THE SAFETY ARGUMENT REQUIRES, that eleven
// hand-copied policy predicates were copied and not edited, and that the
// replacement of `green_room_can_view_post` carries migration 209's Tier-2
// binding rather than migration 076's older body. Eleven hand-copied
// predicates are otherwise unreviewable, and that is the point of assertion 9.
//
// PARSER DISCIPLINE, AND WHY IT IS NOT OPTIONAL HERE. Migration 210's header
// discusses `no_block`, cascading drops, `IF EXISTS`, grants and the absent
// `TO` clause IN PROSE, because it has to explain why each is present or
// absent. A file-wide assertion run against the UNSTRIPPED text would
// therefore be SELF-INVALIDATING: it would find the very tokens it exists to
// prohibit, inside the comment explaining the prohibition. That is the same
// defect class `38.0.3-INVENTORY.md` records, where the word "grant" inside a
// prose comment inverted the reported grant posture of every hardened RPC in
// the repo.
//
// So: strip `--` line comments FIRST, and REGION-SCOPE every negative
// assertion to a single statement. Never grep the file as a whole for a
// forbidden token.

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations')

const MIG_210 = '210_no_block_relocation.sql'
const MIG_035 = '035_connections_blocks.sql'
const MIG_038 = '038_block_enforcement_existing_tables.sql'
const MIG_044 = '044_connections_note.sql'
const MIG_060 = '060_green_room_block_visibility_and_audience_roles.sql'
const MIG_061 = '061_release_comments_block_enforcement.sql'
const MIG_076 = '076_rename_artist_profiles_to_user_profiles.sql'
const MIG_149 = '149_green_room_people_search.sql'
const MIG_209 = '209_definer_helper_caller_binding.sql'

function read(file: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
}

/**
 * Remove every `--` line comment, preserving line count. Single-quote state is
 * tracked WITHIN each line (SQL's `''` escape toggles twice and self-cancels),
 * so a `--` inside a string literal survives. Copied deliberately from
 * `__tests__/migration-209-definer-binds.test.ts` rather than shared: these
 * files must be able to disagree about parsing without one silently changing
 * the other's meaning.
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

/** Collapse all runs of whitespace to a single space, and trim. */
function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Normalise the helper's schema qualifier away, on BOTH sides of a diff.
 *
 * A naive "replace `public.no_block` with `private.no_block` in the source and
 * compare" is WRONG and would silently pass: applied to the already-relocated
 * side it produces `private.private.no_block`. Normalising both sides to a
 * neutral placeholder is equivalent and order-independent.
 *
 * This deliberately makes the drift guard (assertion 9) BLIND to the
 * qualifier. Proving the qualifier changed is assertion 6's job, region-scoped
 * per policy. Two assertions, one argument each.
 */
function neutraliseHelper(s: string): string {
  return s.replace(/(?:\bpublic\s*\.\s*|\bprivate\s*\.\s*)?\bno_block\s*\(/gi, 'HELPER(')
}

const sql210 = stripLineComments(read(MIG_210))

// ─── Statement extraction ─────────────────────────────────────────────────

/** Scan forward from `start` to the terminating `;`, skipping string literals. */
function statementAt(sql: string, start: number): string {
  let inString = false
  for (let i = start; i < sql.length; i++) {
    const ch = sql[i]
    if (ch === "'") inString = !inString
    else if (ch === ';' && !inString) return sql.slice(start, i + 1)
  }
  throw new Error(`unterminated statement at offset ${start}`)
}

/** The single `CREATE POLICY "<name>"` statement in `sql`, whole. */
function createPolicy(sql: string, name: string): string {
  const re = new RegExp(`CREATE\\s+POLICY\\s+"${name}"`, 'g')
  const hits: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) hits.push(m.index)
  if (hits.length !== 1) {
    throw new Error(`expected exactly 1 CREATE POLICY "${name}", found ${hits.length}`)
  }
  return statementAt(sql, hits[0])
}

/** Everything from the first USING / WITH CHECK keyword to the end. */
function predicateOf(stmt: string): string {
  const m = /\b(USING|WITH\s+CHECK)\b/i.exec(stmt)
  if (!m) throw new Error(`no USING / WITH CHECK in: ${collapse(stmt).slice(0, 120)}`)
  return stmt.slice(m.index).replace(/;\s*$/, '')
}

/** Everything BEFORE the predicate — name, table, FOR clause, TO clause. */
function headOf(stmt: string): string {
  const m = /\b(USING|WITH\s+CHECK)\b/i.exec(stmt)
  if (!m) throw new Error('no predicate keyword')
  return stmt.slice(0, m.index)
}

/** The dollar-quoted body of the function whose header matches `header`. */
function bodyOf(sql: string, header: RegExp): string {
  const m = header.exec(sql)
  if (!m) throw new Error(`function header not found: ${header}`)
  const open = sql.indexOf('$$', m.index)
  const close = sql.indexOf('$$', open + 2)
  if (open < 0 || close < 0) throw new Error(`no dollar-quoted body after ${header}`)
  return sql.slice(open + 2, close)
}

function offsetOf(sql: string, re: RegExp): number {
  const m = re.exec(sql)
  if (!m) throw new Error(`not found: ${re}`)
  return m.index
}

// ─── The eleven, and the four facts that are NOT uniform across them ──────
//
// SOURCE MIGRATION is latest-definition-wins. Migration 057 also created the
// three green_room `*_select_visible` policies; migration 060 superseded all
// three. Diffing against 057 would "prove" a revert correct.
//
// TO CLAUSE is not uniform: `rc_select_public` has NONE, so it is evaluated
// for `anon` as well. That absence is deliberate, pre-existing, and reproduced
// rather than tidied.
//
// HELPER CALL COUNT is not uniform: `rc_select_public` calls the helper TWICE
// (viewer <-> release owner, and viewer <-> comment author). It is the only
// one of the eleven with two, and dropping either would silently remove a
// block check while every other assertion still passed.

type PolicyPin = {
  policy: string
  table: string
  source: string
  to: 'authenticated' | null
  helperCalls: number
}

const POLICIES: PolicyPin[] = [
  { policy: 'follows_insert_own', table: 'follows', source: MIG_038, to: 'authenticated', helperCalls: 1 },
  { policy: 'wall_insert_author', table: 'wall_posts', source: MIG_038, to: 'authenticated', helperCalls: 1 },
  { policy: 'endo_insert_author', table: 'endorsements', source: MIG_038, to: 'authenticated', helperCalls: 1 },
  { policy: 'dmt_insert_participant', table: 'dm_threads', source: MIG_038, to: 'authenticated', helperCalls: 1 },
  { policy: 'dmm_insert_sender', table: 'dm_messages', source: MIG_038, to: 'authenticated', helperCalls: 1 },
  { policy: 'connections_insert_own', table: 'connections', source: MIG_044, to: 'authenticated', helperCalls: 1 },
  { policy: 'green_room_comments_select_visible', table: 'green_room_comments', source: MIG_060, to: 'authenticated', helperCalls: 1 },
  { policy: 'green_room_reactions_select_visible', table: 'green_room_reactions', source: MIG_060, to: 'authenticated', helperCalls: 1 },
  { policy: 'green_room_reposts_select_visible', table: 'green_room_reposts', source: MIG_060, to: 'authenticated', helperCalls: 1 },
  { policy: 'rc_select_public', table: 'release_comments', source: MIG_061, to: null, helperCalls: 2 },
  { policy: 'rc_insert_author', table: 'release_comments', source: MIG_061, to: 'authenticated', helperCalls: 1 },
]

// ─── 1. Section order — the migration's whole safety argument, as a test ──

describe('1. section order: both definer-body callers are retargeted BEFORE the drop', () => {
  it('relocated function, then the two definer bodies, then the policies, then the drop', () => {
    const relocated = offsetOf(sql210, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+private\.no_block\s*\(/i)
    const canViewPost = offsetOf(sql210, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.green_room_can_view_post\s*\(/i)
    const discover = offsetOf(sql210, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.discover_profile_id_by_email\s*\(/i)
    const firstDropPolicy = offsetOf(sql210, /DROP\s+POLICY\b/i)
    const dropFunction = offsetOf(sql210, /DROP\s+FUNCTION\s+public\.no_block\s*\(/i)

    // PostgreSQL records DEPENDENCY_NORMAL entries for RLS policy expressions
    // but records NOTHING for a function name inside a string-literal body.
    // So the drop below would SUCCEED with either of these two still pointing
    // at public.no_block, and that caller would raise `42883 function does not
    // exist` on its next live invocation, in production, with no prior
    // warning. That is the migration-198 failure shape exactly.
    //
    // IF A FUTURE EDIT REORDERS THIS FILE, THIS ASSERTION IS THE ONLY THING IN
    // THE REPO THAT NOTICES.
    expect(relocated).toBeLessThan(canViewPost)
    expect(relocated).toBeLessThan(discover)
    expect(canViewPost).toBeLessThan(dropFunction)
    expect(discover).toBeLessThan(dropFunction)
    expect(relocated).toBeLessThan(firstDropPolicy)
    expect(firstDropPolicy).toBeLessThan(dropFunction)
  })
})

// ─── 2. Drift guard: the relocated body is migration 035's, verbatim ──────

describe('2. the relocated function is a VERBATIM copy of migration 035', () => {
  it('body matches migration 035 after whitespace collapse — relocation is not a chance to "improve" a security predicate', () => {
    const body035 = bodyOf(
      stripLineComments(read(MIG_035)),
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.no_block\s*\(/i
    )
    const body210 = bodyOf(sql210, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+private\.no_block\s*\(/i)

    expect(collapse(body210)).toBe(collapse(body035))
    // Anti-vacuity: an empty body would compare equal to an empty body.
    expect(collapse(body210)).toContain('public.blocks')
  })

  it('keeps migration 035 four load-bearing attributes and the parameter names a, b', () => {
    const header = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+private\.no_block\s*\(([\s\S]*?)AS\s+\$\$/i.exec(sql210)
    expect(header).not.toBeNull()
    const decl = collapse(header![1])

    // SECURITY DEFINER is the whole point: the calling role is restricted by
    // `blocks_select_own` to blocker_id = auth.uid() and could not otherwise
    // read the direction where the OTHER party did the blocking. A relocation
    // that silently dropped it would still apply, still grant, and answer the
    // reverse direction wrongly.
    expect(decl).toMatch(/a\s+UUID\s*,\s*b\s+UUID/i)
    expect(decl).toMatch(/RETURNS\s+BOOLEAN/i)
    expect(decl).toMatch(/LANGUAGE\s+sql/i)
    expect(decl).toMatch(/\bSTABLE\b/i)
    expect(decl).toMatch(/SECURITY\s+DEFINER/i)
    expect(decl).toMatch(/SET\s+search_path\s*=\s*''/i)
  })
})

// ─── 3. The default-EXECUTE-to-PUBLIC hazard follows the function ─────────

describe('3. the relocated function is revoked from PUBLIC, anon AND authenticated before the single grant', () => {
  const grantStatements = sql210.match(
    /^[ \t]*(?:REVOKE|GRANT)\b[^;]*\bprivate\.no_block\b[^;]*;/gim
  ) ?? []

  it('has exactly one REVOKE and exactly one GRANT, in that order', () => {
    // PostgreSQL grants EXECUTE to PUBLIC BY DEFAULT on every function in
    // every schema, so the hazard follows the function to `private`. A
    // `GRANT USAGE ON SCHEMA` alone would re-create the exposure. This is a
    // confirmed open Supabase issue, and `ALTER DEFAULT PRIVILEGES` is not a
    // dependable prophylactic — it is scoped to the creating role and the
    // reporter found it did not prevent the grants. The explicit per-function
    // revoke naming the roles is the only dependable control (owner decision
    // D2, migration 149).
    expect(grantStatements).toHaveLength(2)
    expect(grantStatements[0]).toMatch(/^\s*REVOKE\b/i)
    expect(grantStatements[1]).toMatch(/^\s*GRANT\b/i)
  })

  it('the REVOKE names PUBLIC, anon AND authenticated — a FROM PUBLIC-only revoke is the migration-047 defect', () => {
    const revoke = collapse(grantStatements[0] ?? '')
    expect(revoke).toMatch(/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+private\.no_block\s*\(\s*uuid\s*,\s*uuid\s*\)/i)
    expect(revoke).toMatch(/FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i)
  })

  it('the GRANT goes to authenticated ONLY — not anon, not service_role', () => {
    const grant = collapse(grantStatements[1] ?? '')
    expect(grant).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+private\.no_block\s*\(\s*uuid\s*,\s*uuid\s*\)\s+TO\s+authenticated\s*;/i)

    const grantsOnly = grantStatements.filter((s) => /^\s*GRANT\b/i.test(s))
    expect(grantsOnly).toHaveLength(1)
    for (const s of grantsOnly) {
      const target = /\bTO\b([\s\S]*);/i.exec(s)?.[1] ?? ''
      // anon has NEVER held EXECUTE on public.no_block (migration 035 grants
      // authenticated only), so granting it here would be a behaviour CHANGE,
      // not a preservation. service_role needs nothing: after plan 04 no
      // application code reaches this function, and the two definer bodies
      // that call it run as the function OWNER.
      expect(target).not.toMatch(/\banon\b/i)
      expect(target).not.toMatch(/\bservice_role\b/i)
    }
  })
})

// ─── 4. Schema grants ─────────────────────────────────────────────────────

describe('4. USAGE on the relocated schema is granted to authenticated and to nobody else', () => {
  const schemaStatements = sql210.match(
    /^[ \t]*(?:REVOKE|GRANT)\b[^;]*\bON\s+SCHEMA\s+private\b[^;]*;/gim
  ) ?? []

  it('exactly one revoke (from PUBLIC) and exactly one grant (USAGE to authenticated)', () => {
    expect(schemaStatements).toHaveLength(2)
    expect(collapse(schemaStatements[0] ?? '')).toMatch(/REVOKE\s+ALL\s+ON\s+SCHEMA\s+private\s+FROM\s+PUBLIC\s*;/i)
    expect(collapse(schemaStatements[1] ?? '')).toMatch(/GRANT\s+USAGE\s+ON\s+SCHEMA\s+private\s+TO\s+authenticated\s*;/i)
  })

  it('no schema grant reaches anon, service_role or PUBLIC', () => {
    const grants = schemaStatements.filter((s) => /^\s*GRANT\b/i.test(s))
    expect(grants).toHaveLength(1)
    for (const s of grants) {
      const target = /\bTO\b([\s\S]*);/i.exec(s)?.[1] ?? ''
      expect(target).not.toMatch(/\banon\b/i)
      expect(target).not.toMatch(/\bservice_role\b/i)
      expect(target).not.toMatch(/\bPUBLIC\b/i)
    }
  })

  it('the schema carries a COMMENT forbidding its addition to the PostgREST exposed list', () => {
    // The one control this entire tier rests on is a MUTABLE dashboard
    // setting. It cannot be enforced from SQL, so it is documented at the
    // catalogue level where a future engineer will actually see it.
    const comment = /COMMENT\s+ON\s+SCHEMA\s+private\s+IS\s+'([\s\S]*?)';/i.exec(sql210)
    expect(comment).not.toBeNull()
    expect(comment![1]).toMatch(/NEVER be added/i)
  })
})

// ─── 5. All eleven policies are dropped and recreated ─────────────────────

describe('5. all eleven block-enforcing policies are dropped and recreated', () => {
  it('the literal count is 11 — asserted against the constant, not the array length', () => {
    // Asserting `POLICIES.length` against itself would pass vacuously if a row
    // were deleted from the table above. 11 is the number plan 03 Part A read
    // out of PRODUCTION, and plan 06 Part A2 re-reads it before the apply.
    expect(POLICIES).toHaveLength(11)
    expect(sql210.match(/^[ \t]*DROP\s+POLICY\b/gim) ?? []).toHaveLength(11)
    expect(sql210.match(/^[ \t]*CREATE\s+POLICY\b/gim) ?? []).toHaveLength(11)
  })

  it.each(POLICIES)('$policy on public.$table is dropped and recreated', ({ policy, table }) => {
    expect(sql210).toMatch(
      new RegExp(`DROP\\s+POLICY\\s+"${policy}"\\s+ON\\s+public\\.${table}\\s*;`, 'i')
    )
    expect(sql210).toMatch(
      new RegExp(`CREATE\\s+POLICY\\s+"${policy}"\\s+ON\\s+public\\.${table}\\b`, 'i')
    )
  })
})

// ─── 6. Each recreated policy calls the RELOCATED helper, region-scoped ───

describe('6. every recreated policy calls private.no_block and never public.no_block', () => {
  it.each(POLICIES)('$policy names the relocated helper only', ({ policy }) => {
    const stmt = createPolicy(sql210, policy)

    expect(stmt).toMatch(/\bprivate\.no_block\s*\(/i)

    // Region-scoped negative: strip the legitimate calls, then assert no
    // `no_block` token survives. This catches a bare, unqualified call as well
    // as a `public.`-qualified one. Migrations 038, 044 and 061 wrote the
    // helper UNQUALIFIED, relying on the search_path in force when the policy
    // was created; an unqualified name here would resolve back to `public`
    // while the public copy still exists, and then fail the moment section 5
    // drops it.
    const withoutRelocated = stmt.replace(/\bprivate\.no_block\b/gi, '')
    expect(withoutRelocated).not.toMatch(/\bno_block\b/i)
  })

  it('the three green_room policies keep calling public.green_room_can_view_post — that helper is NOT relocated', () => {
    for (const policy of [
      'green_room_comments_select_visible',
      'green_room_reactions_select_visible',
      'green_room_reposts_select_visible',
    ]) {
      expect(createPolicy(sql210, policy)).toMatch(/\bpublic\.green_room_can_view_post\s*\(/i)
    }
  })
})

// ─── 7. TO clauses reproduced exactly ─────────────────────────────────────

describe('7. every recreated policy TO clause matches its source', () => {
  it.each(POLICIES)('$policy TO clause', ({ policy, to }) => {
    const head = headOf(createPolicy(sql210, policy))
    if (to === null) {
      // rc_select_public has NO `TO` clause, so it applies to PUBLIC, which
      // includes `anon`. "Tidying" it to `TO authenticated` would silently
      // remove anonymous evaluation of a policy on a public-facing table.
      // That is a functional change wearing the costume of a cleanup.
      expect(head).not.toMatch(/\bTO\b/i)
    } else {
      expect(head).toMatch(new RegExp(`\\bTO\\s+${to}\\b`, 'i'))
    }
  })

  it('exactly one of the eleven has no TO clause, and it is rc_select_public', () => {
    const without = POLICIES.filter((p) => !/\bTO\b/i.test(headOf(createPolicy(sql210, p.policy))))
    expect(without.map((p) => p.policy)).toEqual(['rc_select_public'])
  })
})

// ─── 8. rc_select_public keeps BOTH of its helper calls ───────────────────

describe('8. helper call counts per policy', () => {
  it('rc_select_public calls the helper TWICE — viewer<->owner and viewer<->author', () => {
    const stmt = createPolicy(sql210, 'rc_select_public')
    expect(stmt.match(/\bprivate\.no_block\s*\(/gi) ?? []).toHaveLength(2)
  })

  it.each(POLICIES)('$policy calls the helper $helperCalls time(s)', ({ policy, helperCalls }) => {
    const stmt = createPolicy(sql210, policy)
    expect(stmt.match(/\bprivate\.no_block\s*\(/gi) ?? []).toHaveLength(helperCalls)
  })
})

// ─── 9. Predicate drift guard — the most valuable assertion in this file ──

describe('9. every recreated predicate is its source predicate with the qualifier changed and nothing else', () => {
  it.each(POLICIES)('$policy predicate is unchanged apart from the helper qualifier', ({ policy, source }) => {
    const sourcePredicate = predicateOf(createPolicy(stripLineComments(read(source)), policy))
    const recreatedPredicate = predicateOf(createPolicy(sql210, policy))

    // Eleven hand-copied policy predicates are otherwise unreviewable. This is
    // what turns "we only re-qualified a call" from a claim in a SUMMARY into
    // something the suite re-derives on every run.
    expect(collapse(neutraliseHelper(recreatedPredicate))).toBe(
      collapse(neutraliseHelper(sourcePredicate))
    )

    // Anti-vacuity: a predicate extractor that returned '' would make every
    // row above pass.
    expect(collapse(recreatedPredicate).length).toBeGreaterThan(20)
  })
})

// ─── 10. green_room_can_view_post came from 209, not from 076 ─────────────

describe('10. green_room_can_view_post carries migration 209 Tier-2 binding, not migration 076 body', () => {
  const body210 = bodyOf(sql210, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.green_room_can_view_post\s*\(/i)

  it('contains the caller-identity bind and the service-role disjunct', () => {
    // A copy from migration 076 would pass assertion 6 AND the "calls the
    // relocated helper" check in this same file, while REVERTING the
    // cross-user disclosure Tier 2 closed one migration earlier. That is why
    // this assertion exists separately from assertion 6 rather than being
    // folded alongside it.
    expect(collapse(body210)).toMatch(/p_viewer\s*=\s*\(\s*SELECT\s+auth\.uid\(\)\s*\)/i)
    expect(collapse(body210)).toMatch(/\(\s*SELECT\s+auth\.role\(\)\s*\)\s*=\s*'service_role'/i)
  })

  it('is byte-for-byte migration 209 body once the helper qualifier is neutralised', () => {
    const body209 = bodyOf(
      stripLineComments(read(MIG_209)),
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.green_room_can_view_post\s*\(/i
    )
    expect(collapse(neutraliseHelper(body210))).toBe(collapse(neutraliseHelper(body209)))
  })

  it('and is NOT migration 076 body — regression anchor for the diff above', () => {
    // If 076 and 209 ever compare equal here, the assertion above has stopped
    // discriminating and mutation 10 in the plan becomes untestable.
    const body076 = bodyOf(
      stripLineComments(read(MIG_076)),
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.green_room_can_view_post\s*\(/i
    )
    expect(collapse(neutraliseHelper(body210))).not.toBe(collapse(neutraliseHelper(body076)))
  })

  it('calls the relocated helper and keeps the nested public.green_room_post_matches_custom_audience call', () => {
    expect(body210).toMatch(/\bprivate\.no_block\s*\(\s*p_viewer\s*,\s*p\.author_id\s*\)/i)
    expect(body210.replace(/\bprivate\.no_block\b/gi, '')).not.toMatch(/\bno_block\b/i)

    // Migration 208 revoked EXECUTE on this one from `authenticated`. It stays
    // in `public` and stays reachable here because a SECURITY DEFINER body
    // executes with the privileges of the function OWNER. Do NOT grant it back
    // and do NOT relocate it.
    expect(body210).toMatch(/public\.green_room_post_matches_custom_audience\s*\(/i)
  })
})

// ─── 11. discover_profile_id_by_email is 149 body with one change ─────────

describe('11. discover_profile_id_by_email is migration 149 body with exactly one change', () => {
  it('matches migration 149 once the helper qualifier is neutralised', () => {
    // Owner decision D2 declared this function out of scope because it is
    // already correct and is the model this phase copies. This assertion is
    // what makes "we only retargeted a call" checkable rather than asserted.
    const body149 = bodyOf(
      stripLineComments(read(MIG_149)),
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.discover_profile_id_by_email\s*\(/i
    )
    const body210 = bodyOf(
      sql210,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.discover_profile_id_by_email\s*\(/i
    )

    expect(collapse(neutraliseHelper(body210))).toBe(collapse(neutraliseHelper(body149)))
    expect(body210).toMatch(/\bprivate\.no_block\s*\(\s*auth\.uid\(\)\s*,\s*profile\.id\s*\)/i)
    expect(body210.replace(/\bprivate\.no_block\b/gi, '')).not.toMatch(/\bno_block\b/i)
  })

  it('restates migration 149 exact revoke/grant posture', () => {
    const statements = sql210.match(
      /^[ \t]*(?:REVOKE|GRANT)\b[^;]*\bdiscover_profile_id_by_email\b[^;]*;/gim
    ) ?? []
    expect(statements).toHaveLength(2)
    expect(collapse(statements[0] ?? '')).toMatch(/REVOKE\s+ALL\b[\s\S]*FROM\s+PUBLIC\s*,\s*anon\s*,\s*authenticated/i)
    expect(collapse(statements[1] ?? '')).toMatch(/GRANT\s+EXECUTE\b[\s\S]*TO\s+authenticated/i)
  })
})

// ─── 12. The drop carries no modifier at all ──────────────────────────────

describe('12. the drop of the public copy carries NO modifier', () => {
  it('no cascading modifier anywhere in the comment-stripped file', () => {
    // With RLS enabled, cascading a policy away leaves its table with ZERO
    // policies, which is default-deny: a silent, TOTAL read outage for every
    // non-owner role. Fail closed, but total, and invisible until a user
    // reports an empty screen.
    expect(sql210).not.toMatch(/\bCASCADE\b/i)
  })

  it('and does not spell RESTRICT either — the default is deliberate and writing it would obscure that', () => {
    expect(sql210).not.toMatch(/\bRESTRICT\b/i)
  })

  it('the drop statement is exactly the bare form', () => {
    // Restrictive-by-default is what makes this statement the VERIFICATION
    // rather than a step needing one: a policy missed by section 4 makes it
    // fail with 2BP01 and a DETAIL line naming every remaining dependant.
    const drop = /DROP\s+FUNCTION\s+public\.no_block\s*\([^)]*\)[^;]*;/i.exec(sql210)
    expect(drop).not.toBeNull()
    expect(collapse(drop![0])).toBe('DROP FUNCTION public.no_block(uuid, uuid);')
  })
})

// ─── 13. DROP POLICY is written plain, never IF EXISTS ────────────────────

describe('13. every DROP POLICY is written without IF EXISTS', () => {
  it.each(POLICIES)('$policy is dropped plain, so a policy production lacks raises loudly', ({ policy }) => {
    const re = new RegExp(`DROP\\s+POLICY\\s+(IF\\s+EXISTS\\s+)?"${policy}"`, 'i')
    const m = re.exec(sql210)
    expect(m).not.toBeNull()
    expect(m![1]).toBeUndefined()
  })

  it('no IF EXISTS appears on any DROP POLICY in the file', () => {
    expect(sql210).not.toMatch(/DROP\s+POLICY\s+IF\s+EXISTS/i)
  })
})

// ─── 14. The PostgREST reload is the last statement ───────────────────────

describe('14. the file ends with the PostgREST schema reload', () => {
  it('last non-empty stripped line is the notify', () => {
    // PostgREST caches the schema it introspects. Without this the dropped RPC
    // stays apparently routable until the cache turns over on its own.
    const lines = sql210.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    expect(lines[lines.length - 1]).toBe("NOTIFY pgrst, 'reload schema';")
  })
})

// ─── 15. No other function is redefined ───────────────────────────────────

describe('15. exactly three functions are created or replaced', () => {
  it('the relocated helper and the two definer-body callers, and nothing else', () => {
    const headers = sql210.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+[A-Za-z0-9_]+\.[A-Za-z0-9_]+/gi) ?? []
    expect(headers).toHaveLength(3)
    expect(headers.map((h) => collapse(h).replace(/^CREATE OR REPLACE FUNCTION /i, ''))).toEqual([
      'private.no_block',
      'public.green_room_can_view_post',
      'public.discover_profile_id_by_email',
    ])

    // A plain CREATE FUNCTION would sidestep the regex above.
    expect(sql210.match(/\bCREATE\s+FUNCTION\b/gi) ?? []).toHaveLength(0)
  })

  it('creates exactly one schema, and no table, view or trigger', () => {
    expect(sql210.match(/\bCREATE\s+SCHEMA\b/gi) ?? []).toHaveLength(1)
    expect(sql210).not.toMatch(/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|TRIGGER|INDEX)\b/i)
  })
})
