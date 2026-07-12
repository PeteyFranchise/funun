export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { CapabilityRequestsAdmin } from '@/components/admin/CapabilityRequestsAdmin'
import type { CapabilityRequest } from '@/components/admin/CapabilityRequestsAdmin'

export default async function AdminCapabilityRequestsPage() {
  // Explicit per-page admin check — layout redirect alone is not relied upon
  // as the authority decision (project convention; see lib/admin/gate.ts).
  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) redirect('/')

  const service = createServiceClient()
  const { data: grants } = await service
    .from('capability_grants')
    .select('id, profile_id, capability, role_slugs, requested_at')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })

  // capability_grants has no email/display-name columns — attach them
  // per-row via the admin API + artist_profiles, same pattern as
  // admin/members/page.tsx.
  const requests: CapabilityRequest[] = await Promise.all(
    (grants ?? []).map(async row => {
      const [{ data: profile }, { data: userData }] = await Promise.all([
        service.from('artist_profiles').select('artist_name').eq('id', row.profile_id).maybeSingle(),
        service.auth.admin.getUserById(row.profile_id),
      ])
      return {
        grantId: row.id,
        profileId: row.profile_id,
        artistName: profile?.artist_name ?? null,
        email: userData?.user?.email ?? '',
        capability: row.capability,
        roleSlugs: row.role_slugs ?? [],
        requestedAt: row.requested_at,
      }
    })
  )

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-white">Capability Requests</h1>
      <CapabilityRequestsAdmin initialRequests={requests} />
    </div>
  )
}
