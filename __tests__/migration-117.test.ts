import { readFileSync } from 'fs'
import path from 'path'

// Structural assertions on migration 117 (audit #6 — Selects reaction cap).
const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/117_selects_reaction_cap.sql'),
  'utf8'
)
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')

describe('migration 117 — selects reaction cap', () => {
  it('defines the cap function as SECURITY DEFINER with a locked search_path', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.enforce_selects_reaction_cap()')
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain("SET search_path = ''")
  })

  it('counts per selects_track_id and raises once the cap is reached', () => {
    expect(sql).toMatch(/WHERE selects_track_id = NEW\.selects_track_id/)
    expect(sql).toMatch(/v_count >= 500/)
    expect(sql).toContain('RAISE EXCEPTION')
  })

  it('installs a BEFORE INSERT trigger on selects_reactions', () => {
    expect(sql).toMatch(/CREATE TRIGGER selects_reaction_cap\s+BEFORE INSERT ON public\.selects_reactions/)
    expect(sql).toContain('FOR EACH ROW EXECUTE FUNCTION public.enforce_selects_reaction_cap()')
  })
})
