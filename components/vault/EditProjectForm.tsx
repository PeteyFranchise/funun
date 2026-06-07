'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { VaultProjectStatus, VaultProjectType } from '@/types'
import { VAULT_PROJECT_TYPE_LABELS } from '@/types'

const TYPES: VaultProjectType[] = ['single', 'snippet', 'ep', 'album', 'unreleased']
const STATUSES: { value: VaultProjectStatus; label: string }[] = [
  { value: 'in_progress', label: 'In progress' },
  { value: 'vault_ready', label: 'Vault ready' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'released', label: 'Released' },
  { value: 'archived', label: 'Archived' },
  { value: 'shelved', label: 'Shelved' },
]

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30'
const labelClass = 'block text-xs font-medium uppercase tracking-wide text-white/40'

export type EditProjectInitial = {
  title: string
  type: VaultProjectType
  status: VaultProjectStatus
  genre: string | null
  sub_genre: string | null
  release_date: string | null
  notes: string | null
}

export function EditProjectForm({
  projectId,
  initial,
}: {
  projectId: string
  initial: EditProjectInitial
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(initial.title)
  const [type, setType] = useState<VaultProjectType>(initial.type)
  const [status, setStatus] = useState<VaultProjectStatus>(initial.status)
  const [genre, setGenre] = useState(initial.genre ?? '')
  const [subGenre, setSubGenre] = useState(initial.sub_genre ?? '')
  const [releaseDate, setReleaseDate] = useState(initial.release_date ?? '')
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setTitle(initial.title)
    setType(initial.type)
    setStatus(initial.status)
    setGenre(initial.genre ?? '')
    setSubGenre(initial.sub_genre ?? '')
    setReleaseDate(initial.release_date ?? '')
    setNotes(initial.notes ?? '')
    setError(null)
    setConfirmDelete(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const res = await fetch(`/api/vault/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        type,
        status,
        genre: genre.trim() || null,
        sub_genre: subGenre.trim() || null,
        release_date: releaseDate || null,
        notes: notes.trim() || null,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Could not save changes')
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    setOpen(false)
    router.refresh()
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)

    const res = await fetch(`/api/vault/${projectId}`, { method: 'DELETE' })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Could not delete project')
      setDeleting(false)
      return
    }

    router.push('/vault')
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
      >
        Edit project
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass}>Title</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            className={`mt-1 ${inputClass}`}
          />
        </div>

        <div className="sm:col-span-2">
          <span className={labelClass}>Type</span>
          <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {TYPES.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-lg border px-2 py-1.5 text-xs transition ${
                  type === t
                    ? 'border-white bg-white text-black'
                    : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30'
                }`}
              >
                {VAULT_PROJECT_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass}>Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as VaultProjectStatus)}
            className={`mt-1 ${inputClass}`}
          >
            {STATUSES.map(s => (
              <option key={s.value} value={s.value} className="bg-neutral-900">
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Release date</label>
          <input
            type="date"
            value={releaseDate}
            onChange={e => setReleaseDate(e.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </div>

        <div>
          <label className={labelClass}>Genre</label>
          <input
            value={genre}
            onChange={e => setGenre(e.target.value)}
            placeholder="e.g. R&B"
            className={`mt-1 ${inputClass}`}
          />
        </div>

        <div>
          <label className={labelClass}>Sub-genre</label>
          <input
            value={subGenre}
            onChange={e => setSubGenre(e.target.value)}
            placeholder="optional"
            className={`mt-1 ${inputClass}`}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass}>Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Private notes about this project"
            className={`mt-1 ${inputClass} resize-none`}
          />
        </div>
      </div>

      {error && <p className="text-xs text-rose-300">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              reset()
            }}
            className="text-sm text-white/50 transition hover:text-white"
          >
            Cancel
          </button>
        </div>

        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/60">Delete this project?</span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg bg-rose-500/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-40"
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-white/50 transition hover:text-white"
            >
              Keep
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-rose-300/80 transition hover:text-rose-300"
          >
            Delete project
          </button>
        )}
      </div>
    </form>
  )
}
