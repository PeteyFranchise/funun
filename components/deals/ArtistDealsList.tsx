import Link from 'next/link'
import {
  DEAL_STAGE_LABELS,
  USAGE_TYPE_LABELS,
  TERRITORY_LABELS,
  type LicenseRequest,
} from '@/lib/deals/schema'

// ─── ArtistDealsList (D-15b) ──────────────────────────────────────────────
// Presentational only — the page fetches and scopes the data (C4: explicit
// project-ownership filter, never bare RLS visibility). Deliberately has NO
// reply/message/accept/decline affordance: beta communication is
// admin-mediated (D-14b) and artists pre-clear terms rather than approving
// individual requests (D-15). Where an artist would want to influence an
// outcome, this links to the project's pre-cleared terms editor instead.

export type ArtistDealRow = {
  request: LicenseRequest
  projectTitle: string
  buyerOrgName: string
  requesterName: string | null
}

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

const STAGE_STYLES: Record<string, string> = {
  submitted: 'border-white/15 bg-white/5 text-white/60',
  in_negotiation: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  terms_agreed: 'border-indigo-400/30 bg-indigo-400/10 text-indigo-200',
  contract: 'border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-200',
  closed_won: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  closed_lost: 'border-white/10 bg-white/5 text-white/40',
}

export function ArtistDealsList({ rows }: { rows: ArtistDealRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <p className="text-sm font-semibold text-white/70">No requests yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-white/50">
          Requests appear here when a buyer submits a license request against one of your
          projects. Set pre-cleared terms on a project&apos;s Rights page so matching requests
          move straight to contract.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {rows.map(({ request, projectTitle, buyerOrgName, requesterName }) => (
        <div key={request.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              {/* D-13a: the buyer company is always shown, never just the individual. */}
              <p className="text-sm font-semibold text-white">{buyerOrgName}</p>
              {requesterName && (
                <p className="text-[11px] text-white/40">Requested by {requesterName}</p>
              )}
            </div>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                STAGE_STYLES[request.stage] ?? STAGE_STYLES.submitted
              }`}
            >
              {DEAL_STAGE_LABELS[request.stage]}
            </span>
          </div>

          <p className="mt-2 text-xs text-white/60">
            Project: <span className="font-medium text-white/80">{projectTitle}</span>
          </p>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-white/50 sm:grid-cols-4">
            <div>
              <span className="block text-white/30">Usage</span>
              {request.usage_types.length > 0
                ? request.usage_types.map(u => USAGE_TYPE_LABELS[u]).join(', ')
                : 'Not specified'}
            </div>
            <div>
              <span className="block text-white/30">Territory</span>
              {request.territories.length > 0
                ? request.territories.map(t => TERRITORY_LABELS[t]).join(', ')
                : 'Not specified'}
            </div>
            <div>
              <span className="block text-white/30">Term</span>
              {request.term_months != null ? `${request.term_months} months` : 'Not specified'}
            </div>
            <div>
              <span className="block text-white/30">Exclusivity</span>
              {request.exclusivity ? 'Exclusive' : 'Non-exclusive'}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/50">
            <span>
              Budget: <span className="text-white/70">{formatMoney(request.budget_cents)}</span>
            </span>
            <span>
              Need by: <span className="text-white/70">{formatDate(request.need_by)}</span>
            </span>
          </div>

          <div className="mt-3">
            <Link
              href={`/vault/${request.vault_project_id}/rights`}
              className="text-[11px] font-medium text-indigo-300 transition hover:text-indigo-200"
            >
              Review pre-cleared terms →
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
