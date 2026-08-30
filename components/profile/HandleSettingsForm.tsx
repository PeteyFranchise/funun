'use client'

// ── Handle settings (D-07/D-08 entry point) ─────────────────────────────
// Its own <form>, its own endpoint, its own request — always, same reasoning
// as PrivacySettingsForm.tsx's header comment. A handle change is a
// deliberate act with a permanent consequence (D-08: the retired handle is
// gone forever, even to its own former owner), so it must never ride a
// save-on-tab-switch autosave and must never be folded into the generic
// /api/profile PATCH body.
//
// Deliberately NOT wired into useSettingsForm()/SettingsFormProvider — this
// component owns its own local state and issues its own fetch to
// PATCH /api/profile/handle, independent of the rights/profile tab-save
// machinery those hooks coordinate.
//
// The server is the authority on availability (D-14): this component never
// invents a client-side "that's taken" verdict, it only renders the
// server's response message verbatim on a non-OK PATCH.

import { useState } from 'react'
import { inputClass, labelClass } from '@/lib/profile/settings-form'
import { handleChangeSubmitState } from '@/lib/handles/change-form'

export function HandleSettingsForm({ currentHandle }: { currentHandle: string | null }) {
  const [value, setValue] = useState(currentHandle ?? '')
  const [handle, setHandle] = useState(currentHandle)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    const decision = handleChangeSubmitState({ current: handle, next: value })

    if (decision.kind === 'invalid') {
      setError(decision.message)
      return
    }
    if (decision.kind === 'unchanged') {
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/profile/handle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: decision.handle }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body.error === 'string' ? body.error : 'Something went wrong. Try again.')
        return
      }
      setHandle(body.data.handle as string)
      setValue(body.data.handle as string)
      setSaved(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border-t border-white/10 mt-8 pt-8">
        <h2 className="text-lg font-semibold text-white">Handle</h2>
        <p className="text-sm text-lavdim mt-1">
          Your @handle is your profile URL and your public identity on Funūn.
        </p>
      </div>

      <div className="space-y-2">
        <label className={labelClass}>@handle</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/40">@</span>
          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            className={inputClass}
            placeholder="your-handle"
          />
        </div>
        <p className="text-xs text-white/40">
          Changing your handle changes your profile URL. Your old link will redirect, but the
          handle you leave behind can never be used again — by you or anyone else.
        </p>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
        >
          {submitting ? 'Saving…' : 'Save handle'}
        </button>
        {saved && <span className="text-sm text-emerald-300">Saved</span>}
      </div>
    </form>
  )
}
