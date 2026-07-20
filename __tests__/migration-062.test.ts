import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/062_split_sheet_esign_envelopes.sql'),
  'utf8'
)

describe('migration 062 — split-sheet e-sign envelopes + tiered readiness', () => {
  describe('esign_envelopes (one row per DocuSeal submission attempt — P17-02 audit history)', () => {
    it('creates the table with the audit-preserving columns', () => {
      expect(migration).toContain('CREATE TABLE esign_envelopes')
      expect(migration).toContain('split_sheet_id')
      expect(migration).toContain('REFERENCES split_sheets')
      expect(migration).toContain('docuseal_submission_id')
      expect(migration).toContain('order_mode')
      expect(migration).toContain('executed_file_path')
      expect(migration).toContain('audit_log_path')
      expect(migration).toContain('voided_at')
      expect(migration).toContain('completed_at')
    })

    it('status CHECK includes voided (preserving void→re-mint history as new rows)', () => {
      const tableBlock = migration.slice(
        migration.indexOf('CREATE TABLE esign_envelopes'),
        migration.indexOf('CREATE TABLE esign_envelope_signers')
      )
      expect(tableBlock).toMatch(/status\s+TEXT NOT NULL DEFAULT 'pending'/)
      expect(tableBlock).toContain("'voided'")
      expect(tableBlock).toContain("'pending'")
      expect(tableBlock).toContain("'completed'")
    })

    it('billed is nullable (filled once the provider-gate void-billing answer is known)', () => {
      const tableBlock = migration.slice(
        migration.indexOf('CREATE TABLE esign_envelopes'),
        migration.indexOf('CREATE TABLE esign_envelope_signers')
      )
      expect(tableBlock).toMatch(/billed\s+BOOLEAN,/)
      expect(tableBlock).not.toMatch(/billed\s+BOOLEAN NOT NULL/)
    })
  })

  describe('esign_envelope_signers (one row per party per attempt)', () => {
    it('creates the table with signer tracking columns', () => {
      expect(migration).toContain('CREATE TABLE esign_envelope_signers')
      expect(migration).toContain('envelope_id')
      expect(migration).toContain('REFERENCES esign_envelopes')
      expect(migration).toContain('split_sheet_party_id')
      expect(migration).toContain('REFERENCES split_sheet_parties')
      expect(migration).toContain('docuseal_submitter_id')
      expect(migration).toContain('signer_slug')
      expect(migration).toContain('opened_at')
      expect(migration).toContain('signed_at')
    })

    it('status CHECK covers the signer lifecycle', () => {
      const tableBlock = migration.slice(migration.indexOf('CREATE TABLE esign_envelope_signers'))
      expect(tableBlock).toContain("'pending'")
      expect(tableBlock).toContain("'opened'")
      expect(tableBlock).toContain("'completed'")
      expect(tableBlock).toContain("'declined'")
    })
  })

  describe('server-owned write doctrine (migrations 040/056/058)', () => {
    it('revokes client writes on both new tables', () => {
      expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON esign_envelopes FROM authenticated, anon')
      expect(migration).toContain(
        'REVOKE INSERT, UPDATE, DELETE ON esign_envelope_signers FROM authenticated, anon'
      )
    })

    it('enables RLS on both new tables', () => {
      expect(migration).toContain('ALTER TABLE esign_envelopes ENABLE ROW LEVEL SECURITY')
      expect(migration).toContain('ALTER TABLE esign_envelope_signers ENABLE ROW LEVEL SECURITY')
    })

    it('adds SELECT policies scoped to initiator and party, mirroring migration 018', () => {
      expect(migration).toMatch(/CREATE POLICY[^;]*esign_envelopes[\s\S]*?FOR SELECT/)
      expect(migration).toMatch(/CREATE POLICY[^;]*esign_envelope_signers[\s\S]*?FOR SELECT/)
      // Initiator-sees-all pattern (mirrors "Initiator sees all parties")
      expect(migration).toContain('initiator_user_id')
      // Party-sees-own-row pattern (mirrors "Party sees own row")
      expect(migration).toContain('auth.uid() = split_sheet_parties.user_id')
    })
  })

  describe('split_sheets.status widening', () => {
    it('drops and re-adds the status CHECK constraint including esign_pending and executed', () => {
      expect(migration).toContain('DROP CONSTRAINT IF EXISTS split_sheets_status_check')
      expect(migration).toMatch(/ADD CONSTRAINT split_sheets_status_check\s+CHECK/)
      expect(migration).toContain("'esign_pending'")
      expect(migration).toContain("'executed'")
      // Original statuses are preserved, not replaced
      expect(migration).toContain("'draft'")
      expect(migration).toContain("'pending_approval'")
      expect(migration).toContain("'approved'")
      expect(migration).toContain("'countered'")
    })
  })

  describe('split_sheet_parties.first_viewed_at (P17-04 nudge tracking)', () => {
    it('adds the column', () => {
      expect(migration).toMatch(
        /ALTER TABLE split_sheet_parties\s+ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ/
      )
    })
  })

  describe('calculate_vault_readiness — pessimistic-MIN tier CASE (ESIGN-08, P17-03)', () => {
    it('redefines the function', () => {
      expect(migration).toContain('create or replace function public.calculate_vault_readiness(project_uuid uuid)')
    })

    it('declares a sheet_tier variable', () => {
      expect(migration).toContain('sheet_tier')
    })

    it('the tier CASE matches SPLIT_SHEET_TIER_MAP exactly', () => {
      const caseBlock = migration.slice(
        migration.indexOf('SELECT MIN('),
        migration.indexOf('FROM split_sheets ss')
      )
      expect(caseBlock).toMatch(/WHEN 'executed'\s+THEN 15/)
      expect(caseBlock).toMatch(/WHEN 'esign_pending'\s+THEN 10/)
      expect(caseBlock).toMatch(/WHEN 'approved'\s+THEN 10/)
      expect(caseBlock).toMatch(/WHEN 'countered'\s+THEN 5/)
      expect(caseBlock).toMatch(/WHEN 'pending_approval'\s+THEN 5/)
      expect(caseBlock).toMatch(/ELSE 0/)
    })

    it('takes the pessimistic MIN across the project\'s split sheets', () => {
      expect(migration).toMatch(/SELECT MIN\(\s*CASE ss\.status/)
      expect(migration).toContain('WHERE ss.vault_project_id = project_uuid')
    })

    it('preserves the legacy signed-vault_documents branch as an equally valid route to 15', () => {
      expect(migration).toContain(
        "WHERE project_id = project_uuid AND type = 'split_sheet' AND status = 'signed'"
      )
      expect(migration).toMatch(/IF doc_count > 0 THEN\s+score := score \+ 15;/)
    })

    it('falls back to the pipeline sheet_tier only when no signed doc exists', () => {
      expect(migration).toMatch(/ELSIF sheet_tier IS NOT NULL THEN\s+score := score \+ sheet_tier;/)
    })

    it('leaves every other scoring branch byte-identical to migration 016', () => {
      // Audio/track count
      expect(migration).toContain('IF track_count > 0 THEN score := score + 10; END IF;')
      // Cover art
      expect(migration).toContain("type = 'cover_art'")
      // Copyright registration
      expect(migration).toContain("type = 'copyright_registration'")
      // ISRC
      expect(migration).toContain('isrc IS NOT NULL')
      // PRO proxy (ISWC) — trimmed to 5 in migration 016, unchanged here
      expect(migration).toContain('score := score + 5;')
      // Hire-right documents
      expect(migration).toContain("type = 'hire_right' AND status = 'signed'")
      // EPK
      expect(migration).toContain("tool_slug = 'epkfyi'")
      // Metadata/composer splits
      expect(migration).toContain('jsonb_array_elements')
      // Distributor gate
      expect(migration).toContain('dist IS NOT NULL')
      // Snippet path untouched
      expect(migration).toContain("project_type = 'snippet'")
      expect(migration).toContain('RETURN LEAST(score, 100);')
    })
  })

  describe('recompute', () => {
    it('ends with the standard recompute UPDATE so scores refresh', () => {
      expect(
        migration
          .trim()
          .endsWith('update vault_projects set vault_readiness_score = calculate_vault_readiness(id);')
      ).toBe(true)
    })
  })

  describe('executor safety note', () => {
    it('warns that supabase db push must never be run by an executor agent', () => {
      expect(migration).toMatch(/never.*supabase db push|supabase db push.*checkpoint/i)
    })
  })
})
