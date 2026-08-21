import { readFileSync } from 'fs'
import path from 'path'

// Structural assertions on migration 118 (audit #5/#10 — durable job queue).
const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/118_jobs_queue.sql'),
  'utf8'
)
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')

describe('migration 118 — durable job queue', () => {
  it('creates the jobs table with a constrained status', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.jobs')
    expect(sql).toMatch(/status\s+TEXT NOT NULL DEFAULT 'pending'/)
    expect(sql).toContain("CHECK (status IN ('pending', 'processing', 'completed', 'failed'))")
  })

  it('enforces at most one ACTIVE job per dedup_key (idempotent enqueue)', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS jobs_active_dedup\s+ON public\.jobs \(dedup_key\)/)
    expect(sql).toContain("WHERE status IN ('pending', 'processing') AND dedup_key IS NOT NULL")
  })

  it('locks the table down to the service role only', () => {
    expect(sql).toContain('ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE ALL ON public.jobs FROM authenticated, anon')
  })

  it('claims jobs atomically with FOR UPDATE SKIP LOCKED', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.claim_next_job(p_type TEXT DEFAULT NULL)')
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain("SET search_path = ''")
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
    expect(sql).toMatch(/status = 'processing'/)
    expect(sql).toMatch(/attempts = j\.attempts \+ 1/)
  })

  it('restricts EXECUTE on claim_next_job to the service role', () => {
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.claim_next_job(TEXT) FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.claim_next_job(TEXT) TO service_role')
  })
})
