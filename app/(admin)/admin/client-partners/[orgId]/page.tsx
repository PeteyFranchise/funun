export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/lib/admin/gate'
import { isAssignedToOrg } from '@/lib/staff/scope'
import { listContacts, listRelationshipLog } from '@/lib/client-partners/contacts'
import type { BuyerOrgStatus } from '@/lib/buyers/schema'
import type { Selects } from '@/lib/selects/types'
import { ClientWorkspace } from '@/components/admin/ClientWorkspace'
import type { ActivityBriefItem, ActivityLicenseRequestItem } from '@/components/admin/ClientWorkspace'

// ─── Client Partner (company) workspace page (31-09, R1) ──────────────────
// Rebuilds the former ClientPartnerDetail member-list page into the
// four-job ClientWorkspace: Contacts (D-05/D-08/D-09) · Activity · Curation
// (Selects, 31-04) · Notes+status (31-06 relationship log). Own-book-scoped
// exactly like the page it replaces (23-06): leadership sees any org;
// AE/BD/ANR only an org assigned to them (isAssignedToOrg) — scope denial
// resolves to notFound(), never a role-specific redirect, so org existence
// is never leaked (T-31-21).

const ORG_COLUMNS =
  'id, name, is_personal, verified, created_at, status, use_case, contact_name, contact_email, contact_phone, contact_role, source, ae_user_id, website'

const SELECTS_COLUMNS =
  'id, buyer_org_id, created_by, brief_id, name, cover_note, share_token, status, download_enabled, download_max_seconds, created_at, updated_at, sent_at'

type OrgRow = {
  id: string
  name: string
  status: BuyerOrgStatus
  ae_user_id: string | null
  website: string | null
}

export default async function ClientPartnerWorkspacePage({
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
  // CR-01 hardening: 'it' is read-only Playbook-IT-room staff and must not
  // reach a client-partner workspace — excluded alongside no-role.
  if (!staffRole || staffRole === 'it') redirect('/')

  const service = createServiceClient()
  const { data: orgRow } = await service.from('buyer_orgs').select(ORG_COLUMNS).eq('id', orgId).maybeSingle()

  if (!orgRow) notFound()
  const org = orgRow as OrgRow
  if (staffRole !== 'leadership' && !isAssignedToOrg(org, user.id)) notFound()

  const [contacts, relationshipLog, selectsResult, briefsResult, licenseRequestsResult] = await Promise.all([
    listContacts(service, orgId),
    listRelationshipLog(service, orgId),
    service.from('selects').select(SELECTS_COLUMNS).eq('buyer_org_id', orgId).order('created_at', { ascending: false }),
    service
      .from('buyer_briefs')
      .select('id, title, status, created_at')
      .eq('buyer_org_id', orgId)
      .order('created_at', { ascending: false }),
    service
      .from('license_requests')
      .select('id, stage, vault_project_id, created_at, vault_projects(title)')
      .eq('buyer_org_id', orgId)
      .order('created_at', { ascending: false }),
  ])

  const briefs: ActivityBriefItem[] = ((briefsResult.data ?? []) as {
    id: string
    title: string | null
    status: string
    created_at: string
  }[]).map(row => ({ id: row.id, title: row.title, status: row.status, createdAt: row.created_at }))

  const licenseRequests: ActivityLicenseRequestItem[] = ((licenseRequestsResult.data ?? []) as {
    id: string
    stage: string
    created_at: string
    vault_projects: { title: string } | { title: string }[] | null
  }[]).map(row => {
    const vp = Array.isArray(row.vault_projects) ? row.vault_projects[0] : row.vault_projects
    return { id: row.id, stage: row.stage, vaultProjectTitle: vp?.title ?? null, createdAt: row.created_at }
  })

  return (
    <div className="flex-1 px-9 py-[30px]">
      <Link
        href={staffRole === 'leadership' ? '/admin/buyer-orgs' : '/admin/my-client-partners'}
        className="text-xs font-semibold text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
      >
        ← Back to Client Partners
      </Link>
      <div className="mt-4">
        <ClientWorkspace
          mode="company"
          orgId={org.id}
          companyName={org.name}
          companyStatus={org.status}
          companyWebsite={org.website}
          contacts={contacts}
          initialSelects={(selectsResult.data ?? []) as Selects[]}
          initialRelationshipLog={relationshipLog}
          briefs={briefs}
          licenseRequests={licenseRequests}
        />
      </div>
    </div>
  )
}
