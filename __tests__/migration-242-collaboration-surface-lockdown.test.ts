import fs from 'fs'
import path from 'path'

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/242_collaboration_surface_lockdown.sql'),
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

describe('migration 242 — works: ownership, and nothing else', () => {
  it('guards user_id, the claim no client should ever write', () => {
    // 136's WITH CHECK is satisfied by `auth.uid() = user_id` on the NEW row,
    // so a member could set it to themselves and take the work.
    expect(code).toMatch(/NEW\.user_id IS DISTINCT FROM OLD\.user_id AND NOT v_privileged/)
  })

  it('does NOT touch the four columns Pass 6 named — they are the product', () => {
    // The routes resolve these at the 'contribute' tier on purpose. Guarding
    // them would reverse a shipped product decision under cover of a fix.
    const guard = code.match(/works_guard_ownership[\s\S]*?\$\$;/)?.[0] ?? ''
    for (const c of ['title', 'vocal_state', 'primary_performer', 'working_version_id']) {
      expect(guard).not.toMatch(new RegExp(`NEW\\.${c}\\b`))
    }
  })

  it('leaves graduated_project_id to migration 172’s owner-only guard', () => {
    expect(code).not.toMatch(/NEW\.graduated_project_id/)
    expect(code).not.toMatch(/guard_work_graduation_owner_only/)
  })
})

describe('migration 242 — tool_outputs: written once', () => {
  it('narrows FOR ALL to INSERT, since no UPDATE or DELETE exists in the app', () => {
    expect(code).toContain('DROP POLICY IF EXISTS "tool_outputs_write_project_owner_or_editor" ON public.tool_outputs')
    expect(code).toMatch(/CREATE POLICY "tool_outputs_insert_project_owner_or_editor"[\s\S]*?FOR INSERT/)
    expect(code).not.toMatch(/ON public\.tool_outputs\s*\n\s*FOR (ALL|UPDATE|DELETE)/)
  })

  it('preserves the nullable project_id fallback', () => {
    const ins = code.match(/CREATE POLICY "tool_outputs_insert[\s\S]*?\n\s*\);/)?.[0] ?? ''
    expect(ins).toMatch(/project_id IS NULL AND user_id = \(SELECT auth\.uid\(\)\)/)
  })
})

describe('migration 242 — collaborator_invites: the inviter cannot claim acceptance', () => {
  it('replaces the implicit FOR ALL with SELECT and INSERT only', () => {
    expect(code).toContain('DROP POLICY IF EXISTS "Inviting user manages invites" ON public.collaborator_invites')
    expect(code).toMatch(/collaborator_invites_select_inviter[\s\S]*?FOR SELECT/)
    expect(code).toMatch(/collaborator_invites_insert_inviter[\s\S]*?FOR INSERT/)
    expect(code).not.toMatch(/ON public\.collaborator_invites\s*\n\s*FOR (ALL|UPDATE|DELETE)/)
  })

  it('an invitation can only be created unaccepted', () => {
    const ins = code.match(/CREATE POLICY "collaborator_invites_insert_inviter"[\s\S]*?\n\s*\);/)?.[0] ?? ''
    expect(ins).toMatch(/status = 'pending'/)
    expect(ins).toMatch(/accepted_user_id IS NULL/)
    expect(ins).toMatch(/accepted_at IS NULL/)
  })
})

describe('migration 242 — pitches: answer, do not rewrite', () => {
  it('fixes what the artist sent', () => {
    for (const c of ['project_id', 'artist_id', 'recipient_id', 'message', 'sent_at']) {
      expect(code).toMatch(new RegExp(`NEW\\.${c}\\s+IS DISTINCT FROM OLD\\.${c}`))
    }
  })

  it('leaves the recipient’s own response writable', () => {
    const guard = code.match(/pitches_guard_sent_content[\s\S]*?v_changing BOOLEAN :=([\s\S]*?);/)?.[1] ?? ''
    for (const c of ['status', 'viewed_at', 'responded_at', 'response_message']) {
      expect(guard).not.toMatch(new RegExp(`NEW\\.${c}\\b`))
    }
  })
})

describe('migration 242 — shared posture', () => {
  it('both guards are SECURITY INVOKER and trigger-internal only', () => {
    for (const fn of ['works_guard_ownership', 'pitches_guard_sent_content']) {
      const header = code.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(\\)[\\s\\S]*?AS \\$\\$`))?.[0] ?? ''
      expect(header).toMatch(/SECURITY INVOKER/)
      expect(header).not.toMatch(/SECURITY DEFINER/)
      expect(code).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\(\\) FROM PUBLIC, anon, authenticated`))
    }
  })

  it('records that Pass 6 named the wrong exposure on works', () => {
    expect(sql).toMatch(/Pass 6 named the wrong exposure, and missed a worse one/)
    expect(sql).toMatch(/TRUE and it is INTENDED/)
  })

  it('carries must-succeed probes for the collaboration it deliberately leaves alone', () => {
    expect(sql).toMatch(/W2\s+MUST SUCCEED\s+-- a contribute member retitles the work/)
    expect(sql).toMatch(/W3\s+MUST SUCCEED\s+-- a contribute member changes vocal_state/)
    expect((sql.match(/MUST SUCCEED/g) ?? []).length).toBeGreaterThanOrEqual(6)
  })
})
