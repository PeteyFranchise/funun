'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30'

export function AddTrackForm({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [isrc, setIsrc] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const res = await fetch(`/api/vault/${projectId}/tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), isrc: isrc.trim() || null }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Could not add track')
      setSubmitting(false)
      return
    }

    setTitle('')
    setIsrc('')
    setSubmitting(false)
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 w-full rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm text-white/50 transition hover:border-white/30 hover:text-white"
      >
        + Add track
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3"
    >
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        required
        placeholder="Track title"
        className={inputClass}
      />
      <input
        value={isrc}
        onChange={e => setIsrc(e.target.value)}
        placeholder="ISRC (optional)"
        className={inputClass}
      />
      {error && <p className="text-xs text-rose-300">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
        >
          {submitting ? 'Adding…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          className="text-sm text-white/50 transition hover:text-white"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
