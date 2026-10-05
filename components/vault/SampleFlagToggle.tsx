'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ─── SampleFlagToggle ────────────────────────────────────────────────
// Per-track control: "This track contains a sample." Flipping it on reveals
// a free-text field for sample details and PATCHes the track.
//
// What flagging a sample actually does: `computeStage3` adds a REQUIRED
// Sample Clearance requirement for that track (lib/vault/stage3.ts:277-299)
// and raises `sampleBlock` (:330), which holds the artist at Stage 3 —
// `canContinue: readinessScore >= CONTINUE_THRESHOLD && !sampleBlock` (:338).
//
// It does NOT change the readiness score, and this comment used to claim it
// did. Nothing reads `has_sample` when the score is computed: the TS
// readiness engine never mentions it (lib/vault/readiness.ts — its per-track
// input type declares no such field), and the live calculate_vault_readiness()
// is migration 070's definition, which ends `RETURN LEAST(score, 100)` with no
// sample branch at all. Migration 005 DID cap an uncleared sample at 70; the
// split-sheet-coverage rewrite that became 068/070 dropped that branch, which
// is why the old wording was once true and is not now.
//
// So an uncleared sample holds the project from CONTINUING at whatever score
// it has honestly earned — it does not hold the number down. Do not treat the
// readiness score as a proxy for clearance state; read `sampleBlock`.

export function SampleFlagToggle({
  projectId,
  trackId,
  title,
  initialHasSample,
  initialDetails,
  onOpenSampleClear,
}: {
  projectId: string
  trackId: string
  title: string
  initialHasSample: boolean
  initialDetails: string | null
  /**
   * Reports the bare track id upward after a successful toggle-ON PATCH.
   * This component knows about tracks, not requirements — it does not
   * import or construct a Stage 3 requirement. `DocumentStage` is the one
   * that knows how to turn a track id into a requirement key.
   */
  onOpenSampleClear?: (trackId: string) => void
}) {
  const router = useRouter()
  const [hasSample, setHasSample] = useState(initialHasSample)
  const [details, setDetails] = useState(initialDetails ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedDetails, setSavedDetails] = useState(initialDetails ?? '')

  async function patch(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/vault/${projectId}/tracks/${trackId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Could not save')
        return false
      }
      router.refresh()
      return true
    } catch {
      setError('Network error')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function toggle() {
    const next = !hasSample
    setHasSample(next)
    if (!next) {
      // Turning off — clear details too.
      setDetails('')
      setSavedDetails('')
      await patch({ has_sample: false, sample_details: null })
    } else {
      const ok = await patch({ has_sample: true })
      if (ok) onOpenSampleClear?.(trackId)
    }
  }

  async function saveDetails() {
    const ok = await patch({ sample_details: details.trim() || null })
    if (ok) setSavedDetails(details.trim())
  }

  const dirty = details.trim() !== savedDetails

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{title}</p>
          <p className="text-xs text-white/40">Does this track contain a sample?</p>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          role="switch"
          aria-checked={hasSample}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
            hasSample ? 'bg-amber-400' : 'bg-white/15'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
              hasSample ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {hasSample && (
        <div className="mt-3">
          <textarea
            value={details}
            onChange={e => setDetails(e.target.value)}
            rows={2}
            placeholder="What's sampled? (artist, song, which part)"
            className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
          />
          {dirty && (
            <button
              onClick={saveDetails}
              disabled={busy}
              className="mt-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Save details'}
            </button>
          )}
          <p className="mt-2 text-xs text-white/40">
            SampleClear can help you work out who holds the master and publishing rights —
            usually different parties — and draft a request to each.
          </p>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </div>
  )
}
