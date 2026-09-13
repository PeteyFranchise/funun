import fs from 'fs'
import path from 'path'

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/221_workspace_billing_foundation.sql'),
  'utf8'
)

describe('migration 221 — workspace billing foundation', () => {
  it('creates a separate workspace subscription without altering Member subscriptions', () => {
    expect(sql).toContain('CREATE TABLE public.workspace_subscriptions')
    expect(sql).toContain('workspace_id UUID NOT NULL UNIQUE')
    expect(sql).not.toMatch(/ALTER TABLE public\.subscriptions/i)
    expect(sql).not.toMatch(/UPDATE public\.subscriptions/i)
  })

  it('defaults every workspace to a free active beta plan', () => {
    expect(sql).toContain("plan_key TEXT NOT NULL DEFAULT 'beta_free'")
    expect(sql).toContain("status TEXT NOT NULL DEFAULT 'beta_active'")
    expect(sql).toContain('provision_workspace_beta_subscription_after_insert')
    expect(sql).toContain('ON CONFLICT (workspace_id) DO NOTHING')
  })

  it('fails workspace writes closed on missing or lapsed state', () => {
    const body = sql.match(
      /CREATE OR REPLACE FUNCTION public\.workspace_writes_allowed[\s\S]*?REVOKE ALL ON FUNCTION public\.workspace_writes_allowed/
    )?.[0]
    expect(body).toContain("s.status IN ('beta_active', 'active')")
    expect(body).toContain('), FALSE)')
  })

  it('keeps browser roles off the tables and application functions', () => {
    expect(sql).toContain(
      'REVOKE ALL ON public.workspace_subscriptions FROM PUBLIC, anon, authenticated, service_role;'
    )
    expect(sql).toContain(
      'REVOKE ALL ON public.workspace_billing_events FROM PUBLIC, anon, authenticated, service_role;'
    )
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.workspace_writes_allowed(UUID) FROM PUBLIC, anon, authenticated;'
    )
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.workspace_writes_allowed(UUID) TO service_role;')
  })

  it('makes billing events append-only and state changes compare-and-swap', () => {
    expect(sql).toContain('CREATE TRIGGER protect_workspace_billing_events')
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON public.workspace_billing_events')
    expect(sql).toContain('IF v_current.updated_at <> p_expected_updated_at THEN RETURN \'stale\'; END IF;')
  })

  it('contains no destructive workspace-data statement or payment instrument', () => {
    expect(sql).not.toMatch(/DELETE FROM public\.(workspaces|workspace_|vault_|master_ownership|rights_)/i)
    expect(sql).not.toMatch(/payment_method|card_number|bank_account|tax_id/i)
  })
})
