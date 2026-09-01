import { readFileSync } from 'fs'
import path from 'path'

const migration145 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/145_writer_room_lyric_snapshots.sql'),
  'utf8'
)

const sqlOnly = migration145
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

describe("migration 145 — Writer's Room recoverable lyric snapshots", () => {
  it('stores immutable section recovery points with one capture key per editing session', () => {
    expect(sqlOnly).toContain('CREATE TABLE public.work_lyric_block_snapshots')
    expect(sqlOnly).toMatch(/UNIQUE \(block_id, capture_key\)/)
    expect(sqlOnly).toContain("reason IN ('edit_session_start', 'before_restore')")
    expect(sqlOnly).toContain("v_lock.edit_cycle_id, 'edit_session_start', v_current.text, v_uid")
    expect(sqlOnly).toContain('ON CONFLICT (block_id, capture_key) DO NOTHING')
    expect(sqlOnly).toContain('ADD COLUMN edit_cycle_id UUID NOT NULL DEFAULT gen_random_uuid()')
    expect(sqlOnly).toContain('THEN current_lock.edit_cycle_id')
  })

  it('captures only when accepted text actually changes, not on every save attempt', () => {
    expect(sqlOnly).toContain('IF p_text IS DISTINCT FROM v_current.text THEN')
    expect(sqlOnly).toContain("char_length(p_text) > 4000")
  })

  it('blocks direct lyric text updates and permits only scoped database write paths', () => {
    expect(sqlOnly).toContain('CREATE TRIGGER trg_enforce_lyric_text_write_path')
    expect(sqlOnly).toContain("v_write_mode IS NULL OR v_write_mode NOT IN ('locked_save', 'restore', 'detach')")
    expect(sqlOnly).toContain("RAISE EXCEPTION 'lyric_text_write_path_required'")
    expect(sqlOnly).toContain("set_config('funun.lyric_text_write', 'locked_save', TRUE)")
    expect(sqlOnly).toContain("set_config('funun.lyric_text_write', 'restore', TRUE)")
    expect(sqlOnly).toContain("set_config('funun.lyric_text_write', 'detach', TRUE)")
  })

  it('requires the exact active writer and tab before a restore', () => {
    expect(sqlOnly).toContain('v_lock.user_id <> v_uid')
    expect(sqlOnly).toContain('v_lock.session_id <> p_session_id')
    expect(sqlOnly).toContain('v_lock.expires_at <= now()')
    expect(sqlOnly).toContain("RAISE EXCEPTION 'lyric_lock_required'")
  })

  it('preserves the displaced current words before restoring an earlier version', () => {
    expect(sqlOnly).toContain("gen_random_uuid(), 'before_restore', v_current.text, v_uid")
    expect(sqlOnly).toContain('SET text = v_snapshot.text')
  })

  it('records a restore distinctly in the trigger-sourced song diary', () => {
    expect(sqlOnly).toContain("set_config('funun.lyric_restore_snapshot_id'")
    expect(sqlOnly).toContain("THEN 'edited' ELSE 'restored' END")
    expect(sqlOnly).toContain("'snapshotId', v_restore_snapshot_id")
  })

  it('allows member reads but keeps all snapshot writes behind database functions', () => {
    expect(sqlOnly).toContain('CREATE POLICY work_lyric_block_snapshots_select')
    expect(sqlOnly).toMatch(/GRANT SELECT \([\s\S]+\) ON public\.work_lyric_block_snapshots TO authenticated/)
    expect(sqlOnly).toContain('REVOKE ALL ON TABLE public.work_lyric_block_snapshots FROM PUBLIC, anon, authenticated')
    expect(sqlOnly).toMatch(/restore_locked_lyric_block_snapshot\(uuid, uuid, uuid, uuid\)[\s\S]+TO authenticated/)
    expect(sqlOnly).toMatch(/detach_lyric_block_with_text\(uuid, uuid, text\)[\s\S]+TO authenticated/)
  })
})
