'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  DEAL_STAGE_LABELS,
  USAGE_TYPE_LABELS,
  TERRITORY_LABELS,
  type LicenseRequestAdmin,
} from '@/lib/deals/schema'
import { getLegalNextStages } from '@/lib/deals/stage-machine'
import { computeNetFee } from '@/lib/deals/commission'

// ─── DealDetailPanel (D-06/D-20) ─────────────────────────────────────────────
// The founder's working surface for one deal. Every write goes through
// PATCH /api/admin/deals/[id], which re-verifies admin identity and
// re-enforces the stage machine/economics server-side — this panel is a
// thin convenience over that authority (mirrors components/admin/
// ReportsAdmin.tsx). Stage buttons render ONLY from getLegalNextStages, the
// exact same function the server gates the write with (Task 1), so a stale
// tab can render a stale button set but never issue an illegal write. The
// send-for-signature (16-09) and payment (16-08) actions are clearly
// labelled placeholders — no routes exist for them yet.

export type AdminDealDetail = {
  request: LicenseRequestAdmin
  buyerOrgName: string
  submitterName: string | null
  submitterEmail: string | null
  project: {
    id: string
    title: string
    readinessScore: number
    tracks: { id: string; title: string | null }[]
  } | null
  ownerName: string | null
}

function formatMoney(cents: number | null): string {
  if (cents == null) return '—'
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function dollarsToCents(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const dollars = Number(trimmed)
  if (!Number.isFinite(dollars) || dollars < 0) return null
  return Math.round(dollars * 100)
}

export function DealDetailPanel({
  detail,
  currentAdminId,
}: {
  detail: AdminDealDetail
  currentAdminId: string
}) {
  const router = useRouter()
  const { request } = detail

  const [grossInput, setGrossInput] = useState(
    request.gross_fee_cents != null ? (request.gross_fee_cents / 100).toString() : ''
  )
  const [commissionInput, setCommissionInput] = useState(
    request.commission_pct != null ? request.commission_pct.toString() : ''
  )
  const [notesInput, setNotesInput] = useState(request.admin_notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewGrossCents = dollarsToCents(grossInput)
  const previewPct = commissionInput.trim() === '' ? null : Number(commissionInput)
  const previewValid =
    previewGrossCents != null &&
    previewPct != null &&
    Number.isFinite(previewPct) &&
    previewPct >= 0 &&
    previewPct <= 100
  const preview = previewValid ? computeNetFee(previewGrossCents as number, previewPct as number) : null

  async function patch(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/admin/deals/${request.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setError(data.error ?? 'Could not update this deal.')
      return
    }
    router.refresh()
  }

  const legalNextStages = getLegalNextStages(request.stage)
  const isOwnedByMe = request.owner_id === currentAdminId

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      )}

      {/* Overview */}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/40">{detail.buyerOrgName}</p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              {detail.project?.title ?? 'Unknown project'}
            </h2>
            {detail.submitterName && (
              <p className="mt-0.5 text-xs text-white/50">
                Filed by {detail.submitterName}
                {detail.submitterEmail && ` (${detail.submitterEmail})`}
              </p>
            )}
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              request.matched_precleared
                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                : 'border-amber-400/30 bg-amber-400/10 text-amber-300'
            }`}
          >
            {request.matched_precleared ? 'Pre-cleared match' : 'Needs negotiation'}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-white/70 sm:grid-cols-4">
          <div>
            <span className="block text-xs text-white/30">Usage</span>
            {request.usage_types.map(u => USAGE_TYPE_LABELS[u]).join(', ') || 'Not specified'}
          </div>
          <div>
            <span className="block text-xs text-white/30">Territory</span>
            {request.territories.map(t => TERRITORY_LABELS[t]).join(', ') || 'Not specified'}
          </div>
          <div>
            <span className="block text-xs text-white/30">Term</span>
            {request.term_months ? `${request.term_months} months` : 'Not specified'}
          </div>
          <div>
            <span className="block text-xs text-white/30">Exclusivity</span>
            {request.exclusivity ? 'Exclusive' : 'Non-exclusive'}
          </div>
          <div>
            <span className="block text-xs text-white/30">Budget</span>
            {formatMoney(request.budget_cents)}
          </div>
          <div>
            <span className="block text-xs text-white/30">Need by</span>
            {request.need_by ?? 'No deadline given'}
          </div>
          <div>
            <span className="block text-xs text-white/30">Readiness</span>
            {detail.project ? `${detail.project.readinessScore}% ready` : 'Unknown'}
          </div>
          <div>
            <span className="block text-xs text-white/30">Stage</span>
            {DEAL_STAGE_LABELS[request.stage]}
          </div>
        </div>

        {request.buyer_notes && (
          <p className="mt-4 text-sm text-white/60">
            <span className="font-semibold text-white/40">Buyer notes:</span> {request.buyer_notes}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {detail.project && (
            <Link
              href={`/vault/${detail.project.id}`}
              className="rounded-lg border border-white/15 px-3 py-1.5 font-semibold text-white/70 hover:text-white"
            >
              Open Sound Vault project →
            </Link>
          )}
          {detail.project && (
            <Link
              href={`/vault/${detail.project.id}/documents`}
              className="rounded-lg border border-white/15 px-3 py-1.5 font-semibold text-white/70 hover:text-white"
            >
              Open Contract Locker →
            </Link>
          )}
        </div>
      </section>

      {/* Ownership */}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-white/40">Owner</h3>
        <p className="mt-2 text-sm text-white/70">{isOwnedByMe ? 'You' : (detail.ownerName ?? 'Unassigned')}</p>
        <div className="mt-3 flex gap-2">
          {!isOwnedByMe && (
            <ActionButton disabled={busy} onClick={() => patch({ owner_id: currentAdminId })}>
              Assign to me
            </ActionButton>
          )}
          {request.owner_id && (
            <ActionButton disabled={busy} onClick={() => patch({ owner_id: null })}>
              Unassign
            </ActionButton>
          )}
        </div>
      </section>

      {/* Economics */}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-white/40">
          Quote &amp; commission (admin only)
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Gross fee (USD)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={grossInput}
              onChange={e => setGrossInput(e.target.value)}
              className="admin-input"
            />
          </Field>
          <Field label="Commission %">
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={commissionInput}
              onChange={e => setCommissionInput(e.target.value)}
              className="admin-input"
            />
          </Field>
          <Field label="Artist net (derived)">
            <div className="admin-input flex items-center text-white/70">
              {preview ? formatMoney(preview.artistNetCents) : formatMoney(request.artist_net_cents)}
            </div>
          </Field>
        </div>
        <div className="mt-3">
          <ActionButton
            disabled={busy}
            onClick={() => patch({ gross_fee_cents: previewGrossCents, commission_pct: previewPct })}
          >
            Save quote
          </ActionButton>
        </div>
      </section>

      {/* Notes */}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-white/40">Admin notes</h3>
        <textarea
          value={notesInput}
          onChange={e => setNotesInput(e.target.value)}
          rows={4}
          placeholder="Internal negotiation notes (admin-only, never visible to the buyer or artist)"
          className="admin-input mt-3"
        />
        <div className="mt-2">
          <ActionButton disabled={busy} onClick={() => patch({ admin_notes: notesInput })}>
            Save notes
          </ActionButton>
        </div>
      </section>

      {/* Stage */}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-white/40">Advance stage</h3>
        <p className="mt-1 text-xs text-white/45">
          Current stage: <span className="text-white/70">{DEAL_STAGE_LABELS[request.stage]}</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {legalNextStages.length === 0 && (
            <p className="text-xs text-white/40">This deal is closed — no further stage moves are legal.</p>
          )}
          {legalNextStages.map(stage => (
            <ActionButton key={stage} danger={stage === 'closed_lost'} disabled={busy} onClick={() => patch({ stage })}>
              Move to {DEAL_STAGE_LABELS[stage]}
            </ActionButton>
          ))}
        </div>
      </section>

      {/* Placeholders for later integrations — no routes exist yet. */}
      <section className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-5">
        <h3 className="text-sm font-bold uppercase tracking-widest text-white/30">Coming later</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled
            title="Wired in plan 16-09 (embedded e-sign)"
            className="cursor-not-allowed rounded-md border border-white/10 px-2.5 py-1 text-xs font-bold text-white/25"
          >
            Send for signature
          </button>
          <button
            type="button"
            disabled
            title="Wired in plan 16-08 (Stripe Connect split)"
            className="cursor-not-allowed rounded-md border border-white/10 px-2.5 py-1 text-xs font-bold text-white/25"
          >
            Process payment
          </button>
        </div>
      </section>

      <style jsx>{`
        :global(.admin-input) {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(0, 0, 0, 0.3);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: white;
        }
        :global(.admin-input:focus) {
          outline: none;
          border-color: rgba(52, 211, 153, 0.4);
        }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-white/45">{label}</span>
      {children}
    </label>
  )
}

function ActionButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-xs font-bold transition disabled:opacity-50 ${
        danger
          ? 'border-red-400/30 text-red-200 hover:bg-red-400/10'
          : 'border-white/15 text-white/70 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}
