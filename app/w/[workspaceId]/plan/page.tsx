import { notFound, redirect } from 'next/navigation'
import { WorkspacePlanPanel } from '@/components/workspaces/WorkspacePlanPanel'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { resolveActiveWorkspaceContext } from '@/lib/workspaces/active-context'
import {
  loadWorkspaceBillingSnapshot,
  type WorkspaceBillingClient,
} from '@/lib/workspaces/billing'
import { loadWorkspaceUsageSnapshot } from '@/lib/workspaces/usage'

export const dynamic = 'force-dynamic'

export default async function WorkspacePlanPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/w/${workspaceId}/plan`)}`)

  const resolved = await resolveActiveWorkspaceContext(supabase, user, workspaceId)
  if (!resolved.ok) notFound()

  const service = createServiceClient()
  const [snapshot, usage] = await Promise.all([
    loadWorkspaceBillingSnapshot(service as unknown as WorkspaceBillingClient, workspaceId),
    loadWorkspaceUsageSnapshot(service, workspaceId),
  ])
  return <WorkspacePlanPanel snapshot={snapshot} usage={usage} />
}
