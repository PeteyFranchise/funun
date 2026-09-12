import { readFileSync } from 'fs'
import path from 'path'

const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/217_atomic_playbook_operations.sql'),
  'utf8'
)

describe('migration 217 atomic Playbook operations', () => {
  it('is explicitly human-gated', () => {
    expect(sql).toContain('HUMAN-GATED')
  })

  it('uses compare-and-swap before recording a feature-control event', () => {
    const block = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.mutate_playbook_feature_control'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.open_playbook_incident')
    )
    expect(block).toContain('AND updated_at = p_expected_updated_at')
    expect(block).toContain('IF NOT FOUND THEN RETURN FALSE; END IF')
    expect(block.indexOf('UPDATE public.playbook_feature_controls')).toBeLessThan(
      block.indexOf('INSERT INTO public.playbook_feature_control_events')
    )
  })

  it('creates and transitions incidents together with their audit events', () => {
    expect(sql).toContain('INSERT INTO public.playbook_incidents')
    expect(sql).toContain('INSERT INTO public.playbook_incident_events')
    expect(sql).toContain('AND status = p_expected_status')
    expect(sql).toContain('IF NOT FOUND THEN RETURN FALSE; END IF')
  })

  it('hardens every definer and grants execution only to service_role', () => {
    expect(sql.match(/SECURITY DEFINER/g)).toHaveLength(3)
    expect(sql.match(/SET search_path = ''/g)).toHaveLength(3)
    expect(sql.match(/FROM PUBLIC, anon, authenticated;/g)).toHaveLength(3)
    expect(sql.match(/TO service_role;/g)).toHaveLength(3)
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]{0,180}TO (anon|authenticated)\b/)
  })
})
