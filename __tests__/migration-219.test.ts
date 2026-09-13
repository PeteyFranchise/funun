import { readFileSync } from 'fs'
import path from 'path'
import { WORKSPACE_RIGHTS_FIELD_VALUES } from '@/lib/workspaces/rights-proposals'

const sql = readFileSync(path.join(process.cwd(), 'supabase/migrations/219_workspace_rights_proposals.sql'), 'utf8')

describe('migration 219 workspace rights proposals', () => {
  it('stores exactly the D-41 field allowlist and no payout or tax field', () => {
    expect(sql).toContain(`field IN (${WORKSPACE_RIGHTS_FIELD_VALUES.map(value => `'${value}'`).join(', ')})`)
    expect(sql).not.toMatch(/payout_account|tax_id/)
  })

  it('locks the proposal and updates profile plus decision in one definer transaction', () => {
    expect(sql).toContain('FOR NO KEY UPDATE')
    expect(sql).toContain('UPDATE public.user_profiles')
    expect(sql).toContain('UPDATE public.workspace_rights_proposals')
    expect(sql).toContain("SET search_path = ''")
  })

  it('keeps browser roles off the table and decision function', () => {
    expect(sql).toContain('REVOKE ALL ON public.workspace_rights_proposals FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.decide_workspace_rights_proposal(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.decide_workspace_rights_proposal(UUID, UUID, TEXT) TO service_role')
  })
})
