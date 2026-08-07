import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { OrgRequestDashboard, type OrgRequestRow } from '@/components/buyer/OrgRequestDashboard'
import type { LicenseRequest } from '@/lib/deals/schema'

export const dynamic = 'force-dynamic'

// Explicit, client-safe column list restricted to migration 081's GRANT
// SELECT allowlist — never admin_notes/owner_id/commission_pct/
// artist_net_cents (those columns are ungranted and the query would fail
// if they were named here).
const LICENSE_REQUEST_COLUMNS =
  'id, buyer_org_id, created_by, vault_project_id, usage_types, territories, term_months, exclusivity, budget_cents, need_by, buyer_notes, stage, matched_precleared, gross_fee_cents, contract_document_id, created_at, updated_at'

// ─── Org request dashboard (D-16a) ─────────────────────────────────────────
// 23-02: moved from app/(buyer-portal)/buyers/requests/page.tsx to
// app/sync/requests/page.tsx as part of the /buyers/* → /sync/*
// unification. Self-gates to /sync/access (the non-gating /sync layout no
// longer backstops this).
//
// Every license_request submitted by ANY member of the caller's org — the
// RLS on license_requests (migration 081) already scopes SELECT to buyer-org
// membership, so a plain query against the session client returns exactly
// the org-wide set with no explicit id-list step (unlike the artist Deals
// room, which must pre-resolve owned project ids because vault_projects'
// own SELECT policy is wider than "owner").
//
// Project titles and submitter display names are NOT readable through the
// buyer session: vault_projects RLS excludes non-owner/non-member callers,
// and buyer accounts carry no user_profiles row at all (D-11), so both are
// resolved via the service-role client — mirroring the artist Deals room's
// enrichment pattern (app/(artist)/deals/page.tsx) exactly, just for the
// opposite side of the same requests.
export default async function RequestsPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sync/access')

  const { data: member } = await supabase
    .from('buyer_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) redirect('/sync/access')

  const { data } = await supabase
    .from('license_requests')
    .select(LICENSE_REQUEST_COLUMNS)
    .eq('buyer_org_id', member.org_id)
    .order('created_at', { ascending: false })

  const requests = (data ?? []) as LicenseRequest[]

  const service = createServiceClient()

  const projectIds = Array.from(new Set(requests.map(r => r.vault_project_id)))
  const projectTitleById = new Map<string, string>()
  if (projectIds.length > 0) {
    const { data: projectRows } = await service.from('vault_projects').select('id, title').in('id', projectIds)
    for (const p of (projectRows ?? []) as { id: string; title: string }[]) {
      projectTitleById.set(p.id, p.title)
    }
  }

  const submitterIds = Array.from(new Set(requests.map(r => r.created_by)))
  const submitterNameById = new Map<string, string | null>()
  await Promise.all(
    submitterIds.map(async id => {
      try {
        const { data: authUser } = await service.auth.admin.getUserById(id)
        const name =
          (authUser?.user?.user_metadata as { display_name?: string } | undefined)?.display_name ?? null
        submitterNameById.set(id, name)
      } catch {
        submitterNameById.set(id, null)
      }
    })
  )

  const rows: OrgRequestRow[] = requests.map(r => ({
    request: r,
    projectTitle: projectTitleById.get(r.vault_project_id) ?? 'Unknown project',
    submitterName: submitterNameById.get(r.created_by) ?? null,
  }))

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[color:var(--ink-3)]">Requests</p>
          <h1 className="mt-1 text-2xl font-semibold text-[color:var(--ink)]">License requests</h1>
          <p className="mt-1 text-sm text-[color:var(--ink-2)]">
            Every license request your organization has submitted, with its current deal stage —
            visible to every member (D-16a).
          </p>
        </div>
        <Link
          href="/sync/requests/new"
          className="rounded-lg border border-[color:var(--line)] bg-[var(--wash-2)] px-3 py-1.5 text-xs font-semibold text-[color:var(--indigo)] transition hover:bg-[var(--wash)]"
        >
          New request
        </Link>
      </div>

      <div className="mt-8">
        <OrgRequestDashboard rows={rows} />
      </div>
    </div>
  )
}
