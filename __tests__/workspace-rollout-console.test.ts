import fs from 'fs'
import path from 'path'

function source(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8')
}

describe('workspace rollout operations boundary', () => {
  const cohortRoute = source('app/api/admin/workspaces/cohorts/route.ts')
  const accessRoute = source('app/api/admin/workspaces/access/route.ts')
  const page = source('app/(admin)/admin/workspaces/page.tsx')

  it('keeps both controls leadership-only and rate limited fail closed', () => {
    for (const route of [cohortRoute, accessRoute]) {
      expect(route.indexOf("requireStaff(['leadership'])")).toBeGreaterThan(0)
      expect(route).toContain('failClosed: true')
      expect(route).toContain('status: 429')
    }
  })

  it('accepts only strict pilot cohort mutations and never deletes history', () => {
    expect(cohortRoute).toContain("stage: 'pilot'")
    expect(cohortRoute).toContain(".eq('stage', 'pilot')")
    expect(cohortRoute).toContain("action: z.literal('set_enabled')")
    expect(cohortRoute).not.toMatch(/\.delete\(/)
  })

  it('audits every successful cohort mutation', () => {
    expect(cohortRoute).toContain("action: 'workspace_cohort.add'")
    expect(cohortRoute).toContain("'workspace_cohort.enable'")
    expect(cohortRoute).toContain("'workspace_cohort.disable'")
  })

  it('reuses the existing controls rather than introducing duplicate truth', () => {
    expect(page).toContain('readWorkspaceAccessState(service)')
    expect(page).toContain(".from('workspace_cohorts')")
    expect(page).toContain('isWorkspaceCohortRequired()')
    expect(page).not.toMatch(/workspace_rollout_config|workspace_beta_cohorts/)
  })
})
