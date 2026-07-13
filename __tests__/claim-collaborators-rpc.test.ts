import { readFileSync } from 'fs'
import path from 'path'

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
