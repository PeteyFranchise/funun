export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaffPage } from '@/lib/admin/gate'
import { isAssignedToOrg } from '@/lib/staff/scope'
import { CONTACT_COLUMNS, listRelationshipLog } from '@/lib/client-partners/contacts'
import type { BuyerOrgContact } from '@/lib/client-partners/contacts'
import { loadGamePlan, loadAuthoredGamePlanTopics, buildPickerTopics, SEEDED_GAME_PLAN_TOPICS } from '@/lib/client-partners/game-plan'
import type { BuyerOrgStatus } from '@/lib/buyers/schema'
import type { Selects } from '@/lib/selects/types'
import { ClientWorkspace } from '@/components/admin/ClientWorkspace'
import type { ActivityBriefItem, ActivityLicenseRequestItem } from '@/components/admin/ClientWorkspace'

// ─── Client (person) workspace page (31-09, R1 adjacency edge) ────────────
// New route: /admin/clients/[personId], personId = buyer_org_contacts.id.
// Resolves the person -> their buyer_org, then applies the SAME own-book
// notFound() gate the company page uses (on that org) — so the Clients-tab
// entry and the Companies-tab contact entry resolve to ONE shared contact
// record (adjacency edge, R1): there is no separate "person" table, this
// page is just ClientWorkspace mode="person" scoped to one
// buyer_org_contacts row.
//
// D-31.1-02 verification Gap 2: last-contact is required on this drill-in
// card, not just the room-table column. relationshipLog is already
// fetched scoped to this contactId and ordered by created_at desc
// (listRelationshipLog), so its first entry IS this person's most-recent
// contact — reused as-is rather than a second query.

const ORG_COLUMNS = 'id, name, status, ae_user_id, website'

const SELECTS_COLUMNS =
  'id, buyer_org_id, created_by, brief_id, name, cover_note, share_token, status, download_enabled, download_max_seconds, created_at, updated_at, sent_at'

type OrgRow = {
  id: string
  name: string
  status: BuyerOrgStatus
  ae_user_id: string | null
  website: string | null
}

export default async function ClientPersonWorkspacePage({
  params,
}: {
  params: Promise<{ personId: string }>
}) {
  const { personId } = await params

  // IN-02: shared per-page staff gate (was duplicated inline) — fail-closed
  // default excludes 'it' (the read-only Playbook-IT-room role), same as
  // the company workspace page and every other admin room page.
  const { user, staffRole } = await requireStaffPage()

  const service = createServiceClient()
  const { data: contactRow } = await service
    .from('buyer_org_contacts')
    .select(CONTACT_COLUMNS)
    .eq('id', personId)
    .maybeSingle()

  if (!contactRow) notFound()
  const contact = contactRow as BuyerOrgContact

  const { data: orgRow } = await service
    .from('buyer_orgs')
    .select(ORG_COLUMNS)
    .eq('id', contact.buyer_org_id)
    .maybeSingle()

  if (!orgRow) notFound()
  const org = orgRow as OrgRow
  // Same own-book gate as the company workspace, applied on the person's org
  // (T-31-21): a non-leadership AE not assigned to this org gets notFound(),
  // never a role-specific redirect.
  if (staffRole !== 'leadership' && !isAssignedToOrg(org, user.id)) notFound()

  const [relationshipLog, gamePlan, authoredTopics, selectsResult, briefsResult, licenseRequestsResult] = await Promise.all([
    listRelationshipLog(service, org.id, { contactId: contact.id }),
    loadGamePlan(service, org.id),
    loadAuthoredGamePlanTopics(service),
    service
      .from('selects')
      .select(SELECTS_COLUMNS)
      .eq('buyer_org_id', org.id)
      .order('created_at', { ascending: false }),
    service
      .from('buyer_briefs')
      .select('id, title, status, created_at')
      .eq('buyer_org_id', org.id)
      .order('created_at', { ascending: false }),
    service
      .from('license_requests')
      .select('id, stage, vault_project_id, created_at, vault_projects(title)')
      .eq('buyer_org_id', org.id)
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
      {/* 31.1 D-31.1-01: both former destinations (leadership's /admin/buyer-orgs,
          everyone else's /admin/my-client-partners) consolidated into the
          one Client Partners room. */}
      <Link
        href="/admin/client-partners"
        className="text-xs font-semibold text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
      >
        ← Back to Client Partners
      </Link>
      <div className="mt-4">
        <ClientWorkspace
          mode="person"
          orgId={org.id}
          companyName={org.name}
          companyStatus={org.status}
          companyWebsite={org.website}
          personName={contact.name}
          contacts={[contact]}
          initialSelects={(selectsResult.data ?? []) as Selects[]}
          initialRelationshipLog={relationshipLog}
          briefs={briefs}
          licenseRequests={licenseRequests}
          initialGamePlanTopics={gamePlan.topics}
          gamePlanPickerTopics={buildPickerTopics(SEEDED_GAME_PLAN_TOPICS, authoredTopics)}
          lastContactedAt={relationshipLog[0]?.created_at ?? null}
        />
      </div>
    </div>
  )
}
