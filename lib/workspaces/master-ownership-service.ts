import type { SupabaseClient } from '@supabase/supabase-js'
import {
  presentMasterOwnershipClaim,
  type PresentedMasterOwnershipClaim,
} from '@/lib/workspaces/master-ownership'

const CLAIM_COLUMNS =
  'id, workspace_id, work_version_id, holder_user_id, state, note, dispute_note, evidence_document_id, created_at, updated_at'

export async function loadMasterOwnershipClaims(
  service: SupabaseClient,
  filter: { workspaceId: string } | { holderUserId: string }
): Promise<{ data: PresentedMasterOwnershipClaim[]; error: string | null }> {
  let query = service
    .from('master_ownership_claims')
    .select(CLAIM_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200)
  query = 'workspaceId' in filter
    ? query.eq('workspace_id', filter.workspaceId)
    : query.eq('holder_user_id', filter.holderUserId)

  const { data: claims, error } = await query
  if (error) return { data: [], error: 'Claims could not be loaded.' }
  if (!claims?.length) return { data: [], error: null }

  const workspaceIds = [...new Set(claims.map(row => row.workspace_id as string))]
  const versionIds = [...new Set(claims.map(row => row.work_version_id as string))]
  const [{ data: workspaces }, { data: versions }] = await Promise.all([
    service.from('workspaces').select('id, name').in('id', workspaceIds),
    service.from('work_versions').select('id, work_id, label').in('id', versionIds),
  ])
  const workIds = [...new Set((versions ?? []).map(row => row.work_id as string))]
  const { data: works } = workIds.length
    ? await service.from('works').select('id, title').in('id', workIds)
    : { data: [] }

  const workspaceNames = new Map((workspaces ?? []).map(row => [row.id as string, row.name as string]))
  const workTitles = new Map((works ?? []).map(row => [row.id as string, row.title as string]))
  const versionContext = new Map((versions ?? []).map(row => [
    row.id as string,
    { label: (row.label as string | null) ?? null, title: workTitles.get(row.work_id as string) ?? null },
  ]))

  return {
    data: claims.flatMap(row => {
      const version = versionContext.get(row.work_version_id as string)
      const presented = presentMasterOwnershipClaim(row, {
        workspaceName: workspaceNames.get(row.workspace_id as string) ?? null,
        workTitle: version?.title ?? null,
        versionLabel: version?.label ?? null,
      })
      return presented ? [presented] : []
    }),
    error: null,
  }
}
