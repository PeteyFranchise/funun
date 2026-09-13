import { notFound, redirect } from 'next/navigation'
import { WorkspaceRosterView } from '@/components/workspaces/WorkspaceRosterView'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { resolveActiveWorkspaceContext } from '@/lib/workspaces/active-context'
import { loadWorkspaceRosterPage } from '@/lib/workspaces/room-data'
import { canManageRoster } from '@/lib/workspaces/membership'

export default async function WorkspaceRosterPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/w/${workspaceId}/roster`)}`)

  const resolved = await resolveActiveWorkspaceContext(supabase, user, workspaceId)
  if (!resolved.ok || !resolved.context.rosterEnabled) notFound()

  const result = await loadWorkspaceRosterPage(supabase, createServiceClient(), {
    workspaceId,
    userId: user.id,
  })

  return (
    <WorkspaceRosterView
      workspaceName={resolved.context.name}
      workspaceId={workspaceId}
      canProposeRights={canManageRoster(resolved.context.role)}
      rows={result.ok ? result.data : []}
      error={result.ok ? undefined : result.error}
    />
  )
}
