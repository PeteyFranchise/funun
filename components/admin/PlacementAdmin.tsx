'use client'

import { useState } from 'react'
import {
  PLACEMENT_KIND_VALUES,
  PLACEMENT_DESTINATION_VALUES,
  type PlacementKind,
  type PlacementStatus,
  type PlacementDestinationType,
} from '@/lib/green-room/placements-admin'

// ─── PlacementAdmin (Plan 12-10) ──────────────────────────────────────────
// Admin table + create form for the labeled Green Room placement cards.
// Every write goes through /api/admin/green-room/placements, which re-checks
// admin identity and destination visibility server-side — this UI is a thin
// convenience over that authority.

export type PlacementRecord = {
  id: string
  placement_kind: PlacementKind
  label: string
  title: string
  body: string | null
  destination_type: PlacementDestinationType
  destination_id: string | null
  destination_url: string | null
  priority: number
  status: PlacementStatus
  starts_at: string
  ends_at: string | null
  created_at: string
}

type FormState = {
  placement_kind: PlacementKind
  label: string
  title: string
  body: string
  destination_type: PlacementDestinationType
  destination_id: string
  destination_url: string
  priority: string
  ends_at: string
}

const EMPTY_FORM: FormState = {
  placement_kind: 'featured',
  label: '',
  title: '',
  body: '',
  destination_type: 'profile',
  destination_id: '',
  destination_url: '',
  priority: '0',
  ends_at: '',
}

const STATUS_STYLES: Record<PlacementStatus, string> = {
  draft: 'bg-white/10 text-white/60',
  active: 'bg-emerald-400/15 text-emerald-200',
  paused: 'bg-amber-400/15 text-amber-200',
  archived: 'bg-white/5 text-white/35',
}

export function PlacementAdmin({ initialPlacements }: { initialPlacements: PlacementRecord[] }) {
  const [placements, setPlacements] = useState<PlacementRecord[]>(initialPlacements)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function create(activateNow: boolean) {
    setBusy(true)
    setError(null)
    const isExternal = form.destination_type === 'external'
    const payload = {
      placement_kind: form.placement_kind,
      label: form.label,
      title: form.title,
      body: form.body || null,
      destination_type: form.destination_type,
      destination_id: isExternal ? null : form.destination_id,
      destination_url: isExternal ? form.destination_url : null,
      priority: Number(form.priority) || 0,
      ends_at: form.ends_at || null,
      status: activateNow ? 'active' : 'draft',
    }
    const res = await fetch('/api/admin/green-room/placements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) {
      setError(data.error ?? 'Could not create placement')
      return
    }
    setPlacements(prev => [data.data as PlacementRecord, ...prev])
    setForm(EMPTY_FORM)
  }

  async function patch(id: string, update: Record<string, unknown>) {
    setError(null)
    const res = await fetch(`/api/admin/green-room/placements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Could not update placement')
      return
    }
    setPlacements(prev => prev.map(p => (p.id === id ? (data.data as PlacementRecord) : p)))
  }

  async function remove(id: string) {
    setError(null)
    const res = await fetch(`/api/admin/green-room/placements/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Could not delete placement')
      return
    }
    setPlacements(prev => prev.filter(p => p.id !== id))
  }

  const isExternal = form.destination_type === 'external'

  return (
    <div className="mt-6 space-y-8">
      {error && (
        <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</p>
      )}

      {/* Create form */}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white/40">New placement</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Kind">
            <select
              value={form.placement_kind}
              onChange={e => set('placement_kind', e.target.value as PlacementKind)}
              className="admin-input"
            >
              {PLACEMENT_KIND_VALUES.map(k => (
                <option key={k} value={k} className="bg-ink">
                  {k}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Label (badge text)">
            <input value={form.label} onChange={e => set('label', e.target.value)} className="admin-input" />
          </Field>
          <Field label="Title" wide>
            <input value={form.title} onChange={e => set('title', e.target.value)} className="admin-input" />
          </Field>
          <Field label="Body (optional)" wide>
            <textarea
              value={form.body}
              onChange={e => set('body', e.target.value)}
              rows={2}
              className="admin-input"
            />
          </Field>
          <Field label="Destination type">
            <select
              value={form.destination_type}
              onChange={e => set('destination_type', e.target.value as PlacementDestinationType)}
              className="admin-input"
            >
              {PLACEMENT_DESTINATION_VALUES.map(d => (
                <option key={d} value={d} className="bg-ink">
                  {d}
                </option>
              ))}
            </select>
          </Field>
          {isExternal ? (
            <Field label="Destination URL">
              <input
                value={form.destination_url}
                onChange={e => set('destination_url', e.target.value)}
                placeholder="https://…"
                className="admin-input"
              />
            </Field>
          ) : (
            <Field label="Destination ID (UUID)">
              <input
                value={form.destination_id}
                onChange={e => set('destination_id', e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="admin-input"
              />
            </Field>
          )}
          <Field label="Priority">
            <input
              type="number"
              value={form.priority}
              onChange={e => set('priority', e.target.value)}
              className="admin-input"
            />
          </Field>
          <Field label="Ends at (optional)">
            <input
              type="datetime-local"
              value={form.ends_at}
              onChange={e => set('ends_at', e.target.value)}
              className="admin-input"
            />
          </Field>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => create(false)}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-white/80 hover:text-white disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => create(true)}
            className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-black text-black hover:bg-emerald-300 disabled:opacity-50"
          >
            Create &amp; activate
          </button>
        </div>
        <p className="mt-2 text-xs text-white/35">
          Activation is rejected server-side unless the destination is public/visible.
        </p>
      </section>

      {/* Table */}
      <section className="space-y-2">
        {placements.length === 0 && <p className="text-sm text-white/45">No placements yet.</p>}
        {placements.map(p => (
          <article
            key={p.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
          >
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${STATUS_STYLES[p.status]}`}>
              {p.status}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">
                <span className="text-emerald-200/70">[{p.label}]</span> {p.title}
              </p>
              <p className="truncate text-xs text-white/40">
                {p.placement_kind} → {p.destination_type}
                {p.destination_url ? ` · ${p.destination_url}` : p.destination_id ? ` · ${p.destination_id}` : ''} ·
                priority {p.priority}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {p.status !== 'active' && p.status !== 'archived' && (
                <ActionButton onClick={() => patch(p.id, { status: 'active' })}>Activate</ActionButton>
              )}
              {p.status === 'active' && (
                <ActionButton onClick={() => patch(p.id, { status: 'paused' })}>Pause</ActionButton>
              )}
              {p.status === 'paused' && (
                <ActionButton onClick={() => patch(p.id, { status: 'active' })}>Resume</ActionButton>
              )}
              {p.status !== 'archived' && (
                <ActionButton onClick={() => patch(p.id, { status: 'archived' })}>Archive</ActionButton>
              )}
              {(p.status === 'draft' || p.status === 'archived') && (
                <ActionButton danger onClick={() => remove(p.id)}>
                  Delete
                </ActionButton>
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

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? 'md:col-span-2' : ''}`}>
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
