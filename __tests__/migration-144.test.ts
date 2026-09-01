import { readFileSync } from 'fs'
import path from 'path'

const migration144 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/144_writer_room_section_soft_locks.sql'),
  'utf8'
)

const sqlOnly = migration144
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

describe("migration 144 — Writer's Room lyric-section soft locks", () => {
  it('stores one short lease per block and removes it with the block', () => {
    expect(sqlOnly).toMatch(/block_id\s+UUID PRIMARY KEY REFERENCES public\.lyric_blocks\(id\) ON DELETE CASCADE/)
    expect(sqlOnly).toMatch(/expires_at\s+TIMESTAMPTZ NOT NULL/)
    expect(sqlOnly.match(/interval '30 seconds'/g)).toHaveLength(3)
  })

  it('grants a claim only for expiry, the same tab, or an explicit takeover', () => {
    expect(sqlOnly).toContain('current_lock.expires_at <= now()')
    expect(sqlOnly).toContain('current_lock.session_id = EXCLUDED.session_id')
    expect(sqlOnly).toContain('OR p_takeover')
  })

  it('locks the lease row and requires the exact user and tab before saving lyric text', () => {
    expect(sqlOnly).toMatch(/FOR UPDATE;/)
    expect(sqlOnly).toContain('v_uid := auth.uid()')
    expect(sqlOnly).toContain('v_lock.user_id <> v_uid')
    expect(sqlOnly).toContain('v_lock.session_id <> p_session_id')
    expect(sqlOnly).toContain("RAISE EXCEPTION 'lyric_lock_required'")
    expect(sqlOnly).toContain('repeat_of_block_id IS NULL')
  })

  it('keeps lock capabilities service-only', () => {
    expect(sqlOnly.match(/FROM PUBLIC, anon, authenticated/g)).toHaveLength(3)
    expect(sqlOnly.match(/TO service_role/g)).toHaveLength(2)
    expect(sqlOnly).toContain('REVOKE ALL ON TABLE public.work_lyric_block_locks')
    expect(sqlOnly).toMatch(/save_locked_lyric_block_text\(uuid, uuid, uuid, text\)[\s\S]+TO authenticated/)
  })

  it('extends the private room channel to presence and broadcast only', () => {
    expect(sqlOnly.match(/extension IN \('presence', 'broadcast'\)/g)).toHaveLength(2)
    // Once in the authenticated save guard, then once in each live-channel policy.
    expect(sqlOnly.match(/public\.is_work_owner/g)).toHaveLength(3)
    expect(sqlOnly.match(/public\.work_member_tier/g)).toHaveLength(3)
  })
})
