import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(path.join(process.cwd(), 'supabase/migrations/168_producer_handoff_workspace.sql'), 'utf8')
const sqlOnly = migration.split('\n').filter(line => !line.trim().startsWith('--')).join('\n')

describe('migration 168 — producer handoff workspace', () => {
  it('adds optional brief and feedback context without creating approval state', () => {
    expect(sqlOnly).toContain('ADD COLUMN round_label TEXT')
    expect(sqlOnly).toContain('ADD COLUMN feedback_snapshot JSONB NOT NULL')
    expect(sqlOnly).toContain('ADD COLUMN feedback_responses JSONB NOT NULL')
    expect(sqlOnly).toContain("jsonb_array_length(feedback_snapshot) <= 25")
    expect(sqlOnly).not.toMatch(/ADD COLUMN\s+(approved|rejected|deadline|due_at|master_id)/)
  })

  it('keeps progress, nudges and latest-only activity room-private and service-write-only', () => {
    expect(sqlOnly).toContain('CREATE TABLE public.work_recording_handoff_progress')
    expect(sqlOnly).toContain('CREATE TABLE public.work_recording_handoff_nudges')
    expect(sqlOnly).toContain('CREATE TABLE public.work_recording_handoff_activity')
    expect(sqlOnly).toContain('PRIMARY KEY (handoff_id, actor_user_id, kind)')
    expect(sqlOnly).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sqlOnly).toContain('REVOKE ALL ON public.work_recording_handoff_activity FROM PUBLIC, anon, authenticated')
    expect(sqlOnly).not.toMatch(/GRANT (INSERT|UPDATE|DELETE).*work_recording_handoff_(progress|nudges|activity)/)
  })

  it('atomically binds working, nudge and activity writes to the authenticated identity supplied by the service route', () => {
    expect(sqlOnly).toContain('handoff_row.recipient_user_id IS DISTINCT FROM p_producer')
    expect(sqlOnly).toContain('handoff_row.created_by <> p_sender')
    expect(sqlOnly).toContain("nudge.created_at > now() - INTERVAL '24 hours'")
    expect(sqlOnly).toContain("p_kind NOT IN ('listened', 'compared')")
    expect(sqlOnly).toContain('p_version_id = handoff_row.rough_version_id')
    expect(sqlOnly).toContain('ON CONFLICT (handoff_id, actor_user_id, kind) DO UPDATE')
  })

  it('does not turn lightweight context into noisy immutable diary history', () => {
    expect(sqlOnly).not.toContain('work_diary_events')
    expect(sqlOnly).not.toContain('split_sheets')
    expect(sqlOnly).not.toContain('song_passport_master_designations')
  })
})
