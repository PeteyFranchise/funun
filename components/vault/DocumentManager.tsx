'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const DOC_TYPES: { value: string; label: string }[] = [
  { value: 'split_sheet', label: 'Split sheet' },
  { value: 'copyright_registration', label: 'Copyright registration' },
  { value: 'hire_right', label: 'Work-for-hire / rights' },
  { value: 'sample_clearance', label: 'Sample clearance' },
  { value: 'distribution_agreement', label: 'Distribution agreement' },
]
const DOC_STATUSES = ['pending', 'signed', 'verified'] as const

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  DOC_TYPES.map(t => [t.value, t.label])
)

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30'

type Doc = { id: string; type: string; status: string }

export function DocumentManager({
  projectId,
  documents,
}: {
  projectId: string
  documents: Doc[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [newType, setNewType] = useState(DOC_TYPES[0].value)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function addDocument() {
    setAdding(true)
    setError(null)
    const res = await fetch(`/api/vault/${projectId}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: newType, status: 'pending' }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Could not add document')
      setAdding(false)
      return
    }
    setAdding(false)
    setOpen(false)
    router.refresh()
  }

  async function changeStatus(docId: string, status: string) {
    setBusyId(docId)
    setError(null)
    const res = await fetch(`/api/vault/${projectId}/documents/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Could not update status')
    }
    setBusyId(null)
    router.refresh()
  }

  async function removeDocument(docId: string) {
    setBusyId(docId)
    setError(null)
    const res = await fetch(`/api/vault/${projectId}/documents/${docId}`, { method: 'DELETE' })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Could not delete document')
    }
    setBusyId(null)
    router.refresh()
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-white">
        Documents <span className="text-white/40">{documents.length}</span>
      </h3>

      {documents.length === 0 ? (
        <p className="mt-2 text-xs text-white/40">No documents yet.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {documents.map(d => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate text-white/80">
                {TYPE_LABEL[d.type] ?? d.type.replace(/_/g, ' ')}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <select
                  value={d.status}
                  disabled={busyId === d.id}
                  onChange={e => changeStatus(d.id, e.target.value)}
                  className={`rounded-md border px-1.5 py-0.5 text-xs outline-none ${
                    d.status === 'signed' || d.status === 'verified'
                      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                      : 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                  }`}
                >
                  {DOC_STATUSES.map(s => (
                    <option key={s} value={s} className="bg-neutral-900 text-white">
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeDocument(d.id)}
                  disabled={busyId === d.id}
                  aria-label="Remove document"
                  className="text-white/30 transition hover:text-rose-300 disabled:opacity-40"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}

      {open ? (
        <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <select value={newType} onChange={e => setNewType(e.target.value)} className={inputClass}>
            {DOC_TYPES.map(t => (
              <option key={t.value} value={t.value} className="bg-neutral-900">
                {t.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addDocument}
              disabled={adding}
              className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {adding ? 'Adding…' : 'Add'}
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
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-2 w-full rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm text-white/50 transition hover:border-white/30 hover:text-white"
        >
          + Add document
        </button>
      )}
    </div>
  )
}
