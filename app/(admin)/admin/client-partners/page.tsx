export const dynamic = 'force-dynamic'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaffPage, type StaffRole } from '@/lib/admin/gate'
import { loadBook, loadWholeBookWithCoverage } from '@/lib/client-partners/signals'
import { buildCoverageSummary, groupByAe } from '@/lib/client-partners/coverage'
import { ClientPartnersRoom, type ClientPartnersAllData } from '@/components/admin/ClientPartnersRoom'
import type { ClientPartnerRow } from '@/lib/client-partners/columns'

// ─── /admin/client-partners — the consolidated Client Partners room ───────
// (D-31.1-01) Replaces the two former pages (my-client-partners, buyer-orgs)
// with one tabbed room. requireStaffPage() is the fail-closed per-page
// authority check (excludes 'it'/no-role, redirects before any load). The
// All tab's whole-book/coverage/By-AE data is fetched ONLY inside the
// isLeadership branch below — a non-leadership caller's request never
// triggers loadWholeBookWithCoverage at all (hide, not filter;
// T-31.1-info-disclosure, machine-verified by lib/admin/gate.test.ts).
//
// Pitfall 1 (commit 80443bb): ClientPartnersRoom is a 'use client'
// component — every prop passed to it below is data or a string path,
// never a function. A function prop crossing this RSC boundary throws in
// production even though dev tolerates it.

type ContactRow = {
  id: string
  buyer_org_id: string
  name: string
  title: string | null
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

async function buildAllTabData(service: ReturnType<typeof createServiceClient>): Promise<ClientPartnersAllData> {
  const rows = await loadWholeBookWithCoverage(service)
  return {
    rows,
    coverage: buildCoverageSummary(rows),
    byAe: groupByAe(rows),
    unassigned: rows.filter(row => !row.assignedAeId),
  }
}

export type ClientPartnersRoomData = {
  myCompanyRows: ClientPartnerRow[]
  myClientRows: ClientPartnerRow[]
  isLeadership: boolean
  allData: ClientPartnersAllData | null
}

/**
 * The D-31.1-01 hide-not-filter decision point, factored out of the page
 * component so it is unit-testable without rendering or mocking
 * next/navigation (lib/admin/gate.test.ts imports this directly). Takes an
 * ALREADY-resolved staffRole (requireStaffPage() is the sole auth
 * authority, called by the page component below, before this function is
 * ever reached) and is the ONLY branch point deciding whether
 * loadWholeBookWithCoverage — and therefore the whole-book/coverage/By-AE
 * data — is ever fetched. A non-leadership staffRole always returns
 * allData=null and never invokes loadWholeBookWithCoverage.
 */
export async function loadClientPartnersRoomData(
  service: SupabaseClient,
  args: { userId: string; staffRole: StaffRole }
): Promise<ClientPartnersRoomData> {
  const isLeadership = args.staffRole === 'leadership'

  const myCompanyRows: ClientPartnerRow[] = await loadBook(service, { aeUserId: args.userId })

  const myOrgIds = myCompanyRows.map(row => row.id)
  const contactRows = await contactRowsForOrgs(service, myOrgIds)
  const orgNameById = new Map(myCompanyRows.map(row => [row.id, row.name]))
  const myClientRows: ClientPartnerRow[] = contactRows.map(contact => ({
    id: contact.id,
    name: contact.name,
    companyName: orgNameById.get(contact.buyer_org_id) ?? null,
    role: contact.title,
  }))

  // D-31.1-01: the All tab's data is computed ONLY for leadership — every
  // other caller gets allData=null, and loadWholeBookWithCoverage is never
  // invoked for them.
  const allData: ClientPartnersAllData | null = isLeadership ? await buildAllTabData(service) : null

  return { myCompanyRows, myClientRows, isLeadership, allData }
}

export default async function AdminClientPartnersPage() {
  // CR-01 hardening: fail-closed default excludes 'it' — the read-only
  // Playbook-IT-room role must never reach the client-partner sales
  // pipeline (mirrors the former my-client-partners/buyer-orgs pages).
  // redirect() throws internally and never returns, so loadClientPartners
  // RoomData below is genuinely unreachable for 'it'/no-role/unauthenticated
  // callers (proven for requireStaffPage itself by
  // __tests__/staff-role-it.test.ts; this sequential call structure is what
  // makes that guarantee apply here too).
  const { user, staffRole } = await requireStaffPage()

  const service = createServiceClient()
  const { myCompanyRows, myClientRows, isLeadership, allData } = await loadClientPartnersRoomData(service, {
    userId: user.id,
    staffRole,
  })

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-[color:var(--ink)]">Client Partners</h1>
      <ClientPartnersRoom
        myCompanyRows={myCompanyRows}
        myClientRows={myClientRows}
        isLeadership={isLeadership}
        allData={allData}
        companyHrefBase="/admin/client-partners"
        clientHrefBase="/admin/clients"
      />
    </div>
  )
}
