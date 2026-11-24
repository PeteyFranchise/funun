'use client'

import { useState } from 'react'
import { isReadWithheld } from '@/lib/deals/buyer-song-unit-read-withholding'
import { adminDealQueueView } from '@/lib/deals/admin-deal-queue-view'
import type { AdminDealRow, MatchFilter, MatchBadgeTone } from '@/lib/deals/admin-deal-queue-view'
import Link from 'next/link'
import {
  DEAL_STAGE_VALUES,
  DEAL_STAGE_LABELS,
  USAGE_TYPE_LABELS,
  TERRITORY_LABELS,
  type DealStage,
} from '@/lib/deals/schema'

// ─── DealsQueue (D-06/D-15a) ────────────────────────────────────────────────
// Read-only negotiation queue — every mutation happens on the per-deal
// detail surface (components/admin/DealDetailPanel.tsx via
// app/(admin)/admin/deals/[id]/page.tsx). Filtering is entirely client-side
// over the full queue this component receives (mirrors
// components/buyer/OrgRequestDashboard.tsx's stage-filter pattern), so the
// list load is one admin-gated server query and every filter combination is
// instant. Defaults to the lane that matters most in a founder-led motion
// (D-15a): unmatched requests awaiting negotiation, oldest first.

// AdminDealRow/MatchFilter now live in lib/deals/admin-deal-queue-view.ts —
// the pure seam this component calls below (261121-452) — and are
// re-exported here so app/(admin)/admin/deals/page.tsx's existing import
// keeps working.
export type { AdminDealRow }

const STAGE_STYLES: Record<DealStage, string> = {
  submitted: 'border-white/15 bg-white/5 text-white/60',
  in_negotiation: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  terms_agreed: 'border-indigo-400/30 bg-indigo-400/10 text-indigo-200',
  contract: 'border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-200',
  closed_won: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  closed_lost: 'border-white/10 bg-white/5 text-white/40',
}

const CHIP_BASE = 'rounded-full border px-2.5 py-1 text-[11px] font-medium transition'
const CHIP_ON = 'border-indigo-400/40 bg-indigo-400/15 text-indigo-200'
const CHIP_OFF = 'border-white/15 text-white/50 hover:border-white/30'

// 261121-sqi Task 2 — the badge's styling, keyed off the seam's tone output,
// not re-derived from isReadWithheld. Same three class strings as before.
const MATCH_BADGE_TONE_STYLES: Record<MatchBadgeTone, string> = {
  withheld: 'border-white/15 bg-white/5 text-white/50',
  matched: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  unmatched: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
}

function formatMoney(cents: number | null): string {
  if (cents == null) return 'Not quoted'
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function formatTimeSince(iso: string): string {
  const created = new Date(iso).getTime()
  if (Number.isNaN(created)) return 'Unknown age'
  const diffMs = Date.now() - created
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days >= 1) return `${days}d ago`
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  if (hours >= 1) return `${hours}h ago`
  const minutes = Math.max(0, Math.floor(diffMs / (1000 * 60)))
  return `${minutes}m ago`
}

export function DealsQueue({ initialRows }: { initialRows: AdminDealRow[] }) {
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('unmatched')
  const [stageFilter, setStageFilter] = useState<DealStage | null>(null)
  const [unassignedOnly, setUnassignedOnly] = useState(false)

  // 261121-452 — filtering, badge text, and the mismatch note all route
  // through the pure seam so the withholding decision (taken once, here) is
  // the only thing that varies queue membership — not three separate
  // `isReadWithheld(...)` checks that could drift out of sync with each
  // other, which is exactly how the dead-chip finding happened.
  const queueView = adminDealQueueView({
    rows: initialRows,
    matchFilter,
    stageFilter,
    unassignedOnly,
    matchedPreclearedWithheld: isReadWithheld('matched_precleared'),
    readinessWithheld: isReadWithheld('project_readiness_figure'),
  })
  const { visibleRows, showMatchControls, showReadiness } = queueView

  if (initialRows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <p className="text-sm font-semibold text-white/70">No license requests yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-white/50">
          Buyer-submitted and admin-created deals will appear here, oldest first, defaulting to
          the requests that still need negotiation.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {/* 261121-452 — WITHHELD. These three chips controlled a filter body
            that was skipped entirely while matched_precleared stayed
            withheld, so selecting a chip changed the active style but never
            queue membership. Absent, not merely inert, while withheld — the
            divider right after them exists only to separate this group from
            the stage filters, so it goes with them. */}
        {showMatchControls && (
          <>
            <button
              type="button"
              onClick={() => setMatchFilter('unmatched')}
              className={`${CHIP_BASE} ${matchFilter === 'unmatched' ? CHIP_ON : CHIP_OFF}`}
            >
              Needs negotiation
            </button>
            <button
              type="button"
              onClick={() => setMatchFilter('matched')}
              className={`${CHIP_BASE} ${matchFilter === 'matched' ? CHIP_ON : CHIP_OFF}`}
            >
              Pre-cleared match
            </button>
            <button
              type="button"
              onClick={() => setMatchFilter('all')}
              className={`${CHIP_BASE} ${matchFilter === 'all' ? CHIP_ON : CHIP_OFF}`}
            >
              All
            </button>
            <span className="mx-1 h-4 w-px bg-white/10" />
          </>
        )}
        <button
          type="button"
          onClick={() => setStageFilter(null)}
          className={`${CHIP_BASE} ${stageFilter === null ? CHIP_ON : CHIP_OFF}`}
        >
          Any stage
        </button>
        {DEAL_STAGE_VALUES.map(stage => (
          <button
            key={stage}
            type="button"
            onClick={() => setStageFilter(stage)}
            className={`${CHIP_BASE} ${stageFilter === stage ? CHIP_ON : CHIP_OFF}`}
          >
            {DEAL_STAGE_LABELS[stage]}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-white/10" />
        <button
          type="button"
          onClick={() => setUnassignedOnly(v => !v)}
          className={`${CHIP_BASE} ${unassignedOnly ? CHIP_ON : CHIP_OFF}`}
        >
          Unassigned only
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {visibleRows.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-xs text-white/50">
            No deals match these filters.
          </div>
        ) : (
          visibleRows.map(row => {
            const { request } = row
            const { showMismatchNote, mismatchNote, matchBadgeText, matchBadgeTone } = queueView.rowView(row)
            return (
              <Link
                key={request.id}
                href={`/admin/deals/${request.id}`}
                className="block rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {row.buyerOrgName}
                      {row.submitterName && (
                        <span className="font-normal text-white/40"> · {row.submitterName}</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-white/50">
                      {row.projectTitle}
                      {/* 50.5 Task 2 — WITHHELD. This is the PROJECT's release
                          readiness, shown beside a deal whose subject is one
                          song. A number that looks like an answer and is not is
                          the owner_segment lesson this repo already paid for. */}
                      {showReadiness && row.projectReadinessScore != null && (
                        <span className="text-white/30"> · {row.projectReadinessScore}% ready</span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* 50.5 Task 2 — WITHHELD: a project-level terms match
                        labelled as this song's commercial conclusion.
                        261121-sqi — text AND tone now both come from
                        queueView.rowView(row) above, not from a direct
                        isReadWithheld read, per the component comment at
                        the top of this file. */}
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${MATCH_BADGE_TONE_STYLES[matchBadgeTone]}`}
                    >
                      {matchBadgeText}
                    </span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STAGE_STYLES[request.stage]}`}>
                      {DEAL_STAGE_LABELS[request.stage]}
                    </span>
                  </div>
                </div>

                {showMismatchNote && (
                  <p className="mt-2 whitespace-pre-line rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-2 text-[11px] text-amber-200/80">
                    {mismatchNote}
                  </p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-white/50 sm:grid-cols-5">
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
                    <span className="block text-white/30">Owner</span>
                    {row.ownerName ?? 'Unassigned'}
                  </div>
                  <div>
                    <span className="block text-white/30">Submitted</span>
                    {formatTimeSince(request.created_at)}
                  </div>
                </div>

                {request.gross_fee_cents != null && (
                  <p className="mt-3 text-[11px] text-white/60">
                    Quoted fee: <span className="text-white/80">{formatMoney(request.gross_fee_cents)}</span>
                  </p>
                )}
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
