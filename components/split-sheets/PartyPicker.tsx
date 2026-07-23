'use client'

import { useEffect, useRef, useState } from 'react'
import type { CollaboratorProfile } from '@/lib/collaborators'
import { assembleDisplayName } from '@/lib/collaborators'
import { PRO_LABELS, PRO_VALUES } from '@/lib/metadata/schema'

// ─── PartyPicker ──────────────────────────────────────────────────────
// A NEW, standalone component for the split-sheet fast-add flow
// (deliberation §4/§6, locked decision 2). Deliberately does NOT import
// from, extend, or edit components/collaborators/CollaboratorPicker.tsx —
// that component has a third caller (MetadataStudio's ComposerEditor) with
// zero automated test coverage (research Pitfall 2); leaving it untouched
// is the regression guarantee. PartyPicker owns its own roster fetch
// (GET /api/collaborators) and outside-click handling — the small
// duplication with CollaboratorPicker is deliberate and buys
// zero-regression on the shared component.
//
// Two ways to add a party:
//   - Pick an existing roster collaborator → onSelect({ kind: 'full', ... }).
//   - Fast-add by email or phone alone (name/legal name NOT required) →
//     POST /api/collaborators with status: 'pending' and a placeholder
//     `name` (the email, or phone when there is no email — distinct from
//     legal_name, which stays empty until supplied later) →
//     onSelect({ kind: 'fastAdd', ... }).
//
// The dropdown panel is deliberately WIDER than CollaboratorPicker's
// confirmed-broken max-w-[320px] popup (18-CONTEXT) — this is a fresh
// component, so that regression is not reproduced here.

export type PartyPickerSelection =
  | { kind: 'full'; collaborator: CollaboratorProfile }
  | { kind: 'fastAdd'; collaborator: CollaboratorProfile }

type Props = {
  onSelect: (selection: PartyPickerSelection) => void
}

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30'
const labelClass = 'block text-xs font-medium uppercase tracking-wide text-white/40'

export function PartyPicker({ onSelect }: Props) {
  const [roster, setRoster] = useState<CollaboratorProfile[]>([])
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch roster on mount — same source as CollaboratorPicker, a separate
  // fetch by design (research Pitfall 2 / Architecture Patterns §1 option b).
  useEffect(() => {
    fetch('/api/collaborators')
      .then(r => r.json())
      .then(json => {
        if (Array.isArray(json.data)) setRoster(json.data)
      })
      .catch(() => {
        // non-blocking — picker degrades to fast-add-only
      })
  }, [])

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
        setAddingNew(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const active = roster.filter(c => !c.archived_at)
  const searchQuery = search.toLowerCase()
  const filtered = active.filter(c => assembleDisplayName(c).toLowerCase().includes(searchQuery))

  function handlePick(collab: CollaboratorProfile) {
    onSelect({ kind: 'full', collaborator: collab })
    setOpen(false)
    setSearch('')
    setAddingNew(false)
  }

  function handleFastAdded(collab: CollaboratorProfile) {
    setRoster(prev => [...prev, collab])
    onSelect({ kind: 'fastAdd', collaborator: collab })
    setOpen(false)
    setAddingNew(false)
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => {
          setOpen(prev => !prev)
          if (!open) setAddingNew(active.length === 0)
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm text-white/50 transition hover:border-white/30 hover:text-white/70"
      >
        <span className="text-base leading-none">+</span> Add party
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-[360px] max-w-[92vw] rounded-xl border border-hairstrong bg-card shadow-xl"
          role={addingNew ? undefined : 'listbox'}
        >
          {addingNew ? (
            <FastAddForm
              onSaved={handleFastAdded}
              onCancel={() => {
                setAddingNew(false)
                if (active.length === 0) setOpen(false)
              }}
            />
          ) : (
            <>
              <div className="p-2">
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search collaborators…"
                  className={inputClass}
                />
              </div>

              <ul className="max-h-64 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <li className="px-4 py-2 text-sm text-white/30">No results</li>
                ) : (
                  filtered.map(collab => (
                    <PartyPickerItem key={collab.id} collab={collab} onSelect={handlePick} />
                  ))
                )}
              </ul>

              <div className="border-t border-hair">
                <button
                  type="button"
                  onClick={() => setAddingNew(true)}
                  className="w-full px-4 py-2 text-left text-sm font-medium text-brandindigo hover:bg-white/5"
                >
                  + Fast-add a new collaborator
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── PartyPickerItem ─────────────────────────────────────────────────
function PartyPickerItem({
  collab,
  onSelect,
}: {
  collab: CollaboratorProfile
  onSelect: (c: CollaboratorProfile) => void
}) {
  const proLabel =
    collab.pro && collab.pro !== 'none'
      ? (PRO_LABELS[collab.pro as keyof typeof PRO_LABELS] ?? collab.pro)
      : 'No PRO'
  // pending/confirmed badge (deliberation §6) — pending when
  // collaborators.status is 'pending', confirmed otherwise (DB DEFAULT).
  const isPending = collab.status === 'pending'
  return (
    <li role="option" aria-selected={false}>
      <button
        type="button"
        onClick={() => onSelect(collab)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left hover:bg-white/5"
      >
        <span>
          <span className="block text-sm text-white">{assembleDisplayName(collab)}</span>
          <span className="block text-xs text-lavdim">{proLabel}</span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            isPending
              ? 'bg-amber-400/10 text-amber-300'
              : 'bg-emerald-400/10 text-emerald-300'
          }`}
        >
          {isPending ? 'Pending' : 'Confirmed'}
        </span>
      </button>
    </li>
  )
}

// ─── FastAddForm ─────────────────────────────────────────────────────
// The email/phone-only fast-add sub-form (§4). Only email or phone is
// required — NOT a legal name, NOT even a display name (a placeholder is
// derived server-side... actually here, client-side, since the name field
// itself is required by POST /api/collaborators; see comment below).
// "Advanced information" (legal name, PRO, IPI, publishing designee,
// administrator) is collapsed by default (§4).
function FastAddForm({
  onSaved,
  onCancel,
}: {
  onSaved: (collab: CollaboratorProfile) => void
  onCancel: () => void
}) {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [legalName, setLegalName] = useState('')
  const [pro, setPro] = useState('')
  const [ipi, setIpi] = useState('')
  const [publisher, setPublisher] = useState('')
  const [administrator, setAdministrator] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedEmail = email.trim()
    const trimmedPhone = phone.trim()

    if (!trimmedEmail && !trimmedPhone) {
      setError('Enter an email or phone number.')
      return
    }

    setSubmitting(true)
    setError(null)

    // The placeholder `name` (DB NOT NULL) is the email, or phone when
    // there is no email — distinct from legal_name, which stays empty
    // until the initiator or the party themselves supplies it
    // (research Pitfall 3, T-18-01c).
    const payload = {
      name: trimmedEmail || trimmedPhone,
      email: trimmedEmail || null,
      phone: trimmedPhone || null,
      legal_name: legalName.trim() || null,
      pro: pro || null,
      ipi: ipi.trim() || null,
      publisher: publisher.trim() || null,
      administrator: administrator.trim() || null,
      status: 'pending',
    }

    try {
      const res = await fetch('/api/collaborators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Could not add collaborator')
        setSubmitting(false)
        return
      }
      onSaved(json.data as CollaboratorProfile)
    } catch {
      setError('An unexpected error occurred. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4">
      <p className="text-xs text-white/40">
        Just their email or phone — they&rsquo;ll fill in the rest, or you can add it now.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="jane@example.com"
            className={`mt-1 ${inputClass}`}
          />
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+1 555 000 0000"
            className={`mt-1 ${inputClass}`}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced(prev => !prev)}
        className="text-xs font-medium text-brandindigo hover:text-white"
      >
        {showAdvanced ? '– Hide advanced information' : '+ Advanced information'}
      </button>

      {showAdvanced && (
        <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div>
            <label className={labelClass}>Legal name</label>
            <input
              value={legalName}
              onChange={e => setLegalName(e.target.value)}
              placeholder="Full legal name, as registered with PRO"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className={labelClass}>PRO</label>
              <select value={pro} onChange={e => setPro(e.target.value)} className={`mt-1 ${inputClass}`}>
                <option value="" className="bg-[#0a0a0f]">
                  Select PRO (optional)
                </option>
                {PRO_VALUES.map(v => (
                  <option key={v} value={v} className="bg-[#0a0a0f]">
                    {PRO_LABELS[v]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>IPI #</label>
              <input
                value={ipi}
                onChange={e => setIpi(e.target.value)}
                placeholder="IPI #"
                className={`mt-1 ${inputClass}`}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Publishing designee</label>
              <input
                value={publisher}
                onChange={e => setPublisher(e.target.value)}
                placeholder="Publisher name, or None"
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label className={labelClass}>Administrator</label>
              <input
                value={administrator}
                onChange={e => setAdministrator(e.target.value)}
                placeholder="Publishing administrator, or None"
                className={`mt-1 ${inputClass}`}
              />
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-40"
        >
          {submitting ? 'Adding…' : 'Add party'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-white/50 hover:text-white">
          Cancel
        </button>
      </div>
    </form>
  )
}
