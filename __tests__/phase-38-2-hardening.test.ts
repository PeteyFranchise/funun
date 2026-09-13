import fs from 'node:fs'
import path from 'node:path'

const PHASE_DIR =
  '.planning/phases/38.2-member-workspaces-organization-billing-beta-rollout-doctrine-docs'

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

const workspaceMutationRoutes = [
  'app/api/workspaces/[workspaceId]/attachments/route.ts',
  'app/api/workspaces/[workspaceId]/grants/route.ts',
  'app/api/workspaces/[workspaceId]/invitations/route.ts',
  'app/api/workspaces/[workspaceId]/members/route.ts',
  'app/api/workspaces/[workspaceId]/ownership/route.ts',
  'app/api/workspaces/[workspaceId]/permission-requests/route.ts',
  'app/api/workspaces/[workspaceId]/projects/route.ts',
  'app/api/workspaces/[workspaceId]/roster/evidence/route.ts',
  'app/api/workspaces/[workspaceId]/roster/route.ts',
  'app/api/workspaces/[workspaceId]/rights-proposals/route.ts',
  'app/api/workspaces/[workspaceId]/master-claims/route.ts',
]

describe('Phase 38.2 hardening invariants', () => {
  it('keeps every workspace mutation behind the central billing write gate', () => {
    for (const relativePath of workspaceMutationRoutes) {
      expect(source(relativePath)).toContain('requireWorkspaceMutationAccess(')
    }

    // Invitation redemption cannot authorize against a workspace membership
    // that does not exist yet, so it resolves the same billing predicate only
    // after the opaque token identifies the workspace.
    expect(source('app/api/workspaces/invitations/accept/route.ts')).toContain(
      'resolveWorkspaceWritesAllowed(',
    )
  })

  it('keeps workspace billing additive to Member subscriptions', () => {
    const migration = source('supabase/migrations/221_workspace_billing_foundation.sql')
    expect(migration).toContain('CREATE TABLE public.workspace_subscriptions')
    expect(migration).not.toMatch(/(?:ALTER|UPDATE|DELETE FROM|DROP TABLE)\s+public\.subscriptions/i)
    expect(migration).not.toMatch(/ON DELETE CASCADE/i)
  })

  it('keeps beta usage informational and free of sensitive payload fields', () => {
    const migration = source('supabase/migrations/222_workspace_usage_metering.sql')
    expect(migration).toContain('This ledger measures beta use;')
    expect(migration).not.toMatch(/\b(prompt|contract_content|file_path|email|rights_data|metadata)\b/i)
    expect(migration).not.toMatch(/(?:quota|entitlement|charge|invoice)/i)
  })

  it('reuses the one rollout cohort and emergency control', () => {
    const candidates = [221, 222, 223]
      .map(number => source(`supabase/migrations/${number}_${[
        'workspace_billing_foundation',
        'workspace_usage_metering',
        'member_workspace_playbook_doctrine',
      ][number - 221]}.sql`))
      .join('\n')

    expect(candidates).not.toMatch(/CREATE TABLE public\.workspace_cohorts/i)
    expect(candidates).not.toMatch(/CREATE TABLE public\.workspace_access_config/i)

    const cohortRoute = source('app/api/admin/workspaces/cohorts/route.ts')
    expect(cohortRoute).toContain("requireStaff(['leadership'])")
    expect(cohortRoute).toContain('failClosed: true')

    const accessRoute = source('app/api/admin/workspaces/access/route.ts')
    expect(accessRoute).toContain("requireStaff(['leadership'])")
    expect(accessRoute).toContain('failClosed: true')
  })

  it('keeps all candidate migrations owner-gated', () => {
    for (const number of [221, 222, 223]) {
      const match = fs
        .readdirSync(path.join(process.cwd(), 'supabase/migrations'))
        .find(file => file.startsWith(`${number}_`))
      expect(match).toBeDefined()
      expect(source(`supabase/migrations/${match}`)).toMatch(/OWNER ACTION REQUIRED/)
    }
  })

  it('keeps production gates read-only', () => {
    for (const filename of ['38.2-PRE-APPLY-GATE.sql', '38.2-POST-APPLY-VERIFY.sql']) {
      const sql = source(`${PHASE_DIR}/${filename}`)
        .replace(/--.*$/gm, '')
        .replace(/'(?:''|[^'])*'/g, "''")
      expect(sql).not.toMatch(
        /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE|CALL|DO)\b/i,
      )
    }
  })

  it('records all four plans as complete', () => {
    for (const number of ['01', '02', '03', '04']) {
      expect(source(`${PHASE_DIR}/38.2-${number}-PLAN.md`)).toContain('status: complete')
      expect(fs.existsSync(path.join(process.cwd(), PHASE_DIR, `38.2-${number}-SUMMARY.md`))).toBe(
        true,
      )
    }
  })
})
