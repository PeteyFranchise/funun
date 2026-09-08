import { readFileSync } from 'fs'
import path from 'path'

// ─── migration 199 — the 42702 repair for workspace_redeem_invitation ─────
//
// LIMITATION, STATED FIRST, AND THIS FILE IS THE REASON IT MATTERS. A
// text-lock test proves what the SQL SAYS, never what a live PostgreSQL DOES.
// Migration 198's own suite was green — every assertion in it passed, the
// function existed with the right signature, the right grants and the right
// search_path — and `workspace_redeem_invitation` still raised
//
//     42702: column reference "workspace_id" is ambiguous
//
// on the first live call ever made to it, because an ON CONFLICT inference
// clause is parsed as EXPRESSIONS and therefore takes PL/pgSQL variable
// substitution, while the INSERT column list three lines above it does not.
// No amount of reading the text was going to surface that. Phase 38.0.2's
// Part B behavioural harness did, on its first run.
//
// So this file makes no claim to prove the repair works. The proof is the
// owner re-running Part B assertion B18 after applying 199 and seeing
// `before_cohort=not_in_cohort after_cohort=ok seat=member`. What this file
// does is stop the repair from being silently undone.

const MIG_199 = 'supabase/migrations/199_redeem_invitation_variable_conflict.sql'
const MIG_198 = 'supabase/migrations/198_workspace_transactional_rpcs.sql'

const migration = readFileSync(path.join(process.cwd(), MIG_199), 'utf8')
const prior = readFileSync(path.join(process.cwd(), MIG_198), 'utf8')

// The executable function block, isolated from the surrounding commentary so
// the drift guard below compares code against code.
function functionBlock(sql: string): string[] {
  const lines = sql.split('\n')
  const start = lines.findIndex((l) =>
    l.startsWith('CREATE OR REPLACE FUNCTION public.workspace_redeem_invitation(')
  )
  const end = lines.findIndex((l, i) => i > start && l.trim() === '$$;')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return lines.slice(start, end + 1)
}

describe('migration 199 — the directive is present and correctly placed', () => {
  it('carries the #variable_conflict use_column directive', () => {
    expect(migration).toContain('#variable_conflict use_column')
  })

  it('places the directive AFTER "AS $$" and BEFORE "DECLARE"', () => {
    // Placement is not cosmetic: PL/pgSQL only honours the directive when it
    // is the first thing in the block. Below DECLARE it is an ordinary
    // comment and the 42702 comes straight back, silently.
    const block = functionBlock(migration)
    const as = block.findIndex((l) => l.trim() === 'AS $$')
    const directive = block.findIndex((l) => l.trim() === '#variable_conflict use_column')
    const declare = block.findIndex((l) => l.trim() === 'DECLARE')

    expect(as).toBeGreaterThan(-1)
    expect(directive).toBe(as + 1)
    expect(declare).toBe(directive + 1)
  })
})

// Executable lines only. Comments are deliberately excluded: migration 199
// REWRITES one comment block (see below), and the safety argument for
// `use_column` is about code, not prose.
function codeLines(sql: string): string[] {
  return functionBlock(sql)
    .filter((l) => l.trim() !== '' && !l.trim().startsWith('--'))
}

describe('migration 199 — DRIFT GUARD: exactly one line of CODE differs from 198', () => {
  // The whole safety argument for `use_column` rests on the body being
  // otherwise unchanged: the directive was proved safe by scanning THIS body
  // and finding no OUT parameter read as a variable expression. If somebody
  // edits the function here without re-running that analysis, the argument
  // silently stops holding. This test fails the moment that happens.
  it('is identical to migration 198 apart from the added directive', () => {
    const a = codeLines(prior)
    const b = codeLines(migration)

    expect(b.length).toBe(a.length + 1)

    const withoutDirective = b.filter((l) => l.trim() !== '#variable_conflict use_column')
    expect(withoutDirective).toEqual(a)
  })
})

describe('migration 199 — the wrong reasoning that caused this is corrected', () => {
  // Migration 198 reasoned about this exact question at this exact spot and
  // reached the OPPOSITE conclusion — that ON CONFLICT inference is not
  // subject to PL/pgSQL substitution. Copying that paragraph forward verbatim
  // would leave 199 asserting the bug is impossible a few lines above the fix
  // for it, which is how a future reader talks themselves into deleting the
  // directive. These assertions keep the correction in place.
  it('migration 198 really did contain the mistaken claim', () => {
    // Anchors this suite to reality: if 198 is ever edited to remove the
    // claim, this fails and the guard below should be reconsidered rather
    // than left asserting against a paragraph that no longer exists.
    expect(prior).toContain("PL/pgSQL's variable substitution does not reach it")
  })

  it('does not repeat 198\'s mistaken claim as if it were current', () => {
    expect(migration).toContain('That is FALSE.')
    expect(migration).toContain('42702: column reference "workspace_id" is ambiguous')
  })

  it('warns against removing the directive', () => {
    expect(migration).toContain('DO NOT')
    expect(migration).toMatch(/REMOVE IT/)
  })
})

describe('migration 199 — the posture 198 established is preserved', () => {
  it('keeps SECURITY DEFINER and an empty search_path', () => {
    const block = functionBlock(migration).join('\n')
    expect(block).toContain('SECURITY DEFINER')
    expect(block).toContain("SET search_path = ''")
  })

  it('keeps the RETURNS TABLE signature callers depend on', () => {
    // Renaming the OUT parameter would also fix the 42702 — and would break
    // every caller that reads `workspace_id` off the result row. Locked.
    const block = functionBlock(migration).join('\n')
    expect(block).toContain('RETURNS TABLE (')
    for (const col of [
      'outcome',
      'workspace_id',
      'member_id',
      'member_role',
      'invitation_audit_id',
      'member_audit_id',
    ]) {
      expect(block).toMatch(new RegExp(`^\\s+${col}\\s`, 'm'))
    }
  })

  it('re-issues 198\'s REVOKE/GRANT posture, not 046\'s', () => {
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.workspace_redeem_invitation(')
    expect(migration).toContain(') FROM PUBLIC, anon, authenticated;')
    expect(migration).toContain(') TO service_role;')
    expect(migration).not.toContain('GRANT EXECUTE ON FUNCTION public.workspace_redeem_invitation(\n  UUID, TEXT, TEXT, BOOLEAN\n) TO authenticated;')
  })
})

describe('migration 199 — the upsert was repaired, not restructured', () => {
  it('retains the single ON CONFLICT statement', () => {
    // The alternative fixes both had to be rejected: ON CONFLICT ON CONSTRAINT
    // cannot name migration 182's PARTIAL unique index, and a
    // lookup-then-update-or-insert fork reintroduces F11's double-INSERT race.
    const block = functionBlock(migration).join('\n')
    expect(block).toContain('ON CONFLICT (workspace_id, user_id) WHERE user_id IS NOT NULL')
    expect(block).toContain('DO UPDATE SET status')
  })

  it('still writes workspace_members with exactly one INSERT', () => {
    const block = functionBlock(migration).join('\n')
    const inserts = block.match(/INSERT INTO public\.workspace_members\b/g) ?? []
    expect(inserts).toHaveLength(1)
  })

  it('adds no conditional UPDATE against workspace_members', () => {
    const block = functionBlock(migration).join('\n')
    expect(block).not.toMatch(/UPDATE\s+public\.workspace_members\b/)
  })
})
