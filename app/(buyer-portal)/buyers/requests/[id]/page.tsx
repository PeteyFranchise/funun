import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import {
  DEAL_STAGE_LABELS,
  USAGE_TYPE_LABELS,
  TERRITORY_LABELS,
  type LicenseRequest,
} from '@/lib/deals/schema'

export const dynamic = 'force-dynamic'

const LICENSE_REQUEST_COLUMNS =
  'id, buyer_org_id, created_by, vault_project_id, usage_types, territories, term_months, exclusivity, budget_cents, need_by, buyer_notes, stage, matched_precleared, gross_fee_cents, contract_document_id, created_at, updated_at'

function formatMoney(cents: number | null): string {
  if (cents == null) return 'Not specified'
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function formatDate(value: string | null): string {
  if (!value) return 'No deadline given'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'No deadline given'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── Request detail (D-16a) ─────────────────────────────────────────────────
// Scoped to the caller's own buyer org — a request id from another org
// returns notFound() (404), never a distinguishable 403, matching the
// 10-03 precedent (16-VALIDATION's "buyer sees another buyer's request"
// abuse case). Read-only: no stage/terms mutation control renders here —
// every transition is an admin authority action (plan 16-07). Does not
// render matched_precleared or any pre-cleared-terms value — the match
// result is admin-facing only (T-16-25).
export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/buyers/access')

  const { data: member } = await supabase
    .from('buyer_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) redirect('/buyers/access')

  const { data } = await supabase
    .from('license_requests')
    .select(LICENSE_REQUEST_COLUMNS)
    .eq('id', id)
    .eq('buyer_org_id', member.org_id)
    .maybeSingle()

  const licenseRequest = data as LicenseRequest | null
  if (!licenseRequest) notFound()

  const service = createServiceClient()
  const [{ data: project }, { data: trackLinks }, submitterAuth] = await Promise.all([
    service.from('vault_projects').select('id, title').eq('id', licenseRequest.vault_project_id).maybeSingle(),
    service
      .from('license_request_tracks')
      .select('track_id, tracks (title)')
      .eq('license_request_id', licenseRequest.id),
    service.auth.admin.getUserById(licenseRequest.created_by).catch(() => null),
  ])

  type TrackLinkRow = { track_id: string; tracks: { title: string | null } | null }
  const trackTitles = ((trackLinks ?? []) as unknown as TrackLinkRow[]).map(
    t => t.tracks?.title ?? 'Untitled track'
  )

  const submitterName =
    (submitterAuth?.data?.user?.user_metadata as { display_name?: string } | undefined)?.display_name ??
    null

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/buyers/requests" className="text-sm text-white/50 transition hover:text-white">
        ← Requests
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/40">Request</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">{project?.title ?? 'Unknown project'}</h1>
          {submitterName && (
            <p className="mt-1 text-[11px] text-white/40">Requested by {submitterName}</p>
          )}
        </div>
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
          {DEAL_STAGE_LABELS[licenseRequest.stage]}
        </span>
      </div>

      <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div>
          <p className="text-xs font-semibold text-white/70">Tracks</p>
          <p className="mt-1 text-sm text-white/80">
            {trackTitles.length > 0 ? trackTitles.join(', ') : 'No tracks recorded'}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs text-white/60 sm:grid-cols-4">
          <div>
            <span className="block text-white/30">Usage</span>
            {licenseRequest.usage_types.length > 0
              ? licenseRequest.usage_types.map(u => USAGE_TYPE_LABELS[u]).join(', ')
              : 'Not specified'}
          </div>
          <div>
            <span className="block text-white/30">Territory</span>
            {licenseRequest.territories.length > 0
              ? licenseRequest.territories.map(t => TERRITORY_LABELS[t]).join(', ')
              : 'Not specified'}
          </div>
          <div>
            <span className="block text-white/30">Term</span>
            {licenseRequest.term_months != null ? `${licenseRequest.term_months} months` : 'Not specified'}
          </div>
          <div>
            <span className="block text-white/30">Exclusivity</span>
            {licenseRequest.exclusivity ? 'Exclusive' : 'Non-exclusive'}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/60">
          <span>
            Budget: <span className="text-white/80">{formatMoney(licenseRequest.budget_cents)}</span>
          </span>
          <span>
            Need by: <span className="text-white/80">{formatDate(licenseRequest.need_by)}</span>
          </span>
          {licenseRequest.gross_fee_cents != null && (
            <span>
              Quoted fee:{' '}
              <span className="text-white/80">{formatMoney(licenseRequest.gross_fee_cents)}</span>
            </span>
          )}
        </div>

        {licenseRequest.buyer_notes && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-white/70">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-white/60">{licenseRequest.buyer_notes}</p>
          </div>
        )}
      </div>

      <p className="mt-4 text-[11px] text-white/40">
        Funūn handles negotiation and any next steps for this request — there is nothing further to
        do here until the stage changes.
      </p>
    </div>
  )
}
