import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { ArtistDealsList, type ArtistDealRow } from '@/components/deals/ArtistDealsList'
import type { LicenseRequest } from '@/lib/deals/schema'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// Explicit column list restricted to migration 081's client-visible GRANT —
// never select *, never admin_notes/owner_id/commission_pct/artist_net_cents
// (T-16-14 — those columns are ungranted internal fields and the query
// would fail if they were named here).
const LICENSE_REQUEST_COLUMNS =
  'id, buyer_org_id, created_by, vault_project_id, usage_types, territories, term_months, exclusivity, budget_cents, need_by, buyer_notes, stage, matched_precleared, gross_fee_cents, contract_document_id, created_at, updated_at'

// ─── Deals room (D-15b) ───────────────────────────────────────────────────
// Server component: every license_request tied to a project this artist
// OWNS, joined to the project title and the buyer company name.
//
// C4 (critical): scoped by EXPLICIT ownership — first resolve the caller's
// own vault_projects rows (vault_projects.user_id = auth.uid()), THEN filter
// license_requests to that id set. This deliberately never relies on bare
// RLS visibility (`vault_project_id IN (SELECT id FROM vault_projects)`),
// because migration 078 widened vault_projects' own SELECT policy from
// owner-only to owner-OR-member — a bare RLS-visible subquery would also
// surface requests tied to a project this artist merely collaborates on
// (viewer/editor/co-owner), not owns.
export default async function DealsPage() {
  if (DEMO) redirect('/vault')

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  const { data: ownedProjects } = await supabase
    .from('vault_projects')
    .select('id, title')
    .eq('user_id', user.id)

  const projects = (ownedProjects ?? []) as { id: string; title: string }[]
  const projectIds = projects.map(p => p.id)
  const projectTitleById = new Map(projects.map(p => [p.id, p.title]))

  let requests: LicenseRequest[] = []
  if (projectIds.length > 0) {
    const { data } = await supabase
      .from('license_requests')
      .select(LICENSE_REQUEST_COLUMNS)
      .in('vault_project_id', projectIds)
      .order('created_at', { ascending: false })
    requests = (data ?? []) as LicenseRequest[]
  }

  // ── Buyer company + requester attribution (D-13a) ────────────────────
  // buyer_orgs' own RLS scopes SELECT to org members, which this artist is
  // not — the session client would read zero rows here. The service-role
  // client bypasses that for this narrow, already-scoped enrichment lookup
  // (only the company name, for ids this artist's own requests already
  // named). The requester's individual display name has no user_profiles
  // row to read (buyer accounts are fully separate — migration 080's
  // handle_new_user() buyer branch never inserts one), so it is resolved
  // from auth.users.user_metadata via the admin API, matching the existing
  // app/api/admin/buyer-orgs/[id]/members precedent.
  const service = createServiceClient()
  const buyerOrgIds = Array.from(new Set(requests.map(r => r.buyer_org_id)))
  const requesterIds = Array.from(new Set(requests.map(r => r.created_by)))

  const buyerOrgNameById = new Map<string, string>()
  if (buyerOrgIds.length > 0) {
    const { data: orgRows } = await service
      .from('buyer_orgs')
      .select('id, name')
      .in('id', buyerOrgIds)
    for (const row of (orgRows ?? []) as { id: string; name: string }[]) {
      buyerOrgNameById.set(row.id, row.name)
    }
  }

  const requesterNameById = new Map<string, string | null>()
  await Promise.all(
    requesterIds.map(async id => {
      try {
        const { data } = await service.auth.admin.getUserById(id)
        const name =
          (data?.user?.user_metadata as { display_name?: string } | undefined)?.display_name ??
          null
        requesterNameById.set(id, name)
      } catch {
        requesterNameById.set(id, null)
      }
    })
  )

  const rows: ArtistDealRow[] = requests.map(r => ({
    request: r,
    projectTitle: projectTitleById.get(r.vault_project_id) ?? 'Unknown project',
    buyerOrgName: buyerOrgNameById.get(r.buyer_org_id) ?? 'Unknown company',
    requesterName: requesterNameById.get(r.created_by) ?? null,
  }))

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div>
        <p className="text-xs uppercase tracking-wide text-white/40">Deals</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">License Requests</h1>
        <p className="mt-1 text-sm text-white/50">
          Every license request across your projects, with its current deal stage. Funūn handles
          negotiation and buyer communication for you — set pre-cleared terms on a project&apos;s
          Rights page to help requests move faster.
        </p>
      </div>
      <div className="mt-8">
        <ArtistDealsList rows={rows} />
      </div>
    </div>
  )
}
