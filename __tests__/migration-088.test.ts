import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/088_green_room_select_author_own_row.sql'),
  'utf8'
)

// Executable DDL only — the header comment intentionally NAMES insert_own /
// is_green_room_eligible / WITH CHECK to explain what this migration deliberately
// leaves alone, so the "does not touch" assertions must ignore comment lines.
const ddl = migration
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

describe('migration 088 — Green Room SELECT policy lets authors read their own row (fixes INSERT..RETURNING 42501)', () => {
  it('rewrites green_room_posts_select_visible (DROP + single CREATE, not stacked)', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "green_room_posts_select_visible" ON green_room_posts')
    const creates = migration.match(/CREATE POLICY "green_room_posts_select_visible"/g) ?? []
    expect(creates).toHaveLength(1)
  })

  it('adds a DIRECT author_id = auth.uid() predicate (re-query-free, so it holds for the RETURNING tuple)', () => {
    const policyStart = migration.indexOf('CREATE POLICY "green_room_posts_select_visible"')
    expect(policyStart).toBeGreaterThan(-1)
    const policy = migration.slice(policyStart, policyStart + 400)
    // the fix: author reads own row via a plain column predicate, NOT via the
    // STABLE green_room_can_view_post re-query that can't see the fresh row
    expect(policy).toMatch(/author_id = auth\.uid\(\)/)
    expect(policy).toContain('deleted_at IS NULL')
    // other-viewer visibility still routes through the existing helper, unchanged
    expect(policy).toContain('public.green_room_can_view_post(id, auth.uid())')
    // the author path must be OR-ed in, not replace the helper
    expect(policy).toMatch(/\bOR\b/)
  })

  it('does NOT touch the INSERT policy or its eligibility helper (085/087 stay authoritative for who may post)', () => {
    expect(ddl).not.toContain('green_room_posts_insert_own')
    expect(ddl).not.toContain('is_green_room_eligible')
    expect(ddl).not.toContain('WITH CHECK')
  })

  it('is a policy-only change — no destructive DDL, does not rewrite green_room_can_view_post', () => {
    expect(ddl).not.toContain('DROP TABLE')
    expect(ddl).not.toContain('DROP FUNCTION')
    expect(ddl).not.toContain('CREATE OR REPLACE FUNCTION')
    expect(ddl).not.toContain('handle_new_user')
  })

  it('is human-gated — carries the owner-push comment and leaves 085/086/087 untouched', () => {
    expect(migration).toMatch(/human-gated/i)
    expect(migration).toMatch(/supabase db push/i)
    expect(migration).toMatch(/Do NOT edit migrations 085\/086\/087/i)
  })
})
