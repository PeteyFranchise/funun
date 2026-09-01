import { readFileSync } from 'fs'
import path from 'path'

const migration149 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/149_green_room_people_search.sql'),
  'utf8'
)

const sqlOnly = migration149
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

describe('migration 149 — Green Room people search', () => {
  it('aligns current and future profiles with the visible privacy setting', () => {
    expect(sqlOnly).toContain('ALTER COLUMN is_public SET DEFAULT true')
    expect(sqlOnly).toContain('SET is_public = true')
    expect(sqlOnly).toContain("profile_visibility IN ('public', 'connections_only')")
  })

  it('keeps exact-email lookup authenticated and returns only a UUID', () => {
    expect(sqlOnly).toContain('RETURNS UUID')
    expect(sqlOnly).toContain('FROM auth.users account')
    expect(sqlOnly).toContain('lower(account.email) = lower(trim(p_email))')
    expect(sqlOnly).toContain('TO authenticated')
    expect(sqlOnly).toContain('FROM PUBLIC, anon, authenticated')
  })

  it('enforces self, public, connection-only, and bidirectional-block privacy inside the RPC', () => {
    expect(sqlOnly).toContain('profile.id <> auth.uid()')
    expect(sqlOnly).toContain('profile.is_public = true')
    expect(sqlOnly).toContain("profile.profile_visibility = 'public'")
    expect(sqlOnly).toContain("profile.profile_visibility = 'connections_only'")
    expect(sqlOnly).toContain("connection.status = 'accepted'")
    expect(sqlOnly).toContain('public.no_block(auth.uid(), profile.id)')
  })

  it('does not add email to a public profile table or search vector', () => {
    expect(sqlOnly).not.toMatch(/ALTER TABLE public\.user_profiles[\s\S]+ADD COLUMN[^;]*email/i)
    expect(sqlOnly).not.toMatch(/search_vector[\s\S]*account\.email/i)
  })
})
