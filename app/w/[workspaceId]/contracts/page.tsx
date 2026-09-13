import { notFound, redirect } from 'next/navigation'
import { WorkspaceContractShelf } from '@/components/workspaces/WorkspaceContractShelf'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { resolveActiveWorkspaceContext } from '@/lib/workspaces/active-context'
import { loadWorkspaceContractShelf } from '@/lib/workspaces/contract-shelf'

export default async function WorkspaceContractsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/w/${workspaceId}/contracts`)}`)

  const resolved = await resolveActiveWorkspaceContext(supabase, user, workspaceId)
  if (!resolved.ok) notFound()

  const result = await loadWorkspaceContractShelf(supabase, createServiceClient(), {
    workspaceId,
    userId: user.id,
  })

  return (
    <WorkspaceContractShelf
      workspaceName={resolved.context.name}
      data={result.ok ? result.data : { groups: [], recordCount: 0, limited: false }}
      error={result.ok ? undefined : result.error}
    />
  )
}
