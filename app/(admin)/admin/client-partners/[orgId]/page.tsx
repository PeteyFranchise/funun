export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/lib/admin/gate'
import { isAssignedToOrg } from '@/lib/staff/scope'
import { ClientPartnerDetail } from '@/components/admin/ClientPartnerDetail'
import type { ClientPartnerOrg, ClientPartnerMember } from '@/components/admin/ClientPartnerDetail'

// ─── Client Partner detail page (23-06, RESEARCH Pitfall 4) ────────────────
// The surface every lead_routed/ae_assigned/ae_unassigned notification
// already links to (lib/staff/notifications.ts) — until this plan, that
// link 404'd. Leadership can view any org; AE/BD only an org assigned to
// them (isAssignedToOrg — same predicate the PATCH route enforces),
// mirroring app/(admin)/admin/my-client-partners/page.tsx's scope pattern.
// Scope denial resolves to notFound() rather than a role-specific redirect,
// so a staff caller who isn't assigned to this org sees the identical 404
// the API itself returns (T-23-18) — org existence is never leaked.
const ORG_COLUMNS =
  'id, name, is_personal, verified, created_at, status, use_case, contact_name, contact_email, contact_phone, contact_role, source, ae_user_id'

export default async function ClientPartnerDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params

  // Explicit per-page staff check — layout redirect alone is not relied
  // upon as the authority decision (project convention; see lib/admin/gate.ts).
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const staffRole = getStaffRole(user)
  if (!staffRole) redirect('/')

  const service = createServiceClient()
  const { data: orgRow } = await service
    .from('buyer_orgs')
    .select(ORG_COLUMNS)
    .eq('id', orgId)
    .maybeSingle()

  if (!orgRow) notFound()
  if (staffRole !== 'leadership' && !isAssignedToOrg(orgRow, user.id)) notFound()

  const { data: memberRows } = await service
    .from('buyer_members')
    .select('id, org_id, user_id, buyer_role, is_org_admin, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  const members: ClientPartnerMember[] = await Promise.all(
    (memberRows ?? []).map(async row => {
      const { data: userData } = await service.auth.admin.getUserById(row.user_id)
      return { ...row, email: userData?.user?.email ?? '' }
    })
  )

  const org: ClientPartnerOrg = orgRow

  return (
    <div className="flex-1 px-9 py-[30px]">
      <Link
        href={staffRole === 'leadership' ? '/admin/buyer-orgs' : '/admin/my-client-partners'}
        className="text-xs font-semibold text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
      >
        ← Back to Client Partners
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-[color:var(--ink)]">{org.name}</h1>
      <div className="mt-6 max-w-3xl">
        <ClientPartnerDetail org={org} members={members} />
      </div>
    </div>
  )
}
