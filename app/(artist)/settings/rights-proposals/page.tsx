import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { RightsProposalsPanel } from '@/components/settings/RightsProposalsPanel'
import { presentRightsProposal, type WorkspaceRightsProposal } from '@/lib/workspaces/rights-proposals'

export const dynamic = 'force-dynamic'

export default async function RightsProposalsPage() {
  const session = await createServerClient()
  const { data: { user } } = await session.auth.getUser()
  const proposals: WorkspaceRightsProposal[] = []

  if (user) {
    const service = createServiceClient()
    const { data } = await service
      .from('workspace_rights_proposals')
      .select('id, workspace_id, relationship_id, member_user_id, field, proposed_value, note, status, proposed_by, created_at, decided_at')
      .eq('member_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200)

    const workspaceIds = [...new Set((data ?? []).map(row => row.workspace_id as string))]
    const names = new Map<string, string>()
    if (workspaceIds.length > 0) {
      const { data: workspaces } = await service.from('workspaces').select('id, name').in('id', workspaceIds)
      for (const workspace of workspaces ?? []) names.set(workspace.id, workspace.name)
    }
    for (const row of data ?? []) {
      const proposal = presentRightsProposal(row, names.get(row.workspace_id) ?? null)
      if (proposal) proposals.push(proposal)
    }
  }

  return <RightsProposalsPanel proposals={proposals} />
}
