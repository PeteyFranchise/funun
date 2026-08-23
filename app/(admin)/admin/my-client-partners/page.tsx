export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/lib/admin/gate'
import { ClientPartnersList } from '@/components/admin/ClientPartnersList'
import type { ClientPartnerRow } from '@/lib/client-partners/columns'

const ORG_COLUMNS = 'id, name, is_personal, verified, created_at, ae_user_id, website'

type OrgRow = {
  id: string
  name: string
  is_personal: boolean
  verified: boolean
  created_at: string
  ae_user_id: string | null
  website: string | null
}

type ContactRow = {
  id: string
  buyer_org_id: string
  name: string
  title: string | null
}

// A brief counts as "open" while it hasn't reached a terminal pipeline
// state (buyer_briefs' CHECK constraint: new/ae_reviewing/selects_sent/
// in_deal/licensed/closed — migration 106).
const BRIEF_TERMINAL_STATUSES = new Set(['licensed', 'closed'])

// Counts rows in `table` grouped by buyer_org_id, scoped to orgIds. Used
// for the enriched Companies-tab columns this plan wires (Open briefs /
// Active Selects / Contacts) — everything else on the row (health,
// days-in-stage, open deal, lifetime value, client-level briefs/selects-
// seen/deals) has no Slice-1 data source yet (R3/R6/R7/deals are 31.1
// work) and intentionally renders the column model's defined "no data"
// state rather than a fabricated number.
async function countByOrg(
  service: ReturnType<typeof createServiceClient>,
  table: 'buyer_org_contacts' | 'selects',
  orgIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (orgIds.length === 0) return counts
  const { data } = await service.from(table).select('buyer_org_id').in('buyer_org_id', orgIds)
  for (const row of (data ?? []) as { buyer_org_id: string }[]) {
    counts.set(row.buyer_org_id, (counts.get(row.buyer_org_id) ?? 0) + 1)
  }
  return counts
}

async function openBriefsByOrg(
  service: ReturnType<typeof createServiceClient>,
  orgIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (orgIds.length === 0) return counts
  const { data } = await service.from('buyer_briefs').select('buyer_org_id, status').in('buyer_org_id', orgIds)
  for (const row of (data ?? []) as { buyer_org_id: string; status: string }[]) {
    if (BRIEF_TERMINAL_STATUSES.has(row.status)) continue
    counts.set(row.buyer_org_id, (counts.get(row.buyer_org_id) ?? 0) + 1)
  }
  return counts
}

async function contactRowsForOrgs(
  service: ReturnType<typeof createServiceClient>,
  orgIds: string[]
): Promise<ContactRow[]> {
  if (orgIds.length === 0) return []
  const { data } = await service
    .from('buyer_org_contacts')
    .select('id, buyer_org_id, name, title')
    .in('buyer_org_id', orgIds)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
  return (data ?? []) as ContactRow[]
}

export default async function AdminMyClientPartnersPage() {
  // Explicit per-page staff check — layout redirect alone is not relied upon
  // as the authority decision (project convention; see lib/admin/gate.ts).
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const role = getStaffRole(user)
  // CR-01 hardening: 'it' is read-only Playbook-IT-room staff and must not
  // reach the client-partner sales pipeline — excluded alongside no-role.
  if (!role || role === 'it') redirect('/')

  const service = createServiceClient()
  let orgQuery = service
    .from('buyer_orgs')
    .select(ORG_COLUMNS)
    .order('created_at', { ascending: false })
  // R5 own-book scope: a non-leadership AE/BD sees only companies assigned
  // to them; leadership sees all (the true hold-queue variant — unassigned
  // + coverage — is 31.1; this plan keeps the existing leadership-sees-all
  // read path unchanged).
  if (role !== 'leadership') {
    orgQuery = orgQuery.eq('ae_user_id', user.id)
  }
  const { data: orgsData } = await orgQuery
  const orgs = (orgsData ?? []) as OrgRow[]
  const orgIds = orgs.map(o => o.id)

  const [contactsByOrg, openBriefs, activeSelects, contactRows] = await Promise.all([
    countByOrg(service, 'buyer_org_contacts', orgIds),
    openBriefsByOrg(service, orgIds),
    countByOrg(service, 'selects', orgIds),
    contactRowsForOrgs(service, orgIds),
  ])

  const companyRows: ClientPartnerRow[] = orgs.map(org => ({
    id: org.id,
    name: org.name,
    website: org.website,
    openBriefs: openBriefs.get(org.id) ?? 0,
    activeSelects: activeSelects.get(org.id) ?? 0,
    contactsCount: contactsByOrg.get(org.id) ?? 0,
  }))

  const orgNameById = new Map(orgs.map(o => [o.id, o.name]))
  const clientRows: ClientPartnerRow[] = contactRows.map(contact => ({
    id: contact.id,
    name: contact.name,
    companyName: orgNameById.get(contact.buyer_org_id) ?? null,
    role: contact.title,
  }))

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-[color:var(--ink)]">My Client Partners</h1>
      <ClientPartnersList
        companyRows={companyRows}
        clientRows={clientRows}
        companyHrefBase="/admin/client-partners"
        clientHrefBase="/admin/clients"
      />
    </div>
  )
}
