'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { computeHealth, type HealthRulesConfig, type HealthSignals, type HealthState } from '@/lib/client-partners/health'

// ─── HealthRulesForm (D-31.1-03/D-31.1-08) ─────────────────────────────────
// The leadership-only Health Rules settings surface: tunable thresholds +
// keeps-warm toggles with a LIVE preview of the resulting state split, plus
// the swappable prospect-marker image. Receives ONLY data + string action
// paths from the RSC page (app/(admin)/admin/health-rules/page.tsx) — no
// function prop crosses that boundary (Pitfall 1, commit 80443bb —
// production 500 otherwise).
//
// D-06: the preview recomputes computeHealth() over sampleSignals ENTIRELY
// client-side as the draft state changes — no fetch, nothing recomputed or
// stored server-side until Save. Save PATCHes the real config; the next
// render of the Client Partners rooms reads the new row.

export type HealthRulesConfigRow = HealthRulesConfig & {
  id: number
  prospect_image_url: string | null
  updated_at: string
}

export type HealthRulesFormProps = {
  config: HealthRulesConfigRow
  /** A lightweight, already-fetched sample of the book's raw health signals — the preview's input, never refetched client-side. */
  sampleSignals: HealthSignals[]
  configActionPath: string
  prospectImageActionPath: string
}

type DraftRules = HealthRulesConfig

const HEALTH_STATE_LABELS: Record<HealthState, string> = {
  good: 'good',
  warning: 'warning',
  at_risk: 'at risk',
  cold: 'cold',
  prospect: 'prospects',
}

const HEALTH_STATE_TONE: Record<HealthState, string> = {
  good: 'var(--green-fg, #34D399)',
  warning: 'var(--amber-fg, #F4C77B)',
  at_risk: 'var(--rose-fg, #F9A8C0)',
  cold: 'var(--cold-fg, #60A5FA)',
  prospect: 'var(--ink-2)',
}

function toDraft(config: HealthRulesConfigRow): DraftRules {
  return {
    good_within_days: config.good_within_days,
    warning_after_days: config.warning_after_days,
    at_risk_after_days: config.at_risk_after_days,
    cold_after_days: config.cold_after_days,
    keep_warm_open_brief: config.keep_warm_open_brief,
    keep_warm_open_deal: config.keep_warm_open_deal,
    keep_warm_recent_selects: config.keep_warm_recent_selects,
    recent_selects_days: config.recent_selects_days,
    keep_warm_recent_contact: config.keep_warm_recent_contact,
    recent_contact_days: config.recent_contact_days,
  }
}

function countByState(signals: HealthSignals[], rules: DraftRules): Record<HealthState, number> {
  const counts: Record<HealthState, number> = { good: 0, warning: 0, at_risk: 0, cold: 0, prospect: 0 }
  for (const signal of signals) {
    counts[computeHealth(signal, rules)] += 1
  }
  return counts
}

function NumberField({
  label,
  dotColor,
  prefix,
  value,
  onChange,
}: {
  label: string
  dotColor: string
  prefix: string
  value: number
  onChange: (next: number) => void
}) {
  return (
    <div
      className="min-w-[150px] flex-1 rounded-xl border p-[11px_13px]"
      style={{ borderColor: 'var(--border)', background: 'var(--panel-2)' }}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: dotColor }}>
        <span className="h-2 w-2 rounded-full" style={{ background: dotColor }} />
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[12px] text-[color:var(--ink-3)]">{prefix}</span>
        <input
          type="number"
          min={1}
          value={value}
          onChange={e => onChange(Math.max(1, Number(e.target.value) || 1))}
          className="w-14 rounded-lg border bg-[color:var(--ground)] px-2 py-1 text-center text-[16px] font-bold text-[color:var(--ink)]"
          style={{ borderColor: 'var(--border)' }}
        />
        <span className="text-[12px] text-[color:var(--ink-3)]">days</span>
      </div>
    </div>
  )
}

function Toggle({
  title,
  subtitle,
  checked,
  onChange,
  extra,
}: {
  title: string
  subtitle: string
  checked: boolean
  onChange: (next: boolean) => void
  extra?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 border-t py-3 first:border-t-0" style={{ borderColor: 'var(--border)' }}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative mt-0.5 h-[22px] w-[38px] flex-none rounded-full border transition"
        style={{
          background: checked ? 'var(--indigo, #818CF8)' : 'var(--panel-2)',
          borderColor: checked ? 'transparent' : 'var(--border-2, rgba(199,203,247,.22))',
        }}
      >
        <span
          className="absolute top-[2px] h-4 w-4 rounded-full bg-white transition-all"
          style={{ left: checked ? '18px' : '2px' }}
        />
      </button>
      <div>
        <div className="text-[13.5px] font-semibold text-[color:var(--ink)]">{title}</div>
        <div className="mt-0.5 text-[12px] text-[color:var(--ink-3)]">
          {subtitle}
          {extra}
        </div>
      </div>
    </div>
  )
}

export function HealthRulesForm({ config, sampleSignals, configActionPath, prospectImageActionPath }: HealthRulesFormProps) {
  const router = useRouter()
  const [draft, setDraft] = useState<DraftRules>(() => toDraft(config))
  const [prospectImageUrl, setProspectImageUrl] = useState<string | null>(config.prospect_image_url)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const preview = useMemo(() => countByState(sampleSignals, draft), [sampleSignals, draft])

  // 3-way check (owner decision, 2026-08-24): Cold is open-ended past
  // at_risk_after_days, not a fourth independently-tunable threshold.
  const orderingOk =
    draft.good_within_days < draft.warning_after_days &&
    draft.warning_after_days < draft.at_risk_after_days

  function patchDraft(next: Partial<DraftRules>) {
    setDraft(prev => ({ ...prev, ...next }))
    setSavedMessage(null)
  }

  async function handleSave() {
    if (!orderingOk) {
      setError('Thresholds must be strictly increasing: Good < Warning < At-risk.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      // cold_after_days is no longer client-editable (3-threshold model) —
      // the API force-sets it to at_risk_after_days on every write, so it
      // is deliberately omitted from the PATCH body.
      const { cold_after_days: _coldAfterDays, ...editableDraft } = draft
      const res = await fetch(configActionPath, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editableDraft),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body.error === 'string' ? body.error : 'Failed to save health rules.')
        return
      }
      setSavedMessage('Saved — applies immediately across My & All Client Partners.')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.set('file', file)
      const res = await fetch(prospectImageActionPath, { method: 'POST', body: form })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body.error === 'string' ? body.error : 'Failed to upload the prospect marker image.')
        return
      }
      setProspectImageUrl(body.data.prospect_image_url ?? null)
      router.refresh()
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="mt-4 max-w-[720px]">
      <p className="text-[13.5px] text-[color:var(--ink-3)]">
        Health color reflects a client&apos;s <b className="text-[color:var(--ink-2)]">last actual license</b> — are they
        still buying? Good → Warning → At-risk → <b className="text-[color:var(--ink-2)]">Cold</b>. Brand-new{' '}
        <b className="text-[color:var(--ink-2)]">prospects</b> (no license yet) get a symbol, not a color. Last contact
        and time in stage are tracked separately and never set the color. Computed live (D-06).
      </p>

      {/* ─── Thresholds ─────────────────────────────────────────────── */}
      <div
        className="mt-4 rounded-2xl border p-[18px_20px]"
        style={{ borderColor: 'color-mix(in srgb, var(--money, #6EE7B7) 32%, transparent)', background: 'var(--panel)' }}
      >
        <div className="flex items-center gap-2 text-[14.5px] font-bold text-[color:var(--ink)]">
          Last license
          <span
            className="rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-[color:var(--money,#6EE7B7)]"
            style={{ background: 'color-mix(in srgb, var(--money, #6EE7B7) 15%, transparent)' }}
          >
            sets the color
          </span>
        </div>
        <p className="mt-1 text-[12px] text-[color:var(--ink-3)]">Days since the client&apos;s most recent executed/signed license.</p>

        <div className="mt-4 flex flex-wrap gap-2.5">
          <NumberField
            label="Good — within N days"
            dotColor="var(--green-fg, #34D399)"
            prefix="within"
            value={draft.good_within_days}
            onChange={v => patchDraft({ good_within_days: v })}
          />
          <NumberField
            label="Warning — up to N days"
            dotColor="var(--amber-fg, #F4C77B)"
            prefix="after"
            value={draft.warning_after_days}
            onChange={v => patchDraft({ warning_after_days: v })}
          />
          <NumberField
            label="At-risk — up to N days"
            dotColor="var(--rose-fg, #F9A8C0)"
            prefix="after"
            value={draft.at_risk_after_days}
            onChange={v => patchDraft({ at_risk_after_days: v })}
          />
          {/* Cold is derived/read-only — open-ended past At-risk, not a
              fourth independently-tunable threshold (owner decision,
              2026-08-24, CR-01 + verification Gap 1). */}
          <div
            className="min-w-[150px] flex-1 rounded-xl border p-[11px_13px]"
            style={{ borderColor: 'var(--border)', background: 'var(--panel-2)' }}
          >
            <div
              className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide"
              style={{ color: 'var(--cold-fg, #60A5FA)' }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: 'var(--cold-fg, #60A5FA)' }} />
              Cold — over {draft.at_risk_after_days} days
            </div>
            <div className="mt-1.5 text-[12px] text-[color:var(--ink-3)]">Derived from At-risk — not separately tunable.</div>
          </div>
        </div>
        {!orderingOk && (
          <p className="mt-2 text-[12px] font-semibold text-[color:var(--rose-fg,#F9A8C0)]">
            Thresholds must be strictly increasing: Good &lt; Warning &lt; At-risk.
          </p>
        )}

        <div
          className="mt-3.5 flex items-center gap-2.5 rounded-xl border border-dashed p-[11px_13px] text-[12.5px] text-[color:var(--ink-3)]"
          style={{ borderColor: 'var(--border-2, rgba(199,203,247,.22))', background: 'var(--panel-2)' }}
        >
          <span
            className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg border text-[16px]"
            style={{ borderColor: 'var(--border-2, rgba(199,203,247,.22))', background: 'color-mix(in srgb, var(--indigo,#818CF8) 12%, transparent)' }}
          >
            {prospectImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={prospectImageUrl} alt="" className="h-full w-full rounded-lg object-cover" />
            ) : (
              '🦁'
            )}
          </span>
          <div>
            <b className="text-[color:var(--ink-2)]">New / Prospect</b> — no license yet. Marked with a symbol, not a
            color. Not scored on buying-recency until their first license.
          </div>
        </div>
      </div>

      {/* ─── Prospect marker ────────────────────────────────────────── */}
      <div className="mt-4 rounded-2xl border p-[18px_20px]" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
        <div className="flex items-center gap-2 text-[14.5px] font-bold text-[color:var(--ink)]">
          Prospect marker
          <span
            className="rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[color:var(--indigo,#818CF8)]"
            style={{ background: 'color-mix(in srgb, var(--indigo, #818CF8) 16%, transparent)' }}
          >
            configurable
          </span>
        </div>
        <p className="mt-1 text-[12px] text-[color:var(--ink-3)]">
          The image shown for New/Prospect clients. Set it here — applies instantly, no code change (D-31.1-08).
        </p>
        <div className="mt-3 flex items-center gap-3.5">
          <div
            className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-xl border text-[26px]"
            style={{ borderColor: 'var(--border-2, rgba(199,203,247,.22))', background: 'var(--panel-2)' }}
          >
            {prospectImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={prospectImageUrl} alt="Prospect marker" className="h-full w-full rounded-xl object-cover" />
            ) : (
              '🦁'
            )}
          </div>
          <div>
            <label
              className="inline-block cursor-pointer rounded-[10px] border px-3.5 py-2 text-[13px] font-bold text-[color:var(--ink)]"
              style={{ borderColor: 'var(--border-2, rgba(199,203,247,.22))' }}
            >
              {uploading ? 'Uploading…' : 'Upload / replace image'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleImageChange} disabled={uploading} />
            </label>
            <p className="mt-1.5 text-[11.5px] text-[color:var(--ink-3)]">
              PNG, JPG, or WebP · a small square mark works best. {prospectImageUrl ? 'Current: uploaded image.' : 'Current: neutral placeholder.'}
            </p>
          </div>
        </div>
      </div>

      {/* ─── Keeps-warm toggles ─────────────────────────────────────── */}
      <div className="mt-4 rounded-2xl border p-[18px_20px]" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
        <div className="text-[14.5px] font-bold text-[color:var(--ink)]">Keeps a client warm</div>
        <p className="mt-1 text-[12px] text-[color:var(--ink-3)]">
          Active engagement holds health up even without a recent license — so a live lead or deal never reads
          &quot;at risk&quot;.
        </p>
        <div className="mt-2.5">
          <Toggle
            title="Open brief / Crate request in flight"
            subtitle="Live demand won't let health drop below Warning."
            checked={draft.keep_warm_open_brief}
            onChange={v => patchDraft({ keep_warm_open_brief: v })}
          />
          <Toggle
            title="Open deal in flight"
            subtitle="A deal in negotiation won't let health drop below Warning."
            checked={draft.keep_warm_open_deal}
            onChange={v => patchDraft({ keep_warm_open_deal: v })}
          />
          <Toggle
            title="Recent Selects sent"
            subtitle="Selects sent within"
            checked={draft.keep_warm_recent_selects}
            onChange={v => patchDraft({ keep_warm_recent_selects: v })}
            extra={
              <>
                {' '}
                <input
                  type="number"
                  min={1}
                  value={draft.recent_selects_days}
                  onChange={e => patchDraft({ recent_selects_days: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-11 rounded-md border bg-[color:var(--ground)] px-1.5 py-0.5 text-center text-[13px] font-bold text-[color:var(--ink)]"
                  style={{ borderColor: 'var(--border)' }}
                />{' '}
                days holds health up.
              </>
            }
          />
          <Toggle
            title="Recent contact"
            subtitle="A logged touch within"
            checked={draft.keep_warm_recent_contact}
            onChange={v => patchDraft({ keep_warm_recent_contact: v })}
            extra={
              <>
                {' '}
                <input
                  type="number"
                  min={1}
                  value={draft.recent_contact_days}
                  onChange={e => patchDraft({ recent_contact_days: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-11 rounded-md border bg-[color:var(--ground)] px-1.5 py-0.5 text-center text-[13px] font-bold text-[color:var(--ink)]"
                  style={{ borderColor: 'var(--border)' }}
                />{' '}
                days holds health up. (Off by default — contact ≠ a sale.)
              </>
            }
          />
        </div>
      </div>

      {/* ─── Live preview (D-06 — client-side only, no fetch) ─────────── */}
      <div
        className="mt-4 flex flex-wrap items-center gap-3.5 rounded-2xl border p-[14px_18px]"
        style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}
      >
        <span className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--ink-3)]">Right now (sample)</span>
        {(Object.keys(HEALTH_STATE_LABELS) as HealthState[]).map(state => (
          <span key={state} className="inline-flex items-center gap-1.5 text-[14px] font-bold" style={{ color: HEALTH_STATE_TONE[state] }}>
            <span className="h-[9px] w-[9px] rounded-full" style={{ background: HEALTH_STATE_TONE[state] }} />
            {preview[state]} {HEALTH_STATE_LABELS[state]}
          </span>
        ))}
        <span className="ml-auto text-[11.5px] text-[color:var(--ink-3)]">updates live as you adjust — no server round-trip</span>
      </div>

      {/* ─── Save ───────────────────────────────────────────────────── */}
      <div className="mt-[18px] flex flex-wrap items-center gap-3.5">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !orderingOk}
          className="rounded-[11px] px-5 py-2.5 text-[14px] font-extrabold text-white disabled:opacity-50"
          style={{ background: 'var(--grad, linear-gradient(105deg,#818CF8 0%,#D946EF 100%))' }}
        >
          {saving ? 'Saving…' : 'Save rules'}
        </button>
        <span className="text-[12px] text-[color:var(--ink-3)]">
          Applies immediately across My &amp; All Client Partners — health recomputes on next view.
        </span>
      </div>

      {error && <p className="mt-3 text-[13px] font-semibold text-[color:var(--rose-fg,#F9A8C0)]">{error}</p>}
      {savedMessage && !error && <p className="mt-3 text-[13px] font-semibold text-[color:var(--money,#6EE7B7)]">{savedMessage}</p>}
    </div>
  )
}
