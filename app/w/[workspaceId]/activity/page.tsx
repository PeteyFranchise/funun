import { notFound, redirect } from 'next/navigation'
import { WorkspaceActivityView } from '@/components/workspaces/WorkspaceActivityView'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { resolveActiveWorkspaceContext } from '@/lib/workspaces/active-context'
import {
  clampWorkspaceRoomLimit,
  clampWorkspaceRoomOffset,
  loadWorkspaceActivityPage,
} from '@/lib/workspaces/room-data'

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export default async function WorkspaceActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { workspaceId } = await params
  const query = await searchParams
  const pageSize = clampWorkspaceRoomLimit(firstParam(query.limit))
  const offset = clampWorkspaceRoomOffset(firstParam(query.offset))
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/w/${workspaceId}/activity`)}`)

  const resolved = await resolveActiveWorkspaceContext(supabase, user, workspaceId)
  if (!resolved.ok) notFound()

  const result = await loadWorkspaceActivityPage(supabase, createServiceClient(), {
    workspaceId,
    userId: user.id,
    limit: pageSize,
    offset,
  })

  return (
    <WorkspaceActivityView
      workspaceId={workspaceId}
      rows={result.ok ? result.data : []}
      error={result.ok ? undefined : result.error}
      offset={offset}
      pageSize={pageSize}
    />
  )
}
