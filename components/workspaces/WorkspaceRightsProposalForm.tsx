'use client'

import { useState } from 'react'
import {
  WORKSPACE_RIGHTS_FIELD_LABELS,
  WORKSPACE_RIGHTS_FIELD_VALUES,
  type WorkspaceRightsField,
} from '@/lib/workspaces/rights-proposals'

export function WorkspaceRightsProposalForm({
  workspaceId,
  relationshipId,
}: {
  workspaceId: string
  relationshipId: string
}) {
  const [open, setOpen] = useState(false)
  const [field, setField] = useState<WorkspaceRightsField>('pro')
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/rights-proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relationshipId, field, proposedValue: value, note: note || null }),
      })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Proposal could not be sent.')
      setValue('')
      setNote('')
      setMessage('Sent for Member confirmation.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Proposal could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return <button type="button" aria-expanded="false" onClick={() => setOpen(true)} className="mt-4 text-xs font-semibold text-brandindigo hover:text-white">Propose rights information</button>
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl border border-hair bg-white/[.025] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-bold uppercase tracking-[.12em] text-lav">Member confirmation required</div>
        <button type="button" aria-label="Close rights proposal form" onClick={() => setOpen(false)} className="text-xs text-lavdim hover:text-white">Close</button>
      </div>
      <label htmlFor={`rights-field-${relationshipId}`} className="block text-xs text-lavdim">Field</label>
        <select id={`rights-field-${relationshipId}`} value={field} onChange={event => setField(event.target.value as WorkspaceRightsField)} className="w-full rounded-lg border border-hairstrong bg-card px-3 py-2 text-sm text-white">
          {WORKSPACE_RIGHTS_FIELD_VALUES.map(option => <option key={option} value={option}>{WORKSPACE_RIGHTS_FIELD_LABELS[option]}</option>)}
        </select>
      <label htmlFor={`rights-value-${relationshipId}`} className="block text-xs text-lavdim">Proposed value</label>
        <input id={`rights-value-${relationshipId}`} required maxLength={300} value={value} onChange={event => setValue(event.target.value)} className="w-full rounded-lg border border-hairstrong bg-card px-3 py-2 text-sm text-white" />
      <label htmlFor={`rights-note-${relationshipId}`} className="block text-xs text-lavdim">Context (optional)</label>
        <textarea id={`rights-note-${relationshipId}`} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} className="min-h-20 w-full rounded-lg border border-hairstrong bg-card px-3 py-2 text-sm text-white" />
      <button disabled={busy} aria-busy={busy} className="rounded-lg bg-grad px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send proposal'}</button>
      {message ? <p role="status" aria-live="polite" className="text-xs text-lavdim">{message}</p> : null}
    </form>
  )
}
