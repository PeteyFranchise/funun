import fs from 'node:fs'
import path from 'node:path'

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/220_master_ownership_claims.sql'),
  'utf8'
)

describe('migration 220 master ownership claims', () => {
  it('creates an RLS ledger without browser access', () => {
    expect(sql).toContain('CREATE TABLE public.master_ownership_claims')
    expect(sql).toContain('ALTER TABLE public.master_ownership_claims ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE ALL ON public.master_ownership_claims FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE ON public.master_ownership_claims TO service_role')
  })

  it('uses the four doctrine states and no approved shortcut', () => {
    for (const state of ['claimed', 'contributor_confirmed', 'document_supported', 'disputed']) {
      expect(sql).toContain(`'${state}'`)
    }
    expect(sql).not.toMatch(/state IN \([^)]*'approved'/)
  })

  it('locks before deciding and binds evidence to the holder and graduated project', () => {
    expect(sql).toContain('FOR NO KEY UPDATE')
    expect(sql).toContain('d.user_id = p_holder_user_id')
    expect(sql).toContain('d.project_id = v_graduated_project_id')
    expect(sql).toContain("d.status IN ('signed', 'verified')")
    expect(sql).toContain('p.id = d.project_id AND p.user_id = p_holder_user_id')
  })

  it('hardens both definers and exposes them only to service_role', () => {
    expect(sql.match(/SECURITY DEFINER/g)).toHaveLength(3)
    expect(sql.match(/SET search_path = ''/g)).toHaveLength(3)
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.decide_master_ownership_claim(UUID, UUID, TEXT, UUID, TEXT) TO service_role')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.workspace_master_claim_access(UUID, UUID, TEXT) TO service_role')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.create_master_ownership_claim(UUID, UUID, UUID, TEXT) TO service_role')
  })

  it('derives the holder and restricts filing to active label owners or admins', () => {
    expect(sql).toContain("w.workspace_type = 'label'")
    expect(sql).toContain("m.role IN ('owner', 'admin')")
    expect(sql).toContain('INTO v_holder_user_id, v_graduated_project_id')
    expect(sql).toContain('SELECT p.user_id INTO v_holder_user_id')
    expect(sql).toContain('p_actor_user_id, v_holder_user_id')
  })

  it('allows only non-master capabilities and never produces media references', () => {
    expect(sql).toContain("'view_catalogue', 'view_metadata', 'view_readiness'")
    expect(sql).toContain("'manage_registrations', 'deliver_assets'")
    expect(sql).not.toContain("'access_clean_masters'")
    expect(sql).not.toMatch(/signed_url|audio_path|file_url/i)
  })

  it('keeps evidence-derived access independent of roster relationships', () => {
    const accessBody = sql.split('CREATE OR REPLACE FUNCTION public.workspace_master_claim_access')[1] ?? ''
    expect(accessBody).not.toContain('workspace_roster_relationships')
    expect(accessBody).toContain("c.state = 'document_supported'")
  })
})
