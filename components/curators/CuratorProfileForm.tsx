'use client'

import { useState } from 'react'
import type { Curator, CuratorPlatform } from '@/types'
import { PLATFORM_VALUES, PLATFORM_LABELS } from '@/lib/curators/schema'

// ─── CuratorProfileForm ───────────────────────────────────────────────
// Claimed-curator self-serve profile edit (D-19, 06-05). Fields are
// strictly limited to CURATOR_SELF_EDITABLE_FIELDS (genre_focus, platform,
// playlist_url, playlist_name, submission_notes) — there is NO input for
// email_valid, flagged_inactive, reach_signal, or claimed_by anywhere in
// this form (absent, not disabled — T-06-06 mass-assignment mitigation,
// UI-SPEC "Curator Portal" section). Input styling matches the pitch
// composer's note textarea.

type FormState = {
  genre_focus: string // comma-separated tag input; split to string[] on save
  platform: CuratorPlatform
  playlist_url: string
  playlist_name: string
  submission_notes: string
}

function curatorToForm(curator: Curator): FormState {
  return {
    genre_focus: curator.genre_focus.join(', '),
    platform: curator.platform,
    playlist_url: curator.playlist_url ?? '',
    playlist_name: curator.playlist_name ?? '',
    submission_notes: curator.submission_notes ?? '',
  }
}

const INPUT_CLASS =
  'w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none'

const LABEL_CLASS = 'mb-1.5 block text-[12px] font-bold uppercase tracking-[.14em] text-lavdim'

export function CuratorProfileForm({ curator }: { curator: Curator }) {
  const [form, setForm] = useState<FormState>(curatorToForm(curator))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function onChange(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setSuccess(null)
  }

  async function onSave() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/curators/${curator.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          genre_focus: form.genre_focus
            .split(',')
            .map(t => t.trim())
            .filter(Boolean),
          platform: form.platform,
          playlist_url: form.playlist_url.trim() || null,
          playlist_name: form.playlist_name.trim() || null,
          submission_notes: form.submission_notes.trim() || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong — please try again.')
        return
      }
      setSuccess('Profile saved.')
    } catch {
      setError('Something went wrong — please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-[18px] border border-hair bg-card p-5">
      <h2 className="text-[15px] font-bold text-white">Your profile</h2>
      {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
      {success && <p className="mt-3 text-xs text-emerald-300">{success}</p>}
      <div className="mt-4 grid gap-4">
        <div>
          <label className={LABEL_CLASS} htmlFor="curator-platform">
            Platform
          </label>
          <select
            id="curator-platform"
            value={form.platform}
            onChange={e => onChange('platform', e.target.value)}
            className={INPUT_CLASS}
          >
            {PLATFORM_VALUES.map(p => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="curator-playlist-name">
            Playlist / channel name
          </label>
          <input
            id="curator-playlist-name"
            value={form.playlist_name}
            onChange={e => onChange('playlist_name', e.target.value)}
            className={INPUT_CLASS}
            placeholder="e.g. Indie Discoveries"
          />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="curator-playlist-url">
            Playlist / channel URL
          </label>
          <input
            id="curator-playlist-url"
            value={form.playlist_url}
            onChange={e => onChange('playlist_url', e.target.value)}
            className={INPUT_CLASS}
            placeholder="https://..."
          />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="curator-genre-focus">
            Genre focus (comma-separated)
          </label>
          <input
            id="curator-genre-focus"
            value={form.genre_focus}
            onChange={e => onChange('genre_focus', e.target.value)}
            className={INPUT_CLASS}
            placeholder="pop, indie, electronic"
          />
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="curator-submission-notes">
            Submission notes
          </label>
          <textarea
            id="curator-submission-notes"
            value={form.submission_notes}
            onChange={e => onChange('submission_notes', e.target.value)}
            rows={4}
            className={`${INPUT_CLASS} resize-none`}
            placeholder="What kind of tracks are you looking for?"
          />
        </div>
      </div>
      <div className="mt-5">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-grad px-5 py-3 text-[15px] font-bold text-white shadow-cta transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
