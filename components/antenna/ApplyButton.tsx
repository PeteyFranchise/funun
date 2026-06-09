'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ApplyButton({
  opportunityId,
  projectId,
  projectTitle,
  alreadyApplied,
  disabled,
  demo,
}: {
  opportunityId: string
  projectId: string
  projectTitle: string
  alreadyApplied?: boolean
  disabled?: boolean
  demo?: boolean
}) {
  const router = useRouter()
  const [applied, setApplied] = useState(Boolean(alreadyApplied))
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function apply() {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/antenna/opportunities/${opportunityId}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, note }),
    })
    setLoading(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Could not apply')
      return
    }
    setApplied(true)
    router.refresh()
  }

  if (applied) {
    return (
      <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
        Applied with <span className="font-medium">{projectTitle}</span>. The contact has been
        notified and your vault package was shared.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={3}
        placeholder={`Add a short note for the contact (optional) — pitching ${projectTitle}`}
        className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
      />
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <button
        onClick={apply}
        disabled={loading || disabled || demo}
        className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
      >
        {demo
          ? 'Applying is disabled in demo'
          : loading
            ? 'Applying…'
            : `Apply with ${projectTitle}`}
      </button>
    </div>
  )
}
