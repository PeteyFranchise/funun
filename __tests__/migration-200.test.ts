import { readFileSync } from 'fs'
import path from 'path'

// ─── migration 200 — hardening apply_to_opportunity_atomic ────────────────
//
// LIMITATION, STATED FIRST, AND THIS REPO HAS PAID FOR IT TWICE. A text-lock
// test proves what the SQL SAYS, never what a live PostgreSQL DOES. Migration
// 139's suite was green while a second trigger silently broke custody
// transfer; migration 198's suite was green while its ON CONFLICT clause
// raised 42702 on the first live call it ever received. Both surfaced only
// under an owner-run behavioural harness.
//
// So this file claims nothing about behaviour. What it does is hold the two
// properties that make migration 200 worth applying at all — an empty
// search_path and no unqualified relation names — because those two only work
// TOGETHER. An empty search_path with one unqualified name left behind is
// strictly worse than what 046 shipped: it does not resolve at all.
//
// The live question this migration closes blind — whether anon or
// authenticated ever held a DIRECT execute grant that 047's PUBLIC-only
// revoke left untouched — cannot be answered from any file here. The quick
// task's SUMMARY.md carries a read-only query for the owner.

const MIG_200 = 'supabase/migrations/200_apply_to_opportunity_atomic_hardening.sql'
const MIG_046 = 'supabase/migrations/046_atomic_opportunity_apply.sql'

const migration = readFileSync(path.join(process.cwd(), MIG_200), 'utf8')
const prior = readFileSync(path.join(process.cwd(), MIG_046), 'utf8')

const TABLES = ['vault_projects', 'opportunity_matches', 'opportunities', 'submissions'] as const

function functionBlock(sql: string): string[] {
  const lines = sql.split('\n')
  const start = lines.findIndex((l) =>
    l.startsWith('CREATE OR REPLACE FUNCTION public.apply_to_opportunity_atomic(')
  )
  const end = lines.findIndex((l) => l.startsWith('$$ LANGUAGE'))
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return lines.slice(start, end + 1)
}

describe('migration 200 — the two properties that only work together', () => {
  it('sets an EMPTY search_path, not `public`', () => {
    expect(migration).toContain("SET search_path = ''")
    expect(functionBlock(migration).join('\n')).not.toContain('SET search_path = public')
  })

  it.each(TABLES)('leaves no unqualified reference to %s', (table) => {
    // An empty search_path plus one unqualified name does not resolve at all,
    // so this assertion is not stylistic — it is what keeps the pair valid.
    const block = functionBlock(migration).join('\n')
    const unqualified = block.match(new RegExp(`(?<!public\\.)(?<![\\w.])${table}\\b`, 'g')) ?? []
    expect(unqualified).toHaveLength(0)
  })

  it('still names every table at least once, qualified', () => {
    // Guards against the degenerate way to pass the test above: deleting the
    // references instead of qualifying them.
    const block = functionBlock(migration).join('\n')
    for (const table of TABLES) {
      expect(block).toMatch(new RegExp(`public\\.${table}\\b`))
    }
  })
})

describe('migration 200 — DRIFT GUARD: body is 046 plus qualification, nothing else', () => {
  it('is line-for-line identical to 046 once qualification and search_path are normalised', () => {
    const strip = (lines: string[]) =>
      lines.map((l) =>
        l
          .replace(new RegExp(`public\\.(${TABLES.join('|')})\\b`, 'g'), '$1')
          .replace("SET search_path = ''", 'SET search_path = public')
      )

    expect(strip(functionBlock(migration))).toEqual(strip(functionBlock(prior)))
  })

  it('keeps the FOR UPDATE lock modes 046 shipped', () => {
    // Deliberately NOT changed. LO-2 would prefer FOR NO KEY UPDATE here
    // (opportunities is an FK parent of opportunity_matches), but that is a
    // concurrency behaviour change and belongs in its own migration with its
    // own behavioural verification. This assertion exists so nobody
    // "helpfully" folds it in here, where nothing would catch a regression.
    const block = functionBlock(migration).join('\n')
    expect(block.match(/FOR UPDATE/g) ?? []).toHaveLength(2)
    expect(block).not.toContain('FOR NO KEY UPDATE')
  })
})

describe('migration 200 — signature and grant posture', () => {
  it('preserves the exact signature callers depend on', () => {
    const block = functionBlock(migration).join('\n')
    expect(block).toContain('p_opportunity_id UUID')
    expect(block).toContain('p_project_id UUID')
    expect(block).toContain('p_user_id UUID')
    expect(block).toContain('p_note TEXT DEFAULT NULL')
  })

  it('preserves the RETURNS TABLE columns', () => {
    const block = functionBlock(migration).join('\n')
    for (const col of [
      'result TEXT',
      'opportunity_title TEXT',
      'opportunity_created_by UUID',
      'project_title TEXT',
      'submission_id UUID',
    ]) {
      expect(block).toContain(col)
    }
  })

  it('is SECURITY DEFINER', () => {
    expect(migration).toContain('SECURITY DEFINER')
  })

  it('revokes from PUBLIC, anon AND authenticated', () => {
    // 047 revoked from PUBLIC only. A direct grant to anon or authenticated
    // would have survived that untouched, which is the whole point of naming
    // them here.
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.apply_to_opportunity_atomic(')
    expect(migration).toContain(') FROM PUBLIC, anon, authenticated;')
  })

  it('grants execute to service_role only', () => {
    expect(migration).toContain(') TO service_role;')
    expect(migration).not.toMatch(/GRANT EXECUTE[\s\S]{0,120}TO (anon|authenticated)\b/)
  })
})

describe('migration 200 — the record it corrects', () => {
  it('does not repeat the CONTEXT file\'s claim that 046 had no revoke', () => {
    // 38.0.2-CONTEXT.md says 046 has "no REVOKE at all". Migration 047 proves
    // otherwise. Anchored against 047 so this fails if that ever changes.
    const m047 = readFileSync(
      path.join(process.cwd(), 'supabase/migrations/047_atomic_opportunity_apply_grants.sql'),
      'utf8'
    )
    expect(m047).toContain('REVOKE ALL ON FUNCTION public.apply_to_opportunity_atomic')
    expect(migration).toContain('That is FALSE.')
  })
})
