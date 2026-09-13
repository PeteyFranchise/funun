import { MasterClaimsPanel, type MasterClaimDocumentOption } from '@/components/settings/MasterClaimsPanel'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { loadMasterOwnershipClaims } from '@/lib/workspaces/master-ownership-service'

export const dynamic = 'force-dynamic'

export default async function MasterClaimsSettingsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceClient()
  const [claims, documentsResult] = await Promise.all([
    loadMasterOwnershipClaims(service, { holderUserId: user.id }),
    service
      .from('vault_documents')
      .select('id, type, status, project_id, created_at')
      .eq('user_id', user.id)
      .in('status', ['signed', 'verified'])
      .order('created_at', { ascending: false })
      .limit(200),
  ])
  const documents: MasterClaimDocumentOption[] = (documentsResult.data ?? []).map(row => ({
    id: row.id,
    label: `${String(row.type).replaceAll('_', ' ')} · ${row.status}`,
  }))
  return <MasterClaimsPanel initialClaims={claims.data} documents={documents} />
}
