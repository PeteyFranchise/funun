import { readFileSync } from 'fs'
import path from 'path'

const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/123_job_claim_leases.sql'),
  'utf8'
)
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')

describe('migration 123 — crash-recoverable job leases (audit #6)', () => {
  it('adds a lease and a per-attempt fencing token', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS claim_token UUID')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ')
    expect(sql).toContain('claim_token = v_claim_token')
    expect(sql).toContain('lease_expires_at = now() + make_interval(secs => p_lease_seconds)')
  })

  it('reclaims expired processing work and terminates exhausted jobs', () => {
    expect(sql).toContain("WHERE status = 'processing'")
    expect(sql).toContain('lease_expires_at IS NULL OR lease_expires_at <= now()')
    expect(sql).toContain("CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END")
    expect(sql).toContain("jsonb_build_object('error', 'job lease expired')")
  })

  it('claims only retryable pending work under a row lock', () => {
    expect(sql).toContain("WHERE c.status = 'pending'")
    expect(sql).toContain('c.attempts < c.max_attempts')
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
  })

  it('validates lease bounds and keeps the RPC service-role-only', () => {
    expect(sql).toContain('p_lease_seconds < 15 OR p_lease_seconds > 900')
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.claim_next_job(TEXT, INT) FROM PUBLIC, anon, authenticated'
    )
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.claim_next_job(TEXT, INT) TO service_role'
    )
  })
})
