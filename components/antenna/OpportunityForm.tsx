'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OpportunityType, CompensationType } from '@/types'
import { OPPORTUNITY_TYPE_LABELS } from '@/types'

const TYPES = Object.keys(OPPORTUNITY_TYPE_LABELS) as OpportunityType[]
const COMP_LABELS: Record<CompensationType, string> = {
  paid: 'Paid',
  rev_share: 'Revenue share',
  credit_only: 'Credit only',
  tbd: 'To be discussed',
}

const inputCls =
  'w-full rounded-lg border border-white/15 bg-[#0E0D1E] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none'
const labelCls = 'mb-1.5 block text-sm font-medium text-white/70'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#1A1838] bg-[#0E0D1E] p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

export function OpportunityForm({ demo }: { demo?: boolean }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stages, setStages] = useState<Set<number>>(new Set([1, 2, 3, 4]))
  const [peteExclusive, setPeteExclusive] = useState(false)

  function toggleStage(n: number) {
    setStages(prev => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }

  function numOrNull(v: FormDataEntryValue | null): number | null {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (demo) {
      setError('Posting is disabled in demo mode.')
      return
    }
    const fd = new FormData(e.currentTarget)
    setSaving(true)
    setError(null)

    const payload = {
      title: fd.get('title'),
      type: fd.get('type'),
      description: fd.get('description'),
      genres: fd.get('genres'),
      mood_tags: fd.get('mood_tags'),
      compensation: fd.get('compensation'),
      compensation_type: fd.get('compensation_type') || null,
      platform: fd.get('platform'),
      response_deadline: fd.get('response_deadline') || null,
      slots_available: numOrNull(fd.get('slots_available')) ?? 1,
      min_readiness_score: numOrNull(fd.get('min_readiness_score')) ?? 60,
      min_monthly_listeners: numOrNull(fd.get('min_monthly_listeners')),
      max_monthly_listeners: numOrNull(fd.get('max_monthly_listeners')),
      location_preference: fd.get('location_preference'),
      submission_requirements: fd.get('submission_requirements'),
      career_stages: Array.from(stages),
      exclusive: fd.get('exclusive') === 'on',
      pete_exclusive: peteExclusive,
      pete_note: fd.get('pete_note'),
    }

    const res = await fetch('/api/antenna/opportunities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Could not create opportunity')
      return
    }
    router.push('/opportunities')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Section title="Basics">
        <div>
          <label className={labelCls}>Title</label>
          <input name="title" required className={inputCls} placeholder="e.g. Late-night R&B for a trailer" />
        </div>
        <div>
          <label className={labelCls}>Type</label>
          <select name="type" required className={inputCls} defaultValue="sync">
            {TYPES.map(t => (
              <option key={t} value={t}>
                {OPPORTUNITY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <textarea name="description" rows={4} className={inputCls} placeholder="What you're looking for and what's on offer." />
        </div>
      </Section>

      <Section title="Targeting">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Genres (comma-separated)</label>
            <input name="genres" className={inputCls} placeholder="R&B, Alt R&B" />
          </div>
          <div>
            <label className={labelCls}>Mood tags (comma-separated)</label>
            <input name="mood_tags" className={inputCls} placeholder="late-night, moody" />
          </div>
          <div>
            <label className={labelCls}>Min readiness (0–100)</label>
            <input name="min_readiness_score" type="number" min={0} max={100} defaultValue={60} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Location preference</label>
            <input name="location_preference" className={inputCls} placeholder="Any / US / Atlanta" />
          </div>
          <div>
            <label className={labelCls}>Min monthly listeners</label>
            <input name="min_monthly_listeners" type="number" min={0} className={inputCls} placeholder="optional" />
          </div>
          <div>
            <label className={labelCls}>Max monthly listeners</label>
            <input name="max_monthly_listeners" type="number" min={0} className={inputCls} placeholder="optional" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Career stages</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => toggleStage(n)}
                className={`rounded-lg border px-4 py-2 text-sm transition ${
                  stages.has(n)
                    ? 'border-[#818CF8] bg-[#1A1840] text-white'
                    : 'border-[#1A1838] text-white/50 hover:border-white/25'
                }`}
              >
                Stage {n}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Logistics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Compensation</label>
            <input name="compensation" className={inputCls} placeholder="$3,500 sync fee" />
          </div>
          <div>
            <label className={labelCls}>Compensation type</label>
            <select name="compensation_type" className={inputCls} defaultValue="">
              <option value="">—</option>
              {(Object.keys(COMP_LABELS) as CompensationType[]).map(c => (
                <option key={c} value={c}>
                  {COMP_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Platform</label>
            <input name="platform" className={inputCls} placeholder="Netflix / Spotify / venue" />
          </div>
          <div>
            <label className={labelCls}>Response deadline</label>
            <input name="response_deadline" type="date" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Slots available</label>
            <input name="slots_available" type="number" min={1} defaultValue={1} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Submission requirements</label>
          <textarea name="submission_requirements" rows={3} className={inputCls} placeholder="What applicants should include." />
        </div>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input name="exclusive" type="checkbox" className="h-4 w-4" />
          Limit visibility to Studio / Founding artists
        </label>
      </Section>

      <Section title="Pete's Network">
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            checked={peteExclusive}
            onChange={e => setPeteExclusive(e.target.checked)}
            className="h-4 w-4"
          />
          Mark as a Pete&rsquo;s Network opportunity (gold badge, emails strong matches)
        </label>
        {peteExclusive && (
          <div>
            <label className={labelCls}>Pete&rsquo;s note</label>
            <input name="pete_note" className={inputCls} placeholder="Why this is a vetted, high-signal opportunity." />
          </div>
        )}
      </Section>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
      >
        {saving ? 'Posting…' : 'Post opportunity'}
      </button>
    </form>
  )
}
