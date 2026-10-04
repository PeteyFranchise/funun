import fs from 'fs'
import path from 'path'

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/230_track_work_direct_link.sql'),
  'utf8'
)

describe('migration 230 — tracks.work_id direct link', () => {
  it('adds work_id as a nullable FK to works, ON DELETE SET NULL, and indexes it', () => {
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS work_id UUID REFERENCES public.works(id) ON DELETE SET NULL'
    )
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_tracks_work_id ON public.tracks (work_id)')
  })

  it('states on the column itself that NULL means "we do not know", never "no work"', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN public\.tracks\.work_id IS/)
    expect(sql).toMatch(/we do not know/)
    expect(sql).toMatch(/MUST NEVER be read as "no work"/)
  })

  it('revokes client INSERT/UPDATE on work_id from authenticated and anon', () => {
    expect(sql).toContain('REVOKE INSERT (work_id), UPDATE (work_id) ON public.tracks FROM authenticated, anon')
  })

  it('backfills from the Song Passport chain, keyed by track_id, guarded against re-run', () => {
    expect(sql).toMatch(/UPDATE public\.tracks t\s*\nSET work_id = sp\.work_id/)
    expect(sql).toContain('FROM public.song_passport_release_links link')
    expect(sql).toContain('JOIN public.song_passports sp ON sp.id = link.passport_id')
    expect(sql).toContain('WHERE t.id = link.track_id')
    expect(sql).toContain('AND t.work_id IS NULL')
  })

  it('replaces graduate_song_passport_to_release with the function body', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.graduate_song_passport_to_release')
  })

  it("writes work_id in the same INSERT that creates the track, from v_work.id", () => {
    expect(sql).toContain(
      'project_id, user_id, title, track_number, duration_seconds, isrc,\n    audio_file_url, audio_file_size, lyrics, metadata, work_id'
    )
    expect(sql).toMatch(/jsonb_build_object\(\s*\n\s*'song_passport_id', p_passport_id,[\s\S]*?\n\s*\), v_work\.id/)
  })

  it('reissues the exact grant posture — service_role only — after the replace', () => {
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.graduate_song_passport_to_release(UUID, UUID, UUID, TEXT)\n  FROM PUBLIC, anon, authenticated;'
    )
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.graduate_song_passport_to_release(UUID, UUID, UUID, TEXT)\n  TO service_role;'
    )
  })

  it('documents a zero-rows-when-healthy drift-detection query', () => {
    expect(sql).toMatch(/DETECTING DRIFT/)
    expect(sql).toMatch(/IS DISTINCT FROM sp\.work_id/)
  })

  it('ends with a schema-cache reload', () => {
    expect(sql.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
