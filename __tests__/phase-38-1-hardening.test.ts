import fs from 'node:fs'
import path from 'node:path'

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

const mutationRoutes = [
  'app/api/workspaces/[workspaceId]/rights-proposals/route.ts',
  'app/api/settings/rights-proposals/route.ts',
  'app/api/workspaces/[workspaceId]/master-claims/route.ts',
  'app/api/settings/master-claims/route.ts',
]

describe('Phase 38.1 hardening invariants', () => {
  it.each(mutationRoutes)('%s applies a durable fail-closed rate limit', relativePath => {
    const file = source(relativePath)
    expect(file).toContain('checkRateLimit(')
    expect(file).toContain('failClosed: true')
    expect(file).toContain('status: 429')
  })

  it.each(mutationRoutes)('%s does not return credential or storage fields', relativePath => {
    const file = source(relativePath)
    expect(file).not.toMatch(/service_role_key|supabase_service_role_key|audio_path|signed_url/i)
  })

  it('marks all claim-list responses private and non-cacheable', () => {
    for (const relativePath of mutationRoutes) {
      expect(source(relativePath)).toContain("'Cache-Control': 'private, no-store'")
    }
  })

  it('keeps the clean-master capability absent from evidence-derived access', () => {
    const migration = source('supabase/migrations/220_master_ownership_claims.sql')
    const accessFunction = migration
      .split('CREATE OR REPLACE FUNCTION public.workspace_master_claim_access')[1]
      ?.split('REVOKE ALL ON FUNCTION')[0] ?? ''
    expect(accessFunction).not.toContain('access_clean_masters')
    expect(accessFunction).not.toMatch(/audio_path|file_url|signed_url/i)
  })

  it('does not show the master-claim workspace route outside Label workspaces', () => {
    const nav = source('components/nav/WorkspaceNav.tsx')
    expect(nav).toContain("showMasterClaims={workspace.type === 'label'}")
  })
})
