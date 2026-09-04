import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/175_upload_admission.sql'),
  'utf8'
)

describe('migration 175 — durable upload admission', () => {
  it('limits daily count, bytes, concurrency, and retention per authenticated user', () => {
    expect(migration).toContain('CREATE TABLE public.upload_admission_claims')
    expect(migration).toContain('idx_upload_admission_retention')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('v_active >= v_concurrency_limit')
    expect(migration).toContain('v_bytes + p_declared_bytes > v_byte_limit')
    expect(migration).toContain("created_at < now() - interval '90 days'")
    expect(migration).toContain('user_id = auth.uid()')
  })
})
