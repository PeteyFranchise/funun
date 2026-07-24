import { readFileSync } from 'fs'
import path from 'path'

// ─── Current-state companion helpers (19-05, Pitfall 5) ────────────────────
// The historical assertions below (051/052/053) will keep passing forever
// because they read immutable migration FILE text, not live DB state — they
// do not catch that migration 073 later drops user_profiles out from under
// them. These helpers isolate a single function's body (stripped of its own
// `--` comment lines, which legitimately narrate "was FROM public.user_
// profiles" as history) so the companion assertions below can tell a real
// runtime reference apart from a comment mentioning the old table by name.
function extractFunctionBody(sql: string, functionName: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}`)
  if (start === -1) throw new Error(`function ${functionName} not found in migration`)
  const end = sql.indexOf('$$ LANGUAGE plpgsql', start)
  if (end === -1) throw new Error(`function ${functionName} body not terminated`)
  return sql.slice(start, end)
}

function withoutSqlLineComments(sql: string): string {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
}

describe('claim_collaborators RPC contract', () => {
  it('keeps the route and migration aligned on named RPC arguments', () => {
    const route = readFileSync(
      path.join(process.cwd(), 'app/api/claim-collaborators/route.ts'),
      'utf8'
    )
    const migration = readFileSync(
      path.join(process.cwd(), 'supabase/migrations/051_recreate_claim_collaborators_rpc.sql'),
      'utf8'
    )
    const columnMigration = readFileSync(
      path.join(process.cwd(), 'supabase/migrations/052_restore_collaborators_claimed_by.sql'),
      'utf8'
    )
    const profileMigration = readFileSync(
      path.join(process.cwd(), 'supabase/migrations/053_restore_user_profiles_table.sql'),
      'utf8'
    )

    expect(route).toContain("service.rpc('claim_collaborators'")
    expect(route).toContain('p_user_id: user.id')
    expect(route).toContain("p_email: user.email ?? ''")
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.claim_collaborators')
    expect(migration).toContain('p_user_id UUID')
    expect(migration).toContain('p_email   TEXT')
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'")
    expect(columnMigration).toContain('ADD COLUMN IF NOT EXISTS claimed_by UUID')
    expect(columnMigration).toContain('idx_collaborators_claimed_by')
    expect(columnMigration).toContain('auth.uid() = claimed_by')
    expect(profileMigration).toContain('CREATE TABLE IF NOT EXISTS public.user_profiles')
    expect(profileMigration).toContain('CREATE POLICY "Users insert own profile"')
    expect(profileMigration).toContain('set_user_profiles_updated_at')
  })
})

// ─── Current-state companion (19-05, Pitfall 5) ─────────────────────────────
// Up-to-date behavioral anchor alongside the historical assertions above:
// proves migration 072 re-points BOTH functions to the canonical
// artist_profiles table (SPEC R1 Edge Coverage "Missed reader" —
// backfill_claimed_collaborators() is easy to overlook) and that migration
// 073 drops the doomed duplicate, strictly after 072 re-points its readers.
describe('claim_collaborators / backfill_claimed_collaborators re-point (migration 072) + drop (073)', () => {
  const migration072 = readFileSync(
    path.join(process.cwd(), 'supabase/migrations/072_repoint_claim_functions.sql'),
    'utf8'
  )
  const migration073 = readFileSync(
    path.join(process.cwd(), 'supabase/migrations/073_drop_user_profiles.sql'),
    'utf8'
  )

  it('re-points claim_collaborators() to read artist_profiles, with no live user_profiles reference', () => {
    const body = withoutSqlLineComments(extractFunctionBody(migration072, 'claim_collaborators'))
    expect(body).toContain('FROM public.artist_profiles')
    expect(body).not.toContain('user_profiles')
  })

  it('re-points backfill_claimed_collaborators() to read artist_profiles, with no live user_profiles reference', () => {
    const body = withoutSqlLineComments(extractFunctionBody(migration072, 'backfill_claimed_collaborators'))
    expect(body).toContain('FROM public.artist_profiles')
    expect(body).not.toContain('user_profiles')
  })

  it('drops user_profiles only in migration 073, strictly after the 072 re-point', () => {
    expect(migration073).toContain('DROP TABLE IF EXISTS public.user_profiles')
    // 072 must not itself drop the table it is still re-pointing readers
    // away from -- the drop belongs exclusively to 073, "strictly last".
    expect(migration072).not.toContain('DROP TABLE')
  })
})
