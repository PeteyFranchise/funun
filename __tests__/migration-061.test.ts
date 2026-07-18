import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/061_release_comments_block_enforcement.sql'),
  'utf8'
)

describe('migration 061 — release_comments block enforcement', () => {
  it('replaces the SELECT policy rather than stacking a second one', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "rc_select_public" ON release_comments')
    expect(migration).toContain('CREATE POLICY "rc_select_public" ON release_comments FOR SELECT')
  })

  it('gates comment reads on no_block against both the author and the release owner', () => {
    expect(migration).toContain('AND no_block(auth.uid(), author_id)')
    expect(migration).toContain('AND no_block(auth.uid(), p.user_id)')
  })

  it('preserves the public-or-owner project visibility gate on SELECT', () => {
    expect(migration).toContain('(p.is_public OR p.user_id = auth.uid())')
  })

  it('replaces the INSERT policy and gates it on no_block against the release owner', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "rc_insert_author" ON release_comments')
    expect(migration).toMatch(
      /CREATE POLICY "rc_insert_author" ON release_comments FOR INSERT TO authenticated\s+WITH CHECK \(\s+author_id = auth\.uid\(\)/
    )
    const insertPolicy = migration.slice(migration.indexOf('"rc_insert_author" ON release_comments FOR INSERT'))
    expect(insertPolicy).toContain('no_block(auth.uid(), p.user_id)')
  })

  it('does not touch the delete-own policy', () => {
    expect(migration).not.toContain('rc_delete_own')
  })
})
