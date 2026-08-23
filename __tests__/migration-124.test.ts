import { readFileSync } from 'fs'
import { join } from 'path'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/124_docuseal_completion_claim.sql'),
  'utf8'
).replace(/^\s*--.*$/gm, '')

describe('migration 124 — atomic DocuSeal completion', () => {
  it('adds a claimed state and unique provider submission key', () => {
    expect(sql).toContain("'pending', 'completing', 'completed', 'voided', 'expired'")
    expect(sql).toMatch(/CREATE UNIQUE INDEX idx_esign_envelopes_docuseal_submission_id/i)
    expect(sql).toMatch(/WHERE docuseal_submission_id IS NOT NULL/i)
  })

  it('prevents duplicate fan-out rows for one account and completion', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX idx_vault_documents_split_sheet_completion/i)
    expect(sql).toContain("document_data ->> 'split_sheet_id'")
    expect(sql).toContain("document_data #>> '{esign,requestId}'")
  })

  it('claims exactly one pending or expired completion lease', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.claim_docuseal_completion/i)
    expect(sql).toMatch(/status = 'pending'[\s\S]*status = 'completing'/i)
    expect(sql).toMatch(/completion_claimed_at < NOW\(\) - make_interval/i)
    expect(sql).toMatch(/RETURN FOUND/i)
  })

  it('fences release and completion with the winning token', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.release_docuseal_completion_claim/i)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.complete_docuseal_completion_claim/i)
    expect(sql.match(/AND completion_claim_token = p_claim_token/g)).toHaveLength(2)
    expect(sql).toMatch(/status = 'completed'/i)
  })

  it('exposes claim functions only to the service role', () => {
    expect(sql.match(/REVOKE ALL ON FUNCTION/g)).toHaveLength(3)
    expect(sql.match(/GRANT EXECUTE ON FUNCTION/g)).toHaveLength(3)
  })
})
