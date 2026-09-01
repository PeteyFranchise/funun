import { readFileSync } from 'fs'
import path from 'path'

const migration148 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/148_writer_room_existing_collaborator_repair.sql'),
  'utf8'
)

const sqlOnly = migration148
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

describe("migration 148 — Writer's Room existing collaborator repair", () => {
  it('restores the lifecycle columns expected by roster queries', () => {
    expect(sqlOnly).toContain('ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ')
    expect(sqlOnly).toContain('ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false')
  })

  it('matches duplicates only inside one owner roster using normalized email', () => {
    expect(sqlOnly).toContain('canonical.user_id = duplicate.user_id')
    expect(sqlOnly).toContain('lower(trim(canonical.email)) = lower(trim(duplicate.email))')
    expect(sqlOnly).toContain('canonical.claimed_by IS NOT NULL')
    expect(sqlOnly).toContain('duplicate.claimed_by IS NULL')
  })

  it('repoints pending work membership to the claimed collaborator and user', () => {
    expect(sqlOnly).toContain('collaborator_id = pair.canonical_id')
    expect(sqlOnly).toContain('user_id = pair.canonical_user_id')
    expect(sqlOnly).toContain('member.user_id IS NULL OR member.user_id = pair.canonical_user_id')
  })

  it('expires obsolete invites and archives duplicates without deleting roster history', () => {
    expect(sqlOnly).toContain("SET status = 'expired'")
    expect(sqlOnly).toContain('SET archived_at = COALESCE(duplicate.archived_at, now())')
    expect(sqlOnly).not.toMatch(/DELETE FROM public\.collaborators/i)
  })

  it('preserves membership and split ownership as separate facts', () => {
    expect(sqlOnly).not.toMatch(/INSERT INTO public\.split_sheet_parties/i)
    expect(sqlOnly).not.toMatch(/UPDATE public\.split_sheet_parties/i)
  })
})
