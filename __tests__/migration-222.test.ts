import fs from 'fs'
import path from 'path'

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/222_workspace_usage_metering.sql'),
  'utf8'
)

describe('migration 222 workspace usage metering', () => {
  it('uses a narrow, non-sensitive metric vocabulary', () => {
    for (const metric of [
      'storage_bytes_ingested', 'ai_requests', 'ai_input_tokens',
      'ai_output_tokens', 'esign_requests', 'audio_processing_seconds',
    ]) expect(sql).toContain(`'${metric}'`)
    expect(sql).not.toMatch(/prompt_text|contract_text|file_path|email_address|rights_data/i)
  })

  it('is positive, idempotent, append-only, and bounded', () => {
    expect(sql).toMatch(/quantity BIGINT NOT NULL CHECK \(quantity > 0\)/)
    expect(sql).toContain('UNIQUE (workspace_id, idempotency_key)')
    expect(sql).toContain('ON CONFLICT (workspace_id, idempotency_key) DO NOTHING')
    expect(sql).toContain('workspace_usage_events is append-only')
    expect(sql).toContain("interval '370 days'")
  })

  it('keeps browser roles out and service privileges narrow', () => {
    expect(sql).toContain(
      'REVOKE ALL ON public.workspace_usage_events FROM PUBLIC, anon, authenticated, service_role;'
    )
    expect(sql).toContain('GRANT SELECT, INSERT ON public.workspace_usage_events TO service_role;')
    expect(sql).not.toContain('GRANT UPDATE')
    expect(sql).not.toContain('GRANT DELETE')
  })

  it('does not create enforcement or touch personal subscriptions', () => {
    expect(sql).not.toMatch(/ALTER TABLE public\.subscriptions/i)
    expect(sql).not.toMatch(/workspace_writes_allowed/)
    expect(sql).not.toMatch(/stripe|checkout|invoice|charge/i)
  })
})
