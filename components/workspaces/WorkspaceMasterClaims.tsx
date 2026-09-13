'use client'

import { useState } from 'react'
import type { PresentedMasterOwnershipClaim } from '@/lib/workspaces/master-ownership'

const STATE_COPY: Record<PresentedMasterOwnershipClaim['state'], string> = {
  claimed: 'Awaiting holder review · grants nothing',
  contributor_confirmed: 'Holder confirmed · supporting document still required',
  document_supported: 'Document-supported · non-master recording access available',
  disputed: 'Disputed · grants nothing',
}

export function WorkspaceMasterClaims({
  workspaceId,
  initialClaims,
}: {
  workspaceId: string
  initialClaims: readonly PresentedMasterOwnershipClaim[]
}) {
  const [claims, setClaims] = useState([...initialClaims])
  const [versionId, setVersionId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/master-claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workVersionId: versionId.trim(), note: note.trim() || undefined }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Claim could not be created.')
      if (payload.data) setClaims(current => [payload.data, ...current])
      setVersionId('')
      setNote('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Claim could not be created.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="flex-1 px-6 py-10">
      <div className="mx-auto max-w-[1180px]">
        <div className="text-[11px] font-bold uppercase tracking-[.2em] text-brandindigo">Recording custody</div>
        <h2 className="mt-2 text-4xl font-black tracking-[-.035em]">Master claims</h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-lavdim">
          File a claim using the recording version ID. The holder reviews it before anything changes, and clean-master download always remains separate.
        </p>

        <form onSubmit={submit} className="mt-8 rounded-[18px] border border-hairstrong bg-card p-5" aria-describedby="master-claim-help">
          <label className="block text-xs font-bold uppercase tracking-[.12em] text-lav" htmlFor="master-version-id">Recording version ID</label>
          <input
            id="master-version-id"
            value={versionId}
            onChange={event => setVersionId(event.target.value)}
            required
            placeholder="Paste the version ID shared by the holder"
            className="mt-2 w-full rounded-xl border border-hairstrong bg-card2 px-4 py-3 text-sm text-white outline-none focus:border-brandindigo"
          />
          <label className="mt-4 block text-xs font-bold uppercase tracking-[.12em] text-lav" htmlFor="master-claim-note">Context (optional)</label>
          <textarea
            id="master-claim-note"
            value={note}
            onChange={event => setNote(event.target.value)}
            maxLength={1000}
            rows={3}
            className="mt-2 w-full rounded-xl border border-hairstrong bg-card2 px-4 py-3 text-sm text-white outline-none focus:border-brandindigo"
          />
          <p id="master-claim-help" className="mt-3 text-xs leading-5 text-lavdim">A filed claim is visible to both sides and grants no access by itself.</p>
          {error ? <p role="alert" className="mt-3 text-sm text-[#ff9da4]">{error}</p> : null}
          <button disabled={saving || !versionId.trim()} className="mt-4 rounded-xl bg-grad px-5 py-3 text-sm font-bold text-white disabled:opacity-40">
            {saving ? 'Filing…' : 'File claim'}
          </button>
        </form>

        <div className="mt-8 space-y-4" aria-live="polite">
          {claims.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-hairstrong bg-card p-8 text-center text-sm text-lavdim">No master-ownership claims yet.</div>
          ) : claims.map(claim => (
            <article key={claim.id} className="rounded-[18px] border border-hairstrong bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-white">{claim.workTitle || 'Recording version'}</h3>
                  <p className="mt-1 text-xs text-lavdim">{claim.versionLabel || claim.workVersionId}</p>
                </div>
                <span className="rounded-full border border-hairstrong px-3 py-1 text-[10px] font-bold uppercase tracking-[.08em] text-lav">{claim.state.replaceAll('_', ' ')}</span>
              </div>
              <p className="mt-4 text-sm text-lav">{STATE_COPY[claim.state]}</p>
              {claim.note ? <p className="mt-3 rounded-xl bg-white/[.035] p-3 text-sm text-lav">{claim.note}</p> : null}
              {claim.disputeNote ? <p className="mt-3 text-sm text-[#ffb8bd]">Holder note: {claim.disputeNote}</p> : null}
              {claim.access.enabled ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {claim.access.capabilities.map(capability => <span key={capability} className="rounded-full bg-[#123126] px-2.5 py-1 text-[10px] font-semibold text-[#7ce0ae]">{capability.replaceAll('_', ' ')}</span>)}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </main>
  )
}
