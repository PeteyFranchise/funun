'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CollaboratorProfile } from '@/lib/collaborators'
import { PRO_VALUES, PRO_LABELS } from '@/lib/metadata/schema'

// ─── Form style constants (matches EditProjectForm pattern) ───
const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30'
const labelClass = 'block text-xs font-medium uppercase tracking-wide text-white/40'

// ─── CollaboratorForm ─────────────────────────────────────────
// Create/edit modal for a single collaborator.
// Follows the EditProjectForm toggle pattern (D-12):
// - props.initial undefined → create mode
// - props.initial.id present → edit mode (shows delete control)
// mailing_address stored as { raw: string } JSONB for Phase 1 simplicity.

type Props = {
  initial?: Partial<CollaboratorProfile>
  onSaved: (collaborator: CollaboratorProfile) => void
  onCancel: () => void
}

export function CollaboratorForm({ initial, onSaved, onCancel }: Props) {
  const router = useRouter()
  const isEditing = Boolean(initial?.id)

  const [name, setName] = useState(initial?.name ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [pro, setPro] = useState(initial?.pro ?? '')
  const [ipi, setIpi] = useState(initial?.ipi ?? '')
  const [publisher, setPublisher] = useState(initial?.publisher ?? '')
  const [mlcId, setMlcId] = useState(initial?.mlc_id ?? '')
  const [soundexchangeId, setSoundexchangeId] = useState(initial?.soundexchange_id ?? '')
  const [mailingAddress, setMailingAddress] = useState(
    (initial?.mailing_address as { raw?: string } | null)?.raw ?? ''
  )
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const payload = {
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      pro: pro || null,
      ipi: ipi.trim() || null,
      publisher: publisher.trim() || null,
      mlc_id: mlcId.trim() || null,
      soundexchange_id: soundexchangeId.trim() || null,
      mailing_address: mailingAddress.trim() ? { raw: mailingAddress.trim() } : null,
    }

    const url = isEditing
      ? `/api/collaborators/${initial!.id}`
      : '/api/collaborators'
    const method = isEditing ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Could not save changes')
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    router.refresh()
    onSaved(json.data as CollaboratorProfile)
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)

    const res = await fetch(`/api/collaborators/${initial!.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Could not delete collaborator')
      setDeleting(false)
      return
    }

    router.refresh()
    onCancel()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Full legal name — required, full width */}
        <div className="sm:col-span-2">
          <label htmlFor="collab-name" className={labelClass}>
            Full legal name *
          </label>
          <input
            id="collab-name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            placeholder="Jane Smith"
            className={`mt-1 ${inputClass}`}
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="collab-email" className={labelClass}>
            Email
          </label>
          <input
            id="collab-email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="jane@example.com"
            className={`mt-1 ${inputClass}`}
          />
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="collab-phone" className={labelClass}>
            Phone
          </label>
          <input
            id="collab-phone"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+1 555 000 0000"
            className={`mt-1 ${inputClass}`}
          />
        </div>

        {/* PRO affiliation */}
        <div>
          <label htmlFor="collab-pro" className={labelClass}>
            PRO affiliation
          </label>
          <select
            id="collab-pro"
            value={pro}
            onChange={e => setPro(e.target.value)}
            className={`mt-1 ${inputClass}`}
          >
            <option value="" className="bg-neutral-900">
              Select PRO (optional)
            </option>
            {PRO_VALUES.map(v => (
              <option key={v} value={v} className="bg-neutral-900">
                {PRO_LABELS[v]}
              </option>
            ))}
          </select>
        </div>

        {/* IPI/CAE number */}
        <div>
          <label htmlFor="collab-ipi" className={labelClass}>
            IPI / CAE number
          </label>
          <input
            id="collab-ipi"
            value={ipi}
            onChange={e => setIpi(e.target.value)}
            placeholder="00000000000"
            className={`mt-1 ${inputClass}`}
          />
        </div>

        {/* Publisher */}
        <div>
          <label htmlFor="collab-publisher" className={labelClass}>
            Publisher
          </label>
          <input
            id="collab-publisher"
            value={publisher}
            onChange={e => setPublisher(e.target.value)}
            placeholder="Publisher name"
            className={`mt-1 ${inputClass}`}
          />
        </div>

        {/* MLC member ID */}
        <div>
          <label htmlFor="collab-mlc" className={labelClass}>
            MLC member ID
          </label>
          <input
            id="collab-mlc"
            value={mlcId}
            onChange={e => setMlcId(e.target.value)}
            placeholder="MLC-XXXXXXXX"
            className={`mt-1 ${inputClass}`}
          />
        </div>

        {/* SoundExchange ID */}
        <div>
          <label htmlFor="collab-soundexchange" className={labelClass}>
            SoundExchange ID
          </label>
          <input
            id="collab-soundexchange"
            value={soundexchangeId}
            onChange={e => setSoundexchangeId(e.target.value)}
            placeholder="SE-XXXXXXXX"
            className={`mt-1 ${inputClass}`}
          />
        </div>

        {/* Mailing address — single textarea */}
        <div className="sm:col-span-2">
          <label htmlFor="collab-address" className={labelClass}>
            Mailing address (optional)
          </label>
          <textarea
            id="collab-address"
            value={mailingAddress}
            onChange={e => setMailingAddress(e.target.value)}
            rows={2}
            placeholder="123 Main St, City, State 00000, Country"
            className={`mt-1 resize-none ${inputClass}`}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-rose-300">
          Could not save — {error}. Try again or reload the page.
        </p>
      )}

      {/* Action row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Primary save */}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-40"
          >
            {submitting ? 'Saving…' : 'Save collaborator'}
          </button>

          {/* Cancel */}
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-white/50 hover:text-white"
          >
            Cancel
          </button>
        </div>

        {/* Delete (edit mode only) — confirm-delete pattern matching EditProjectForm */}
        {isEditing && (
          <div className="flex items-center gap-2">
            {confirmDelete ? (
              <>
                <span className="text-sm text-white/60">
                  Delete {initial?.name ?? 'this collaborator'}? This can&apos;t be undone.
                </span>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="rounded-lg bg-rose-500/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-40"
                >
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-sm text-white/50 hover:text-white"
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-white/30 transition hover:text-rose-400"
              >
                Delete collaborator
              </button>
            )}
          </div>
        )}
      </div>
    </form>
  )
}
