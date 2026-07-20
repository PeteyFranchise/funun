'use client'

import { useEffect, useState } from 'react'
import type { Composer } from '@/lib/metadata/schema'
import type { ReconciliationResult } from '@/lib/split-sheets/reconciliation'

// ─── Offered (never-silent) reconciliation diff (P17-07) ──────────────
// Renders the diff between an executed split sheet and the attached
// project's tracks.metadata.composers[]. Never mutates composers[] itself
// — the write happens only when the artist clicks "Confirm & sync," which
// POSTs the exact confirmed set to the reconcile route's `action: 'confirm'`
// branch. Dismissing leaves composers[] untouched and keeps the mismatch
// warning visible (extends Contract Locker's existing ≠100% cross-check
// mental model — a dismissed mismatch stays unresolved, not hidden).

type DiffResponse = {
  trackId: string
  trackTitle: string
  composers: Composer[]
  diff: ReconciliationResult
}

type Phase = 'loading' | 'ready' | 'error' | 'dismissed' | 'confirmed'

export function ReconcileDiff({ sheetId }: { sheetId: string }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [data, setData] = useState<DiffResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [remaps, setRemaps] = useState<Record<string, string>>({}) // party name -> chosen composer name
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/split-sheets/${sheetId}/reconcile`)
      .then(async res => {
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setError(body.error ?? 'Could not load the splits comparison')
          setPhase('error')
          return
        }
        setData(body as DiffResponse)
        setPhase('ready')
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load the splits comparison')
          setPhase('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [sheetId])

  if (phase === 'loading') {
    return <div className="rounded-[14px] border border-hair bg-card2 px-4 py-3 text-[13px] text-lavdim">Comparing signed splits to Metadata Studio…</div>
  }

  if (phase === 'error') {
    return <div className="rounded-[14px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-400">{error}</div>
  }

  if (!data) return null

  const { diff, composers, trackId, trackTitle } = data
  const mismatchExists = diff.needsWriteBack

  if (phase === 'dismissed') {
    return (
      <div className="rounded-[14px] border border-money/30 bg-money/10 px-4 py-3 text-[13px] text-money2">
        Signed splits still differ from {trackTitle}&apos;s composer list.{' '}
        <button className="font-bold underline" onClick={() => setPhase('ready')}>
          Review the mismatch
        </button>
      </div>
    )
  }

  if (phase === 'confirmed') {
    return (
      <div className="rounded-[14px] border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-[13px] text-emerald-400">
        Composer splits for {trackTitle} now match the signed sheet.
      </div>
    )
  }

  async function confirm() {
    if (!data) return
    setBusy(true)
    try {
      const nextComposers: Composer[] = composers.map(c => {
        const match = diff.rows.find(
          r => r.kind === 'matched' && r.name.trim().toLowerCase() === c.name.trim().toLowerCase()
        )
        return match && match.kind === 'matched' ? { ...c, split: match.partyPercent } : c
      })

      // Apply any manual re-maps the artist chose for unmatched parties —
      // onto an EXISTING composer row only; never invents a new one.
      for (const row of diff.rows) {
        if (row.kind !== 'party_no_composer') continue
        const targetName = remaps[row.name]
        if (!targetName) continue
        const idx = nextComposers.findIndex(c => c.name === targetName)
        if (idx >= 0) nextComposers[idx] = { ...nextComposers[idx], split: row.partyPercent }
      }

      const res = await fetch(`/api/split-sheets/${sheetId}/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', trackId, composers: nextComposers }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Could not sync splits')
        setPhase('error')
        return
      }
      setPhase('confirmed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[18px] border border-hair bg-[#0b0a16] p-5">
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-extrabold text-white">Signed sheet vs. {trackTitle}</div>
        {mismatchExists && (
          <span className="rounded-full border border-money/30 bg-money/10 px-3 py-[4px] text-[11.5px] font-bold uppercase tracking-[.08em] text-money2">
            Mismatch
          </span>
        )}
      </div>
      <p className="mt-1 text-[12.5px] text-lavdim">
        The executed sheet is the source of truth. Review the differences, then confirm to sync — nothing is written until you do.
      </p>

      <div className="mt-4 space-y-2">
        {diff.rows.map((row, i) => {
          if (row.kind === 'matched') {
            return (
              <div
                key={`m-${i}`}
                className={`flex items-center justify-between rounded-[10px] border px-3 py-2 text-[13px] ${
                  row.equal ? 'border-hair bg-card2 text-lav' : 'border-money/30 bg-money/10 text-money2'
                }`}
              >
                <span>{row.name}</span>
                <span className="font-semibold">
                  {row.equal ? `${row.partyPercent}%` : `${row.composerPercent}% → ${row.partyPercent}%`}
                </span>
              </div>
            )
          }
          if (row.kind === 'party_no_composer') {
            return (
              <div key={`p-${i}`} className="rounded-[10px] border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-400">
                <div className="flex items-center justify-between">
                  <span>{row.name} (signed {row.partyPercent}%) — no matching composer</span>
                </div>
                <select
                  className="mt-2 w-full rounded-[8px] border border-hair bg-card2 px-2 py-1 text-[12.5px] text-white"
                  value={remaps[row.name] ?? ''}
                  onChange={e => setRemaps(prev => ({ ...prev, [row.name]: e.target.value }))}
                >
                  <option value="">Skip — leave composers unchanged</option>
                  {composers.map(c => (
                    <option key={c.name} value={c.name}>
                      Map to {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )
          }
          return (
            <div key={`c-${i}`} className="rounded-[10px] border border-hair bg-card2 px-3 py-2 text-[13px] text-lavdim">
              {row.name} ({row.composerPercent}%) — not on the signed sheet, left unchanged
            </div>
          )
        })}
      </div>

      <div className="mt-5 flex gap-3">
        <button
          onClick={confirm}
          disabled={busy}
          className="rounded-[10px] bg-brandindigo px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Syncing…' : 'Confirm & sync'}
        </button>
        <button
          onClick={() => setPhase('dismissed')}
          disabled={busy}
          className="rounded-[10px] border border-hair px-4 py-2 text-[13px] font-semibold text-lav"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
