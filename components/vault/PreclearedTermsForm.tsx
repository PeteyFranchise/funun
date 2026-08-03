'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  USAGE_TYPE_VALUES,
  USAGE_TYPE_LABELS,
  TERRITORY_VALUES,
  TERRITORY_LABELS,
  type ProjectLicenseTerms,
  type UsageType,
  type Territory,
} from '@/lib/deals/schema'

// ─── PreclearedTermsForm (D-15, the "Marmoset five") ─────────────────────
// One control per pre-clearable dimension: minimum fee, allowed usage/media
// types, territories, exclusivity, and maximum term length. Option lists
// are sourced from lib/deals/schema.ts so this form and the buyer request
// composer (plan 16-06) speak the same vocabulary — a mismatch here would
// silently break matching (lib/deals/matching.ts). PATCHes
// /api/vault/[projectId]/licensing and calls router.refresh() on success,
// following the RightsStatusPatch convention already used on this page.

function toggleValue<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value]
}

const CHIP_BASE =
  'rounded-full border px-2.5 py-1 text-[11px] font-medium transition'
const CHIP_ON = 'border-indigo-400/40 bg-indigo-400/15 text-indigo-200'
const CHIP_OFF = 'border-white/15 text-white/50 hover:border-white/30'

export function PreclearedTermsForm({
  projectId,
  terms,
}: {
  projectId: string
  terms: ProjectLicenseTerms | null
}) {
  const router = useRouter()
  const [minFee, setMinFee] = useState(
    terms?.min_fee_cents != null ? String(terms.min_fee_cents / 100) : ''
  )
  const [usageTypes, setUsageTypes] = useState<UsageType[]>(terms?.allowed_usage_types ?? [])
  const [territories, setTerritories] = useState<Territory[]>(terms?.territories ?? [])
  const [exclusivity, setExclusivity] = useState<boolean | null>(
    terms?.exclusivity_allowed ?? null
  )
  const [maxTerm, setMaxTerm] = useState(
    terms?.max_term_months != null ? String(terms.max_term_months) : ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasTermsSet = terms !== null

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/vault/${projectId}/licensing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          min_fee_cents: minFee.trim() === '' ? null : Math.round(Number(minFee) * 100),
          allowed_usage_types: usageTypes,
          territories,
          exclusivity_allowed: exclusivity,
          max_term_months: maxTerm.trim() === '' ? null : Math.round(Number(maxTerm)),
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? 'Failed to save terms.')
        return
      }
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs leading-relaxed text-white/50">
        Pre-clearing sets the bar a buyer&apos;s request can automatically clear. Requests that
        fall inside these terms move straight to contract; requests outside them — or if you
        leave terms unset — go to Funūn for negotiation first. Leaving terms unset is a valid
        choice; it just means every request on this project routes through Funūn.
      </p>
      {!hasTermsSet && (
        <p className="mt-2 text-[11px] font-semibold text-amber-300">
          No terms set yet — every request on this project currently routes to Funūn for
          negotiation.
        </p>
      )}

      {/* Minimum fee */}
      <div className="mt-4">
        <label className="text-xs font-semibold text-white/70">Minimum fee</label>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-sm text-white/40">$</span>
          <input
            type="number"
            min={0}
            step="1"
            value={minFee}
            onChange={e => setMinFee(e.target.value)}
            placeholder="No minimum"
            className="w-32 rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-400/50"
          />
        </div>
      </div>

      {/* Allowed usage / media types */}
      <div className="mt-4">
        <label className="text-xs font-semibold text-white/70">
          Allowed usage / media types
        </label>
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
        <label className="text-xs font-semibold text-white/70">Territories</label>
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

      {/* Exclusivity */}
      <div className="mt-4">
        <label className="text-xs font-semibold text-white/70">Exclusivity allowed</label>
        <div className="mt-2 flex gap-1.5">
          {(
            [
              { value: true as const, label: 'Yes' },
              { value: false as const, label: 'No' },
              { value: null, label: 'Unset' },
            ]
          ).map(opt => (
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

      {/* Maximum term length */}
      <div className="mt-4">
        <label className="text-xs font-semibold text-white/70">
          Maximum term length (months)
        </label>
        <input
          type="number"
          min={0}
          step="1"
          value={maxTerm}
          onChange={e => setMaxTerm(e.target.value)}
          placeholder="No maximum"
          className="mt-1 w-32 rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-400/50"
        />
      </div>

      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}

      <div className="mt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg border border-indigo-400/30 bg-indigo-400/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-400/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save pre-cleared terms'}
        </button>
      </div>
    </div>
  )
}
