import fs from 'fs'
import path from 'path'

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/240_system_facts_and_dormant_community_lockdown.sql'),
  'utf8'
)

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

describe('migration 240 — notifications provenance', () => {
  it('guards every column except read, listed positively', () => {
    for (const col of ['user_id', 'type', 'data', 'created_at']) {
      expect(code).toMatch(new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`))
    }
    // `read` must stay writable -- it is the only client write in the corpus
    // (app/api/notifications/route.ts:69).
    const guard = code.match(/notifications_guard_provenance[\s\S]*?v_changing BOOLEAN :=([\s\S]*?);/)?.[1] ?? ''
    expect(guard).not.toMatch(/\bNEW\.read\b/)
  })

  it('uses a positive list, so a future column is not silently writable', () => {
    // An exclusion list ("everything but read") would quietly admit any column
    // added later. A positive list leaves it unguarded but VISIBLY so.
    expect(code).not.toMatch(/!=\s*'read'|<>\s*'read'/)
  })
})

describe('migration 240 — opportunity_matches computed values', () => {
  it('closes the score, the breakdown and the row’s subject', () => {
    for (const col of ['match_score', 'breakdown', 'opportunity_id', 'project_id', 'user_id']) {
      expect(code).toMatch(new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`))
    }
  })

  it('keeps the UPDATE policy rather than dropping it', () => {
    // Nothing uses it today, but a "dismiss this match" affordance plausibly
    // would. Closing the computed columns is the exposure; removing the
    // capability is not required and would be a wider change.
    expect(code).not.toMatch(/DROP POLICY[^;]*opportunity_matches/)
  })
})

describe('migration 240 — community_posts', () => {
  it('requires the poster to be the author, which the old policy never did', () => {
    expect(code).toContain('DROP POLICY IF EXISTS "Pro+ users can post" ON public.community_posts')
    const ins = code.match(/CREATE POLICY "community_posts_insert_own"[\s\S]*?\n\s*\);/)?.[0] ?? ''
    expect(ins).toMatch(/user_id = \(SELECT auth\.uid\(\)\)/)
    // The subscription gate is preserved, not traded away for the identity fix.
    expect(ins).toMatch(/tier IN \('pro', 'studio', 'founding'\)/)
    expect(ins).toMatch(/status = 'active'/)
  })
})

describe('migration 240 — community_comments', () => {
  it('replaces the USING (true) FOR ALL with per-command policies', () => {
    expect(code).toContain('DROP POLICY IF EXISTS "Members can comment" ON public.community_comments')
    for (const cmd of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(code).toMatch(new RegExp(`CREATE POLICY "community_comments_\\w+" ON public\\.community_comments\\s*\\n\\s*FOR ${cmd}`))
    }
  })

  it('no write policy uses USING (true) — that was the whole defect', () => {
    // USING (true) made every row a valid TARGET; the WITH CHECK only
    // constrained the row afterwards, so an UPDATE could take over anyone's
    // comment by setting user_id to self.
    for (const name of ['update_own', 'delete_own']) {
      const p = code.match(new RegExp(`CREATE POLICY "community_comments_${name}"[\\s\\S]*?;`))?.[0] ?? ''
      expect(p).toMatch(/USING \(user_id = \(SELECT auth\.uid\(\)\)\)/)
      expect(p).not.toMatch(/USING \(true\)/)
    }
    // SELECT stays open: it is a community feed.
    const sel = code.match(/CREATE POLICY "community_comments_select_all"[\s\S]*?;/)?.[0] ?? ''
    expect(sel).toMatch(/USING \(true\)/)
  })

  it('revokes anon writes at TABLE level on both community tables', () => {
    expect(code).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.community_posts FROM anon/)
    expect(code).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.community_comments FROM anon/)
    // Column-level revokes cannot remove a table-level grant -- migration 230.
    expect(code).not.toMatch(/REVOKE[^;]*\([a-z_, ]+\)[^;]*ON public\.community/)
  })
})

describe('migration 240 — shared posture', () => {
  it('both guards are SECURITY INVOKER and trigger-internal only', () => {
    for (const fn of ['notifications_guard_provenance', 'opportunity_matches_guard_computed']) {
      const header = code.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(\\)[\\s\\S]*?AS \\$\\$`))?.[0] ?? ''
      expect(header).toMatch(/SECURITY INVOKER/)
      expect(header).not.toMatch(/SECURITY DEFINER/)
      expect(code).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\(\\) FROM PUBLIC, anon, authenticated`))
    }
  })

  it('every privileged check is the proven non-NULL idiom', () => {
    expect((code.match(/v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role'/g) ?? []).length).toBe(2)
  })

  it('carries probes covering the two live paths a bad guard would break', () => {
    expect(sql).toMatch(/N2\s+MUST SUCCEED\s+-- recipient sets read = true/)
    expect(sql).toMatch(/O2\s+MUST SUCCEED\s+-- service_role updates match_score/)
    expect((sql.match(/MUST FAIL/g) ?? []).length).toBeGreaterThanOrEqual(5)
  })

  it('scopes itself to four tables and defers the other four by name', () => {
    expect(sql).toMatch(/works,[\s\S]{0,12}tool_outputs, collaborator_invites, pitches/)
    for (const t of ['public.works', 'public.tool_outputs', 'public.collaborator_invites', 'public.pitches']) {
      expect(code).not.toMatch(new RegExp(`ON ${t.replace('.', '\\.')}\\b`))
    }
  })
})
