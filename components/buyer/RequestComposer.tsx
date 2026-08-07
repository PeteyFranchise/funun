'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  USAGE_TYPE_VALUES,
  USAGE_TYPE_LABELS,
  TERRITORY_VALUES,
  TERRITORY_LABELS,
  type UsageType,
  type Territory,
} from '@/lib/deals/schema'

// ─── RequestComposer (D-07/D-02) ───────────────────────────────────────────
// Guided form over the D-07 buyer dimensions. Option vocabularies are
// sourced from lib/deals/schema.ts — the same module the artist's
// PreclearedTermsForm reads — so buyer selections are always comparable to
// pre-cleared terms by matchesPreclearedTerms(). Deliberately renders NO
// pre-cleared terms and NO match verdict (the artist's commercial floor is
// private; revealing it would let a buyer anchor every request exactly at
// it), and offers NO messaging/contact affordance anywhere (beta
// buyer↔artist communication is admin-mediated, D-14b — the request itself
// is the channel).

function toggleValue<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value]
}

const CHIP_BASE = 'rounded-full border px-2.5 py-1 text-[11px] font-medium transition'
const CHIP_ON = 'border-[color:var(--indigo)] bg-[var(--wash)] text-[color:var(--indigo)]'
const CHIP_OFF = 'border-[color:var(--line)] text-[color:var(--ink-3)] hover:border-[color:var(--line-2)]'

export type ComposerProject = {
  id: string
  title: string
  tracks: { id: string; title: string | null }[]
}

export function RequestComposer({ project }: { project: ComposerProject }) {
  const router = useRouter()

  const [trackIds, setTrackIds] = useState<string[]>([])
  const [usageTypes, setUsageTypes] = useState<UsageType[]>([])
  const [territories, setTerritories] = useState<Territory[]>([])
  const [termMonths, setTermMonths] = useState('')
  const [exclusivity, setExclusivity] = useState(false)
  const [budget, setBudget] = useState('')
  const [needBy, setNeedBy] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function validate(): string | null {
    if (trackIds.length === 0) return 'Select at least one track.'
    if (usageTypes.length === 0) return 'Select at least one usage type.'
    if (territories.length === 0) return 'Select at least one territory.'
    const term = Number(termMonths)
    if (!Number.isInteger(term) || term < 1) return 'Term length must be a whole number of months.'
    const budgetNum = Number(budget)
    if (budget.trim() === '' || Number.isNaN(budgetNum) || budgetNum < 0) {
      return 'Enter a budget of $0 or more.'
    }
    return null
  }

  async function handleSubmit() {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/buyer/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vault_project_id: project.id,
          track_ids: trackIds,
          usage_types: usageTypes,
          territories,
          term_months: Math.round(Number(termMonths)),
          exclusivity,
          budget_cents: Math.round(Number(budget) * 100),
          need_by: needBy.trim() === '' ? null : needBy,
          buyer_notes: notes.trim() === '' ? null : notes.trim(),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: { id: string }; error?: string }
      if (!res.ok || !json.data) {
        setError(json.error ?? 'Failed to submit request. Please check your entries and try again.')
        return
      }
      router.push(`/sync/requests/${json.data.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl border border-[color:var(--line)] bg-[var(--wash)] p-4">
      <p className="text-xs font-semibold text-[color:var(--ink-3)]">Project</p>
      <p className="mt-1 text-sm text-[color:var(--ink)]">{project.title}</p>

      {/* Tracks */}
      <div className="mt-4">
        <label className="text-xs font-semibold text-[color:var(--ink-3)]">Tracks</label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {project.tracks.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTrackIds(prev => toggleValue(prev, t.id))}
              className={`${CHIP_BASE} ${trackIds.includes(t.id) ? CHIP_ON : CHIP_OFF}`}
            >
              {t.title ?? 'Untitled track'}
            </button>
          ))}
          {project.tracks.length === 0 && (
            <p className="text-[11px] text-[color:var(--ink-3)]">This project has no tracks to request.</p>
          )}
        </div>
      </div>

      {/* Usage / media types */}
      <div className="mt-4">
        <label className="text-xs font-semibold text-[color:var(--ink-3)]">Usage / media types</label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {USAGE_TYPE_VALUES.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setUsageTypes(prev => toggleValue(prev, v))}
              className={`${CHIP_BASE} ${usageTypes.includes(v) ? CHIP_ON : CHIP_OFF}`}
            >
              {USAGE_TYPE_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      {/* Territories */}
      <div className="mt-4">
        <label className="text-xs font-semibold text-[color:var(--ink-3)]">Territories</label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TERRITORY_VALUES.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setTerritories(prev => toggleValue(prev, v))}
              className={`${CHIP_BASE} ${territories.includes(v) ? CHIP_ON : CHIP_OFF}`}
            >
              {TERRITORY_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      {/* Term length + exclusivity */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-[color:var(--ink-3)]">Term length (months)</label>
          <input
            type="number"
            min={1}
            step="1"
            value={termMonths}
            onChange={e => setTermMonths(e.target.value)}
            placeholder="e.g. 12"
            className="mt-1 w-full rounded-lg border border-[color:var(--line-2)] bg-white px-2 py-1.5 text-sm text-[color:var(--ink)] outline-none focus:border-[color:var(--indigo)]"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-[color:var(--ink-3)]">Exclusivity</label>
          <div className="mt-1 flex gap-1.5">
            {[
              { value: false, label: 'Non-exclusive' },
              { value: true, label: 'Exclusive' },
            ].map(opt => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => setExclusivity(opt.value)}
                className={`${CHIP_BASE} ${exclusivity === opt.value ? CHIP_ON : CHIP_OFF}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Budget + need-by */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-[color:var(--ink-3)]">Budget</label>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-sm text-[color:var(--ink-3)]">$</span>
            <input
              type="number"
              min={0}
              step="1"
              value={budget}
              onChange={e => setBudget(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-[color:var(--line-2)] bg-white px-2 py-1.5 text-sm text-[color:var(--ink)] outline-none focus:border-[color:var(--indigo)]"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-[color:var(--ink-3)]">Need by</label>
          <input
            type="date"
            value={needBy}
            onChange={e => setNeedBy(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[color:var(--line-2)] bg-white px-2 py-1.5 text-sm text-[color:var(--ink)] outline-none focus:border-[color:var(--indigo)]"
          />
        </div>
      </div>

      {/* Notes */}
      <div className="mt-4">
        <label className="text-xs font-semibold text-[color:var(--ink-3)]">Notes for Funūn</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Anything about the intended use worth knowing before we negotiate this."
          className="mt-1 w-full rounded-lg border border-[color:var(--line-2)] bg-white px-2 py-1.5 text-sm text-[color:var(--ink)] outline-none focus:border-[color:var(--indigo)]"
        />
      </div>

      {error && <p className="mt-3 text-xs text-[color:var(--req-fg)]">{error}</p>}

      <div className="mt-5">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-lg border border-[color:var(--line)] bg-[var(--wash-2)] px-3 py-1.5 text-xs font-semibold text-[color:var(--indigo)] transition hover:bg-[var(--wash)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
    </div>
  )
}
