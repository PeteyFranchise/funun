'use client'

import { useState } from 'react'
import {
  REPORT_TARGET_TYPE_VALUES,
  REPORT_REASON_VALUES,
  REPORT_STATUS_VALUES,
  type ReportTargetType,
  type ReportReason,
  type ReportStatus,
} from '@/lib/trust-safety/contracts'
import type { ReportContentAction } from '@/lib/trust-safety/admin-reports'

// ─── ReportsAdmin (Plan 13-04) ─────────────────────────────────────────────
// Admin queue for member reports. Every write goes through
// /api/admin/reports[/:id], which re-checks admin identity server-side —
// this UI is a thin convenience over that authority, mirroring
// components/admin/PlacementAdmin.tsx. Report details (reason/details/
// admin_notes) are only ever fetched by an already-admin-gated request;
// this component never runs for a non-admin caller.

export type AdminReportRecord = {
  id: string
  reporter_id: string
  target_type: ReportTargetType
  target_id: string
  reason: ReportReason
  details: string | null
  status: ReportStatus
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  reporter: { id: string; artist_name: string | null; handle: string | null; avatar_url: string | null } | null
}

type FilterState = {
  status: ReportStatus | ''
  reason: ReportReason | ''
  targetType: ReportTargetType | ''
  since: string
  until: string
}

const EMPTY_FILTERS: FilterState = { status: '', reason: '', targetType: '', since: '', until: '' }

const STATUS_STYLES: Record<ReportStatus, string> = {
  submitted: 'bg-white/10 text-white/60',
  under_review: 'bg-amber-400/15 text-amber-200',
  actioned: 'bg-emerald-400/15 text-emerald-200',
  dismissed: 'bg-white/5 text-white/35',
}

// Which target_types support which content action, mirrors
// lib/trust-safety/admin-reports.ts's isContentActionSupported exactly —
// duplicated here only as UI-affordance metadata (the server re-validates
// regardless).
const CONTENT_ACTIONS_BY_TARGET: Partial<Record<ReportTargetType, { action: ReportContentAction; label: string }[]>> = {
  green_room_post: [
    { action: 'hide', label: 'Hide post' },
    { action: 'remove', label: 'Remove post' },
  ],
  green_room_comment: [
    { action: 'hide', label: 'Hide comment' },
    { action: 'remove', label: 'Remove comment' },
  ],
  green_room_repost: [{ action: 'remove', label: 'Remove repost' }],
  green_room_placement: [
    { action: 'pause', label: 'Pause placement' },
    { action: 'remove', label: 'Archive placement' },
  ],
}

export function ReportsAdmin({ initialReports }: { initialReports: AdminReportRecord[] }) {
  const [reports, setReports] = useState<AdminReportRecord[]>(initialReports)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  async function applyFilters() {
    setBusy(true)
    setError(null)
    const params = new URLSearchParams()
    if (filters.status) params.set('status', filters.status)
    if (filters.reason) params.set('reason', filters.reason)
    if (filters.targetType) params.set('targetType', filters.targetType)
    if (filters.since) params.set('since', new Date(filters.since).toISOString())
    if (filters.until) params.set('until', new Date(filters.until).toISOString())

    const res = await fetch(`/api/admin/reports${params.toString() ? `?${params}` : ''}`)
    const data = await res.json()
    setBusy(false)
    if (!res.ok) {
      setError(data.error ?? 'Could not load reports')
      return
    }
    setReports(data.data as AdminReportRecord[])
  }

  async function patch(id: string, update: Record<string, unknown>) {
    setError(null)
    const res = await fetch(`/api/admin/reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Could not update report')
      return
    }
    setReports(prev => prev.map(r => (r.id === id ? { ...r, ...(data.data as AdminReportRecord) } : r)))
  }

  return (
    <div className="mt-6 space-y-6">
      {error && (
        <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</p>
      )}

      {/* Filters */}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white/40">Filters</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <Field label="Status">
            <select value={filters.status} onChange={e => setFilter('status', e.target.value as FilterState['status'])} className="admin-input">
              <option value="">All</option>
              {REPORT_STATUS_VALUES.map(s => (
                <option key={s} value={s} className="bg-ink">
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reason">
            <select value={filters.reason} onChange={e => setFilter('reason', e.target.value as FilterState['reason'])} className="admin-input">
              <option value="">All</option>
              {REPORT_REASON_VALUES.map(r => (
                <option key={r} value={r} className="bg-ink">
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Target type">
            <select value={filters.targetType} onChange={e => setFilter('targetType', e.target.value as FilterState['targetType'])} className="admin-input">
              <option value="">All</option>
              {REPORT_TARGET_TYPE_VALUES.map(t => (
                <option key={t} value={t} className="bg-ink">
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Since">
            <input type="date" value={filters.since} onChange={e => setFilter('since', e.target.value)} className="admin-input" />
          </Field>
          <Field label="Until">
            <input type="date" value={filters.until} onChange={e => setFilter('until', e.target.value)} className="admin-input" />
          </Field>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={applyFilters}
            className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-black text-black hover:bg-emerald-300 disabled:opacity-50"
          >
            Apply filters
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setFilters(EMPTY_FILTERS)
              setReports(initialReports)
            }}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-white/80 hover:text-white disabled:opacity-50"
          >
            Reset
          </button>
        </div>
      </section>

      {/* Queue */}
      <section className="space-y-3">
        {reports.length === 0 && <p className="text-sm text-white/45">No reports match these filters.</p>}
        {reports.map(r => (
          <article key={r.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${STATUS_STYLES[r.status]}`}>
                {r.status}
              </span>
              <span className="text-xs font-bold uppercase tracking-wide text-white/50">{r.target_type}</span>
              <span className="text-xs text-white/35">{r.target_id}</span>
              <span className="ml-auto text-xs text-white/35">{new Date(r.created_at).toLocaleString()}</span>
            </div>
            <div className="mt-2 text-sm text-white/80">
              <span className="font-bold">Reporter:</span>{' '}
              {r.reporter ? `${r.reporter.artist_name ?? 'Member'} (@${r.reporter.handle ?? '—'})` : r.reporter_id}
              {' · '}
              <span className="font-bold">Reason:</span> {r.reason}
            </div>
            {r.details && <p className="mt-1 text-sm text-white/60">{r.details}</p>}

            <textarea
              value={notes[r.id] ?? r.admin_notes ?? ''}
              onChange={e => setNotes(prev => ({ ...prev, [r.id]: e.target.value }))}
              placeholder="Internal note (admin-only)"
              rows={2}
              className="admin-input mt-3"
            />

            <div className="mt-2 flex flex-wrap gap-1.5">
              <ActionButton onClick={() => patch(r.id, { adminNotes: notes[r.id] ?? r.admin_notes ?? '' })}>
                Save note
              </ActionButton>
              {r.status !== 'under_review' && (
                <ActionButton onClick={() => patch(r.id, { status: 'under_review' })}>Mark reviewing</ActionButton>
              )}
              {r.status !== 'dismissed' && (
                <ActionButton onClick={() => patch(r.id, { status: 'dismissed' })}>Dismiss</ActionButton>
              )}
              {(CONTENT_ACTIONS_BY_TARGET[r.target_type] ?? []).map(({ action, label }) => (
                <ActionButton key={action} danger onClick={() => patch(r.id, { status: 'actioned', contentAction: action })}>
                  {label}
                </ActionButton>
              ))}
              {!CONTENT_ACTIONS_BY_TARGET[r.target_type] && r.status !== 'actioned' && (
                <ActionButton onClick={() => patch(r.id, { status: 'actioned' })}>Mark actioned</ActionButton>
              )}
            </div>
          </article>
        ))}
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
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-xs font-bold transition ${
        danger
          ? 'border-red-400/30 text-red-200 hover:bg-red-400/10'
          : 'border-white/15 text-white/70 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}
