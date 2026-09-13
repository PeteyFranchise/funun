import { notFound } from 'next/navigation'
import { WorkspaceMasterClaims } from '@/components/workspaces/WorkspaceMasterClaims'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { resolveActiveWorkspaceContext } from '@/lib/workspaces/active-context'
import { loadMasterOwnershipClaims } from '@/lib/workspaces/master-ownership-service'
import { canManageRoster } from '@/lib/workspaces/membership'

export const dynamic = 'force-dynamic'

export default async function WorkspaceMasterClaimsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const resolved = await resolveActiveWorkspaceContext(supabase, user, workspaceId)
  if (!resolved.ok || !canManageRoster(resolved.context.role) || resolved.context.type !== 'label') notFound()
  const result = await loadMasterOwnershipClaims(createServiceClient(), { workspaceId })
  return <WorkspaceMasterClaims workspaceId={workspaceId} initialClaims={result.data} />
}
