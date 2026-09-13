import fs from 'fs'
import path from 'path'

const mutationRoutes = [
  'app/api/workspaces/[workspaceId]/attachments/route.ts',
  'app/api/workspaces/[workspaceId]/grants/route.ts',
  'app/api/workspaces/[workspaceId]/invitations/route.ts',
  'app/api/workspaces/[workspaceId]/master-claims/route.ts',
  'app/api/workspaces/[workspaceId]/members/route.ts',
  'app/api/workspaces/[workspaceId]/ownership/route.ts',
  'app/api/workspaces/[workspaceId]/permission-requests/route.ts',
  'app/api/workspaces/[workspaceId]/projects/route.ts',
  'app/api/workspaces/[workspaceId]/rights-proposals/route.ts',
  'app/api/workspaces/[workspaceId]/roster/evidence/route.ts',
  'app/api/workspaces/[workspaceId]/roster/route.ts',
] as const

describe('workspace billing write boundary', () => {
  it.each(mutationRoutes)('%s uses the central mutation gate', file => {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
    expect(source).toContain('requireWorkspaceMutationAccess')
  })

  it('checks billing before an invitation redemption creates a seat', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'app/api/workspaces/invitations/accept/route.ts'),
      'utf8'
    )
    const billingCheck = source.indexOf('resolveWorkspaceWritesAllowed(')
    const redeemWrite = source.indexOf(".rpc('workspace_redeem_invitation'")
    expect(billingCheck).toBeGreaterThan(0)
    expect(redeemWrite).toBeGreaterThan(billingCheck)
  })

  it('keeps personal Member decision routes outside the workspace billing gate', () => {
    for (const file of [
      'app/api/settings/rights-proposals/route.ts',
      'app/api/settings/master-claims/route.ts',
    ]) {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
      expect(source).not.toContain('requireWorkspaceMutationAccess')
    }
  })
})
