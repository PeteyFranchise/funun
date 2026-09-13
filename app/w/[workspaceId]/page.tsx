import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { resolveActiveWorkspaceContext } from '@/lib/workspaces/active-context'

export default async function MemberWorkspaceHomePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/w/${workspaceId}`)}`)

  const resolved = await resolveActiveWorkspaceContext(supabase, user, workspaceId)
  if (!resolved.ok) notFound()
  redirect(`/w/${workspaceId}/${resolved.context.rosterEnabled ? 'roster' : 'activity'}`)
}
