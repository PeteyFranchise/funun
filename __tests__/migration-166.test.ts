import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(path.join(process.cwd(), 'supabase/migrations/166_producer_return_loop.sql'), 'utf8')
const sqlOnly = migration.split('\n').filter(line => !line.trim().startsWith('--')).join('\n')

describe('migration 166 — producer return loop', () => {
  it('stores receipt and return facts separately from the immutable handoff', () => {
    expect(sqlOnly).toContain('CREATE TABLE public.work_recording_handoff_receipts')
    expect(sqlOnly).toContain('CREATE TABLE public.work_recording_handoff_returns')
    expect(sqlOnly).toContain('handoff_id        UUID PRIMARY KEY')
    expect(sqlOnly).toContain('version_id  UUID NOT NULL UNIQUE')
    expect(sqlOnly).not.toMatch(/ALTER TABLE public\.work_recording_handoffs\s+ADD COLUMN/)
  })

  it('keeps both tables member-private and service-write-only', () => {
    expect(sqlOnly).toContain('CREATE POLICY work_recording_handoff_receipts_select')
    expect(sqlOnly).toContain('CREATE POLICY work_recording_handoff_returns_select')
    expect(sqlOnly).toContain('REVOKE ALL ON public.work_recording_handoff_receipts FROM PUBLIC, anon, authenticated')
    expect(sqlOnly).toContain('REVOKE ALL ON public.work_recording_handoff_returns FROM PUBLIC, anon, authenticated')
    expect(sqlOnly).not.toMatch(/GRANT (INSERT|UPDATE|DELETE).*work_recording_handoff_(receipts|returns)/)
  })

  it('binds acknowledgement to the addressed recipient and returns to their new active upload', () => {
    expect(sqlOnly).toContain('handoff.recipient_user_id = NEW.recipient_user_id')
    expect(sqlOnly).toContain('handoff_row.recipient_user_id IS DISTINCT FROM NEW.created_by')
    expect(sqlOnly).toContain('version.work_id = NEW.work_id')
    expect(sqlOnly).toContain('version.user_id = NEW.created_by')
    expect(sqlOnly).toContain("version.source = 'upload'")
    expect(sqlOnly).toContain('version.archived_at IS NULL')
    expect(sqlOnly).toContain('version.created_at >= handoff_row.created_at')
  })

  it('captures both events without touching master, rights, split or release state', () => {
    expect(sqlOnly).toContain("'producer_handoff_received'")
    expect(sqlOnly).toContain("'producer_mix_returned'")
    expect(sqlOnly).toContain('trg_capture_work_recording_handoff_receipt')
    expect(sqlOnly).toContain('trg_capture_work_recording_handoff_return')
    expect(sqlOnly).not.toContain('song_passport_master_designations')
    expect(sqlOnly).not.toContain('split_sheets')
    expect(sqlOnly).not.toContain('vault_projects')
  })
})
