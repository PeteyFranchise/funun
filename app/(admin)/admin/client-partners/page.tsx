export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/server'
import { requireStaffPage } from '@/lib/admin/gate'
import { loadClientPartnersRoomData } from '@/lib/client-partners/room-data'
import { ClientPartnersRoom } from '@/components/admin/ClientPartnersRoom'
import { HEALTH_TONE, type HealthValue } from '@/lib/client-partners/columns'

// ─── /admin/client-partners — the consolidated Client Partners room ───────
// (D-31.1-01) Replaces the two former pages (my-client-partners, buyer-orgs)
// with one tabbed room. requireStaffPage() is the fail-closed per-page
// authority check (excludes 'it'/no-role, redirects before any load). All
// data assembly — including the leadership-only hide-not-filter branch —
// lives in lib/client-partners/room-data.ts (a page module may only export
// page fields, and gate.test.ts imports the decision point directly).
//
// Pitfall 1 (commit 80443bb): ClientPartnersRoom is a 'use client'
// component — every prop passed to it below is data or a string path,
// never a function. A function prop crossing this RSC boundary throws in
// production even though dev tolerates it.

// CR-01 (D-31.2-09a): a client-targeted Play assignment's deep-link
// (lib/client-partners/plays-eligibility.ts's buildAssignmentDeepLink)
// lands here with ?health=&stage= query params — this page reads them and
// hands them to ClientPartnersRoom as a plain-data initialFilter prop
// (Pitfall 1: never a function). health is validated against the known
// HealthValue band (HEALTH_TONE's keys); an unrecognized value is ignored
// rather than passed through. stage is opaque here — pipelineStageKey has
// no fixed enum, so ClientPartnersRoom matches it directly against each
// row's resolved stage key.
const VALID_HEALTH_VALUES = new Set(Object.keys(HEALTH_TONE) as HealthValue[])

function firstParam(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value
  return first ?? null
}

export default async function AdminClientPartnersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
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
  const { myCompanyRows, myClientRows, isLeadership, allData, openOnboardingTasks, todaysPlay, engagementRollup } =
    await loadClientPartnersRoomData(service, {
      userId: user.id,
      staffRole,
    })

  const params = await searchParams
  const rawHealth = firstParam(params.health)
  const validHealth = rawHealth && VALID_HEALTH_VALUES.has(rawHealth as HealthValue) ? (rawHealth as HealthValue) : null
  const stage = firstParam(params.stage)

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
        openOnboardingTasks={openOnboardingTasks}
        todaysPlay={todaysPlay}
        engagementRollup={engagementRollup}
        initialFilter={{ health: validHealth, stage }}
      />
    </div>
  )
}
