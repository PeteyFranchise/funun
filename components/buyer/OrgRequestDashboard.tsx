'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  DEAL_STAGE_VALUES,
  DEAL_STAGE_LABELS,
  USAGE_TYPE_LABELS,
  TERRITORY_LABELS,
  type LicenseRequest,
  type DealStage,
} from '@/lib/deals/schema'

// ─── OrgRequestDashboard (D-16a) ────────────────────────────────────────────
// Every request submitted by ANY member of the caller's org, org-wide (the
// page already scoped the query to buyer_org_id — this is presentational
// plus a client-side stage filter). Read-only with respect to deal state:
// every stage transition is an admin authority action (plan 16-07), so no
// mutation control exists here. Where a later plan adds a buyer-facing
// action for a stage (payment 16-08, signing 16-09, delivery 16-10), that
// slots into this same row — none of those exist yet.

export type OrgRequestRow = {
  request: LicenseRequest
  projectTitle: string
  submitterName: string | null
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

const FILTER_CHIP_BASE = 'rounded-full border px-2.5 py-1 text-[11px] font-medium transition'
const FILTER_CHIP_ON = 'border-indigo-400/40 bg-indigo-400/15 text-indigo-200'
const FILTER_CHIP_OFF = 'border-white/15 text-white/50 hover:border-white/30'

export function OrgRequestDashboard({ rows }: { rows: OrgRequestRow[] }) {
  const [stageFilter, setStageFilter] = useState<DealStage | null>(null)

  const visibleRows = stageFilter ? rows.filter(r => r.request.stage === stageFilter) : rows

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <p className="text-sm font-semibold text-white/70">No requests yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-white/50">
          Requests your organization submits will appear here, org-wide, with their current deal
          stage — every member sees the same list.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setStageFilter(null)}
          className={`${FILTER_CHIP_BASE} ${stageFilter === null ? FILTER_CHIP_ON : FILTER_CHIP_OFF}`}
        >
          All stages
        </button>
        {DEAL_STAGE_VALUES.map(stage => (
          <button
            key={stage}
            type="button"
            onClick={() => setStageFilter(stage)}
            className={`${FILTER_CHIP_BASE} ${stageFilter === stage ? FILTER_CHIP_ON : FILTER_CHIP_OFF}`}
          >
            {DEAL_STAGE_LABELS[stage]}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {visibleRows.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-xs text-white/50">
            No requests at this stage.
          </div>
        ) : (
          visibleRows.map(({ request, projectTitle, submitterName }) => (
            <Link
              key={request.id}
              href={`/buyers/requests/${request.id}`}
              className="block rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">{projectTitle}</p>
                  {/* Dual-level attribution (D-13a): who on the org filed it. */}
                  {submitterName && (
                    <p className="text-[11px] text-white/40">Requested by {submitterName}</p>
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
                  <span className="block text-white/30">Budget</span>
                  {formatMoney(request.budget_cents)}
                </div>
                <div>
                  <span className="block text-white/30">Need by</span>
                  {formatDate(request.need_by)}
                </div>
              </div>

              {request.gross_fee_cents != null && (
                <p className="mt-3 text-[11px] text-white/60">
                  Quoted fee: <span className="text-white/80">{formatMoney(request.gross_fee_cents)}</span>
                </p>
              )}
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
