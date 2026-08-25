import type { SupabaseClient } from '@supabase/supabase-js'
import type { createServiceClient } from '@/lib/supabase/server'
import type { StaffRole } from '@/lib/admin/gate'
import { loadBook, loadWholeBookWithCoverage } from '@/lib/client-partners/signals'
import { buildCoverageSummary, groupByAe, type AeCoverage } from '@/lib/client-partners/coverage'
import { listOpenOnboardingTasks, type OnboardingTask } from '@/lib/client-partners/onboarding'
import { loadActivePlay, loadCompletions } from '@/lib/playbook/plays'
import { matchingClientCount, buildAssignmentDeepLink, type PlaysEligibilityRow } from '@/lib/client-partners/plays-eligibility'
import { buildEngagementRollup, type EngagementRollupData } from '@/lib/selects/engagement-rollup'
import type { ClientPartnersAllData } from '@/components/admin/ClientPartnersRoom'
import type { TodaysPlayBannerData } from '@/components/admin/TodaysPlayBanner'
import type { ClientPartnerRow, HealthValue } from '@/lib/client-partners/columns'

// ─── Client Partners room data assembly (D-31.1-01, plans 31.1-04/06, 31.2-09/10)
// Factored OUT of app/(admin)/admin/client-partners/page.tsx: Next.js page
// modules may only export page fields (a non-page export fails `next build`'s
// page-type validation), and lib/admin/gate.test.ts machine-verifies the
// hide-not-filter decision point by importing loadClientPartnersRoomData
// directly. The page component remains the sole auth authority
// (requireStaffPage) and passes an ALREADY-resolved staffRole in.

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

type StaffRosterRow = { user_id: string; display_name: string; staff_roles: string[] | null }

// D-31.1-05: the assign panel's "Choose an AE" roster needs every ACTIVE
// AE/BD/leadership staff member — including a zero-load AE groupByAe's
// grouping would silently drop (it only buckets rows that already have an
// assignedAeId). Merges the full funun_staff roster with byAe's computed
// load/healthMix, defaulting an unmatched staff member to an empty mix.
async function loadAssignableAeList(
  service: ReturnType<typeof createServiceClient>,
  byAe: AeCoverage[]
): Promise<AeCoverage[]> {
  const { data } = await service
    .from('funun_staff')
    .select('user_id, display_name, staff_roles')
    .overlaps('staff_roles', ['ae', 'bd', 'leadership'])
    .order('display_name', { ascending: true })

  const byAeId = new Map(byAe.map(ae => [ae.aeId, ae]))
  return ((data ?? []) as StaffRosterRow[]).map(row => {
    const existing = byAeId.get(row.user_id)
    return (
      existing ?? {
        aeId: row.user_id,
        aeName: row.display_name,
        load: 0,
        healthMix: { good: 0, warning: 0, at_risk: 0, cold: 0, prospect: 0 },
      }
    )
  })
}

// ─── Today's Play (D-31.2-11, plan 09) ─────────────────────────────────────
// Builds the AE-facing banner data: the active team play, each
// client_targeted assignment's own-book matching count + deep-link
// (matchingClientCount/buildAssignmentDeepLink, plan 06), and the CALLING
// AE's own completion state per assignment — every count/link computed
// server-side against the caller's OWN book (myCompanyRows, already scoped
// by loadBook({ aeUserId })), never a global list (T-31.2-25).
async function buildTodaysPlayData(
  service: ReturnType<typeof createServiceClient>,
  args: { userId: string; myBook: ClientPartnerRow[] }
): Promise<TodaysPlayBannerData> {
  const active = await loadActivePlay(service)
  if (!active) return null

  const assignmentIds = active.assignments.map(a => a.id)
  const completions = await loadCompletions(service, assignmentIds)
  const myCompletedIds = new Set(completions.filter(c => c.aeUserId === args.userId).map(c => c.assignmentId))

  const book = args.myBook as PlaysEligibilityRow[]

  return {
    playId: active.play.id,
    title: active.play.title,
    note: active.play.note,
    assignments: active.assignments.map(a => {
      const targeting = { healthBand: a.healthBand as HealthValue | null, pipelineStageKey: a.pipelineStageKey }
      return {
        id: a.id,
        kind: a.kind,
        title: a.title,
        note: a.note,
        healthBand: a.healthBand,
        pipelineStageKey: a.pipelineStageKey,
        linkUrl: a.linkUrl,
        attachmentUrl: a.attachmentUrl,
        content: a.content,
        matchingCount: a.kind === 'client_targeted' ? matchingClientCount(book, targeting) : null,
        deepLink: a.kind === 'client_targeted' ? buildAssignmentDeepLink(targeting) : null,
        done: myCompletedIds.has(a.id),
      }
    }),
  }
}

async function buildAllTabData(service: ReturnType<typeof createServiceClient>): Promise<ClientPartnersAllData> {
  const rows = await loadWholeBookWithCoverage(service)
  const byAe = groupByAe(rows)
  return {
    rows,
    coverage: buildCoverageSummary(rows),
    byAe,
    unassigned: rows.filter(row => !row.assignedAeId),
    aeList: await loadAssignableAeList(service, byAe),
  }
}

export type ClientPartnersRoomData = {
  myCompanyRows: ClientPartnerRow[]
  myClientRows: ClientPartnerRow[]
  isLeadership: boolean
  allData: ClientPartnersAllData | null
  openOnboardingTasks: OnboardingTask[]
  todaysPlay: TodaysPlayBannerData
  /** R13/D-31.2-13: leadership-only engagement rollup — null for every non-leadership caller (hide-not-filter, same discipline as allData). */
  engagementRollup: EngagementRollupData | null
}

/**
 * The D-31.1-01 hide-not-filter decision point, factored out of the page
 * component so it is unit-testable without rendering or mocking
 * next/navigation (lib/admin/gate.test.ts imports this directly). Takes an
 * ALREADY-resolved staffRole (requireStaffPage() is the sole auth
 * authority, called by the page component, before this function is
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

  // R13/D-31.2-13: the engagement rollup extends the SAME leadership-only
  // gate as allData above — computed ONLY for leadership, so
  // buildEngagementRollup (and therefore the whole-book engagement read) is
  // never invoked for a non-leadership caller (T-31.2-27, hide-not-filter,
  // mirrors D-31.1-01's discipline exactly).
  const engagementRollup: EngagementRollupData | null = isLeadership ? await buildEngagementRollup(service) : null

  // Every staff member — not leadership-only — may have open D-07 handoff
  // tasks in their own queue (they're the one who WAS assigned a client).
  const openOnboardingTasks = await listOpenOnboardingTasks(service, args.userId)

  // Every staff member sees the Today's Play banner (D-31.2-11) — own-book
  // scoped, not leadership-only. myCompanyRows is already own-book (loadBook
  // above), so buildTodaysPlayData never sees a global list.
  const todaysPlay = await buildTodaysPlayData(service, { userId: args.userId, myBook: myCompanyRows })

  return { myCompanyRows, myClientRows, isLeadership, allData, openOnboardingTasks, todaysPlay, engagementRollup }
}
