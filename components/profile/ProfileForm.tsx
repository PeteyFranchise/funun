'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ArtistProfile } from '@/types'
import { PRO_VALUES, PRO_LABELS } from '@/lib/metadata/schema'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30'
const labelClass = 'block text-xs font-medium uppercase tracking-wide text-white/40'

const CAREER_STAGES: { value: 1 | 2 | 3 | 4; label: string }[] = [
  { value: 1, label: 'Emerging' },
  { value: 2, label: 'Developing' },
  { value: 3, label: 'Established' },
  { value: 4, label: 'Professional' },
]

type FormState = {
  artist_name: string
  genre: string
  location: string
  bio: string
  instagram_handle: string
  threads_handle: string
  tiktok_handle: string
  spotify_url: string
  career_stage: 1 | 2 | 3 | 4
  monthly_listeners: string
  isrc_country_code: string
  isrc_registrant_code: string
  pro: string
  ipi: string
  publisher: string
  mlc_id: string
  soundexchange_id: string
}

function toForm(p: ArtistProfile): FormState {
  return {
    artist_name: p.artist_name ?? '',
    genre: p.genre ?? '',
    location: p.location ?? '',
    bio: p.bio ?? '',
    instagram_handle: p.instagram_handle ?? '',
    threads_handle: p.threads_handle ?? '',
    tiktok_handle: p.tiktok_handle ?? '',
    spotify_url: p.spotify_url ?? '',
    career_stage: p.career_stage ?? 1,
    monthly_listeners: p.monthly_listeners != null ? String(p.monthly_listeners) : '',
    isrc_country_code: p.isrc_country_code ?? '',
    isrc_registrant_code: p.isrc_registrant_code ?? '',
    pro: p.pro ?? '',
    ipi: p.ipi ?? '',
    publisher: p.publisher ?? '',
    mlc_id: p.mlc_id ?? '',
    soundexchange_id: p.soundexchange_id ?? '',
  }
}

export function ProfileForm({ profile }: { profile: ArtistProfile }) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(toForm(profile))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
    setSaved(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        monthly_listeners: form.monthly_listeners === '' ? null : form.monthly_listeners,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Could not save profile')
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    setSaved(true)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-white">Identity</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Artist name</label>
            <input
              value={form.artist_name}
              onChange={e => set('artist_name', e.target.value)}
              placeholder="Your stage name"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label className={labelClass}>Genre</label>
            <input
              value={form.genre}
              onChange={e => set('genre', e.target.value)}
              placeholder="e.g. R&B"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label className={labelClass}>Location</label>
            <input
              value={form.location}
              onChange={e => set('location', e.target.value)}
              placeholder="City, Country"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Bio</label>
            <textarea
              value={form.bio}
              onChange={e => set('bio', e.target.value)}
              rows={4}
              placeholder="Tell your story"
              className={`mt-1 ${inputClass} resize-none`}
            />
          </div>
          <div>
            <label className={labelClass}>Career stage</label>
            <select
              value={form.career_stage}
              onChange={e => set('career_stage', Number(e.target.value) as 1 | 2 | 3 | 4)}
              className={`mt-1 ${inputClass}`}
            >
              {CAREER_STAGES.map(s => (
                <option key={s.value} value={s.value} className="bg-neutral-900">
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Monthly listeners</label>
            <input
              type="number"
              min={0}
              value={form.monthly_listeners}
              onChange={e => set('monthly_listeners', e.target.value)}
              placeholder="0"
              className={`mt-1 ${inputClass}`}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-white">Links</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Instagram</label>
            <input
              value={form.instagram_handle}
              onChange={e => set('instagram_handle', e.target.value)}
              placeholder="@handle"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label className={labelClass}>Threads</label>
            <input
              value={form.threads_handle}
              onChange={e => set('threads_handle', e.target.value)}
              placeholder="@handle"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label className={labelClass}>TikTok</label>
            <input
              value={form.tiktok_handle}
              onChange={e => set('tiktok_handle', e.target.value)}
              placeholder="@handle"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label className={labelClass}>Spotify URL</label>
            <input
              value={form.spotify_url}
              onChange={e => set('spotify_url', e.target.value)}
              placeholder="https://open.spotify.com/artist/…"
              className={`mt-1 ${inputClass}`}
            />
          </div>
        </div>
      </section>

      {/* ── Rights & Royalties ──────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Rights &amp; Royalties</h2>
          <p className="mt-1 text-xs text-white/40">
            Your rights registry information. Funūn does not collect or pay royalties —
            we organize this data in one place so it flows automatically into your split
            sheets, metadata, and registration checklists, making it easy to communicate
            with the entities that actually collect your royalties: your PRO, The MLC,
            SoundExchange, and others.
          </p>
        </div>

        <div className="rounded-lg border border-lav/20 bg-lav/5 px-4 py-3 text-xs text-white/60 space-y-1">
          <p className="font-semibold text-white/80">Use your legal name for all registry accounts</p>
          <p>
            Your name must appear <span className="text-white/90 font-medium">identically</span> on
            every composition, split sheet, and rights registry. Even minor inconsistencies
            can freeze payments or cause royalties to be sent to the wrong person.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>PRO affiliation</label>
            <select
              value={form.pro}
              onChange={e => set('pro', e.target.value)}
              className={`mt-1 ${inputClass}`}
            >
              <option value="" className="bg-neutral-900">Select PRO (optional)</option>
              {PRO_VALUES.map(v => (
                <option key={v} value={v} className="bg-neutral-900">
                  {PRO_LABELS[v]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>IPI / CAE number</label>
            <input
              value={form.ipi}
              onChange={e => set('ipi', e.target.value)}
              placeholder="00000000000"
              className={`mt-1 ${inputClass}`}
            />
            <p className="mt-1 text-xs text-white/30">Assigned by your PRO when you register.</p>
          </div>

          <div>
            <label className={labelClass}>Publisher</label>
            <input
              value={form.publisher}
              onChange={e => set('publisher', e.target.value)}
              placeholder="Publisher name"
              className={`mt-1 ${inputClass}`}
            />
          </div>

          <div>
            <label className={labelClass}>MLC member ID</label>
            <input
              value={form.mlc_id}
              onChange={e => set('mlc_id', e.target.value)}
              placeholder="MLC-XXXXXXXX"
              className={`mt-1 ${inputClass}`}
            />
            <p className="mt-1 text-xs text-white/30">The MLC collects digital mechanical royalties (US).</p>
          </div>

          <div>
            <label className={labelClass}>SoundExchange ID</label>
            <input
              value={form.soundexchange_id}
              onChange={e => set('soundexchange_id', e.target.value)}
              placeholder="SE-XXXXXXXX"
              className={`mt-1 ${inputClass}`}
            />
            <p className="mt-1 text-xs text-white/30">SoundExchange collects digital performance royalties for recordings.</p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white">ISRC registrant</h2>
          <p className="mt-1 text-xs text-white/40">
            If you hold your own ISRC registrant code, add it here and Funūn can mint
            compliant ISRCs for your tracks automatically. Don't have one? Your distributor
            assigns ISRCs for free — leave this blank. To self-register, apply once at your
            national ISRC agency (US: usisrc.org).
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Country code</label>
            <input
              value={form.isrc_country_code}
              onChange={e => set('isrc_country_code', e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
              placeholder="US"
              maxLength={2}
              className={`mt-1 ${inputClass} uppercase`}
            />
            <p className="mt-1 text-xs text-white/30">2 letters — country of the registrant.</p>
          </div>
          <div>
            <label className={labelClass}>Registrant code</label>
            <input
              value={form.isrc_registrant_code}
              onChange={e => set('isrc_registrant_code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3))}
              placeholder="S1Z"
              maxLength={3}
              className={`mt-1 ${inputClass} uppercase`}
            />
            <p className="mt-1 text-xs text-white/30">3 characters — issued to you by the agency.</p>
          </div>
        </div>
      </section>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
        >
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
        {saved && <span className="text-sm text-emerald-300">Saved</span>}
      </div>
    </form>
  )
}
