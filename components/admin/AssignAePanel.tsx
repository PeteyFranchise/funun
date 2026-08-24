'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AeCoverage } from '@/lib/client-partners/coverage'

// ─── AssignAePanel (D-31.1-05) ──────────────────────────────────────────────
// The richer assign panel — AE search + each AE's load + their book's
// health mix, and a REQUIRED handoff note (Assign stays disabled until it's
// filled). PATCHes /api/admin/buyer-orgs/{id}/ae with { ae_user_id, note }
// directly from here and router.refresh()es on success. This component's
// parent is ClientPartnersRoom — another 'use client' component — so the
// onClose function prop below crosses a client-to-client boundary only,
// never the RSC page → client boundary (Pitfall 1 applies to aeList/orgId/
// orgName, which stay data + string all the way from the RSC page).

export type AssignAePanelProps = {
  orgId: string
  orgName: string
  aeList: AeCoverage[]
  onClose: () => void
}

const HEALTH_MIX_TONE: Record<'good' | 'warning' | 'at_risk', { fg: string; bg: string }> = {
  good: { fg: 'var(--green-fg)', bg: 'var(--green-bg)' },
  warning: { fg: 'var(--amber-fg)', bg: 'var(--amber-bg)' },
  at_risk: { fg: 'var(--rose-fg)', bg: 'var(--rose-bg)' },
}

function initialsFor(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map(w => w[0]?.toUpperCase() ?? '').join('') || '—'
}

export function AssignAePanel({ orgId, orgName, aeList, onClose }: AssignAePanelProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [selectedAeId, setSelectedAeId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return aeList
    return aeList.filter(ae => ae.aeName.toLowerCase().includes(q))
  }, [aeList, query])

  const selectedAe = aeList.find(ae => ae.aeId === selectedAeId) ?? null
  // Client-side guard mirroring the server's 400 (a note is required to
  // assign) — Assign stays disabled until BOTH an AE is chosen and the
  // note is non-empty.
  const canAssign = selectedAeId !== null && note.trim().length > 0 && !submitting

  async function handleAssign() {
    if (!canAssign || !selectedAeId) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/buyer-orgs/${orgId}/ae`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ae_user_id: selectedAeId, note: note.trim() }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong — please try again.')
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] rounded-[18px] border p-5 shadow-2xl"
        style={{ borderColor: 'var(--border-2)', background: 'var(--panel)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-[16px] font-extrabold text-[color:var(--ink)]">Assign an AE — {orgName}</h3>
        <p className="mb-4 mt-1 text-[12px] text-[color:var(--ink-3)]">
          They&apos;ll get the locked intro email + an onboarding task in their queue. This can be
          reassigned later.
        </p>

        {error && <p className="mb-3 text-[13px] text-[color:var(--rose-fg)]">{error}</p>}

        <div className="mb-1.5 text-[11.5px] font-bold uppercase tracking-[.05em] text-[color:var(--ink-3)]">
          Choose an AE
        </div>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search AEs by name…"
          className="mb-2.5 w-full rounded-lg border px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--panel-2)' }}
        />
        <div className="mb-4 max-h-[220px] overflow-y-auto pr-1">
          {filtered.length === 0 && (
            <p className="px-1 py-3 text-[12.5px] text-[color:var(--ink-3)]">
              No AEs match &quot;{query}&quot;.
            </p>
          )}
          {filtered.map(ae => (
            <button
              key={ae.aeId}
              type="button"
              onClick={() => setSelectedAeId(ae.aeId)}
              className="mb-2 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition"
              style={{
                borderColor: selectedAeId === ae.aeId ? 'var(--indigo)' : 'var(--border)',
                background:
                  selectedAeId === ae.aeId
                    ? 'color-mix(in srgb, var(--indigo) 10%, var(--panel))'
                    : 'var(--panel)',
              }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: 'var(--indigo)' }}
              >
                {initialsFor(ae.aeName || '—')}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-[color:var(--ink)]">
                  {ae.aeName || 'Unnamed'}
                </div>
                <div className="text-[11px] text-[color:var(--ink-3)]">
                  {ae.load} client{ae.load === 1 ? '' : 's'}
                </div>
              </div>
              <div className="flex shrink-0 gap-1 text-[10.5px] font-bold">
                {(['good', 'warning', 'at_risk'] as const).map(state => (
                  <span
                    key={state}
                    className="min-w-[20px] rounded px-1 py-0.5 text-center"
                    style={{ background: HEALTH_MIX_TONE[state].bg, color: HEALTH_MIX_TONE[state].fg }}
                  >
                    {ae.healthMix[state]}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>

        <div className="mb-1.5 text-[11.5px] font-bold uppercase tracking-[.05em] text-[color:var(--ink-3)]">
          Handoff note <span style={{ color: 'var(--rose-fg)' }}>*</span>
          <span className="ml-1 font-normal normal-case tracking-normal text-[color:var(--ink-3)]">
            required — goes to the AE
          </span>
        </div>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Context for the AE — who they are, why now, anything you promised… (required)"
          rows={3}
          className="w-full resize-none rounded-lg border px-3 py-2 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:outline-none"
          style={{ borderColor: 'var(--border)', background: 'var(--panel-2)' }}
        />
        <p className="mt-1.5 text-[11px] text-[color:var(--ink-3)]">
          Every handoff needs a note so the AE starts with context — Assign stays disabled until
          it&apos;s filled in.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleAssign}
            disabled={!canAssign}
            className="flex-1 rounded-lg px-4 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ background: 'var(--grad)' }}
          >
            {submitting
              ? 'Assigning…'
              : selectedAe
                ? `Assign + notify ${selectedAe.aeName.split(' ')[0] || 'AE'}`
                : 'Assign'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2.5 text-[13px] text-[color:var(--ink-2)]"
            style={{ borderColor: 'var(--border-2)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
