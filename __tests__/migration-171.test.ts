import { readFileSync } from 'fs'
import path from 'path'

const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/171_writer_room_lyric_lift.sql'),
  'utf8'
)

describe('migration 171 — Writer’s Room Lyric Lift', () => {
  it('stores private durable drafts, timestamped sections, and immutable block provenance', () => {
    expect(sql).toContain('CREATE TABLE public.work_lyric_lifts')
    expect(sql).toContain('CREATE TABLE public.work_lyric_lift_sections')
    expect(sql).toContain('CREATE TABLE public.work_lyric_lift_block_links')
    expect(sql).toContain('start_ms')
    expect(sql).toContain('repeat_of_section_id')
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE ALL ON public.work_lyric_lifts FROM authenticated, anon')
  })

  it('permits one open draft per room and never exposes a replace mode', () => {
    expect(sql).toContain('work_lyric_lifts_one_open_per_work')
    expect(sql).toContain("'discarded'")
    expect(sql).toContain("p_mode NOT IN ('empty_only', 'append')")
    expect(sql).not.toMatch(/p_mode[^\n]*replace/)
  })

  it('keeps transcription provenance separate from songwriting credit', () => {
    expect(sql).toContain("'human',\n      NULL")
    expect(sql).toContain("block's author_user_id remains NULL")
    expect(sql).toContain('p_actor_id')
  })

  it('applies and reorders through service-only atomic functions', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.apply_work_lyric_lift')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.reorder_work_lyric_lift_sections')
    expect(sql).toContain('FOR UPDATE')
    expect(sql).toContain('SET CONSTRAINTS work_lyric_lift_sections_position_unique DEFERRED')
    expect(sql).toContain('TO service_role')
  })
})
