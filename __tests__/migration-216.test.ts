import { readFileSync } from 'fs'
import path from 'path'

const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/216_atomic_esign_mint_claims.sql'),
  'utf8'
)

describe('migration 216 atomic e-sign mint claims', () => {
  it('is human-gated and keeps the claim ledger unavailable to browser roles', () => {
    expect(sql).toContain('HUMAN-GATED')
    expect(sql).toContain('ALTER TABLE public.esign_mint_claims ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain(
      'REVOKE ALL ON public.esign_mint_claims FROM PUBLIC, anon, authenticated'
    )
    expect(sql).toContain(
      'PRIMARY KEY (instrument_kind, subject_id)'
    )
  })

  it('has database uniqueness barriers for both e-sign instrument classes', () => {
    expect(sql).toContain('idx_esign_envelopes_one_active_per_sheet')
    expect(sql).toContain("WHERE status IN ('pending', 'completing')")
    expect(sql).toContain('idx_vault_documents_one_blanket_agreement')
    expect(sql).toContain("type = 'blanket_agreement' AND status IN ('pending', 'signed', 'verified')")
  })

  it('blocks automatic remint after a provider object exists', () => {
    expect(sql).toContain("IF v_claim.provider_request_id IS NOT NULL THEN RETURN 'reconcile'; END IF")
    expect(sql).toContain('record_esign_mint_provider')
    expect(sql).toContain('AND provider_request_id IS NULL')
    expect(sql).toContain('AND provider_request_id = p_provider_request_id')
  })

  it('hardens every definer and grants execution only to service_role', () => {
    expect(sql.match(/SECURITY DEFINER/g)).toHaveLength(4)
    expect(sql.match(/SET search_path = ''/g)).toHaveLength(4)
    expect(sql.match(/REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC, anon, authenticated;/g)).toHaveLength(4)
    expect(sql.match(/GRANT EXECUTE ON FUNCTION[\s\S]*?TO service_role;/g)).toHaveLength(4)
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]{0,160}TO (anon|authenticated)\b/)
  })
})
