'use client'

import { useEffect, useState } from 'react'

// ─── EngagementPanel (R13, D-31.2-13/14) ────────────────────────────────────
// The AE's per-Selects telemetry readout: mounts on
// app/(admin)/admin/selects/[id]/page.tsx (the Selects detail view) and
// self-fetches GET /api/admin/client-partners/selects/[id]/engagement on
// mount — data + string-action props only (Pitfall 1, T-31.1-rsc-func-prop):
// the page passes selectsId (a string), never a function, across the RSC
// boundary. Own-Selects-scoped + staff-only server-side (the route's own
// requireStaff + loadSelectsInScope gate); this panel renders nothing when
// the Selects has no tracks yet — never a misleading "0 of everything" card
// before the AE has built anything.

export type EngagementTrackReadout = {
  selectsTrackId: string
  title: string
  audibleSeconds: number
  qualifiedListens: number
  replayCount: number
}

export type EngagementReadoutSummary = {
  audibleSeconds: number
  qualifiedListens: number
  replayCount: number
  trackCount: number
}

type EngagementReadout = {
  tracks: EngagementTrackReadout[]
  summary: EngagementReadoutSummary
  opens: number
}

function formatSeconds(total: number): string {
  const rounded = Math.round(total)
  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds}s`
}

export function EngagementPanel({ selectsId }: { selectsId: string }) {
  const [data, setData] = useState<EngagementReadout | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/admin/client-partners/selects/${selectsId}/engagement`)
      .then(async res => {
        const json = (await res.json().catch(() => ({}))) as { data?: EngagementReadout; error?: string }
        if (!res.ok) throw new Error(json.error ?? "Couldn't load engagement.")
        if (!cancelled) setData(json.data ?? null)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load engagement.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectsId])

  if (loading) return null
  if (error) {
    return (
      <p className="mt-6 text-[12.5px]" style={{ color: 'var(--rose-fg)' }}>
        {error}
      </p>
    )
  }
  if (!data || data.tracks.length === 0) return null

  const { tracks, summary, opens } = data

  return (
    <div className="mt-7 rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
      <div className="mb-3 flex items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[.05em]"
          style={{ color: 'var(--indigo)', background: 'color-mix(in srgb, var(--indigo) 16%, transparent)' }}
        >
          Staff only
        </span>
        <h3 className="text-[13.5px] font-bold text-[color:var(--ink)]">Engagement</h3>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[color:var(--ink-3)]">
        <span>
          {opens} open{opens === 1 ? '' : 's'}
        </span>
        <span>·</span>
        <span>
          {summary.qualifiedListens} qualified listen{summary.qualifiedListens === 1 ? '' : 's'}
        </span>
        <span>·</span>
        <span>{formatSeconds(summary.audibleSeconds)} audible</span>
        <span>·</span>
        <span>
          {summary.replayCount} replay{summary.replayCount === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {tracks.map(t => (
          <div
            key={t.selectsTrackId}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3.5 py-2.5"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[color:var(--ink)]">{t.title}</span>
            <span className="text-[11.5px] text-[color:var(--ink-3)]">{formatSeconds(t.audibleSeconds)}</span>
            <span className="text-[11.5px] text-[color:var(--ink-3)]">
              {t.qualifiedListens} qualified
            </span>
            <span className="text-[11.5px] text-[color:var(--ink-3)]">
              {t.replayCount} replay{t.replayCount === 1 ? '' : 's'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
