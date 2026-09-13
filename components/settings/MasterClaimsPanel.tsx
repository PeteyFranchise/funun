'use client'

import { useState } from 'react'
import {
  EVIDENCE_DERIVED_MASTER_CAPABILITIES,
  type PresentedMasterOwnershipClaim,
} from '@/lib/workspaces/master-ownership'

export type MasterClaimDocumentOption = {
  id: string
  label: string
}

export function MasterClaimsPanel({
  initialClaims,
  documents,
}: {
  initialClaims: readonly PresentedMasterOwnershipClaim[]
  documents: readonly MasterClaimDocumentOption[]
}) {
  const [claims, setClaims] = useState([...initialClaims])
  const [pending, setPending] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [disputes, setDisputes] = useState<Record<string, string>>({})
  const [documentIds, setDocumentIds] = useState<Record<string, string>>({})

  async function decide(claimId: string, body: Record<string, string>) {
    setPending(claimId)
    setErrors(current => ({ ...current, [claimId]: '' }))
    try {
      const response = await fetch('/api/settings/master-claims', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, ...body }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Claim could not be updated.')
      setClaims(current => current.map(claim => claim.id === claimId ? {
        ...claim,
        state: body.action === 'confirm' ? 'contributor_confirmed' : body.action === 'support' ? 'document_supported' : 'disputed',
        evidenceDocumentId: body.documentId ?? claim.evidenceDocumentId,
        disputeNote: body.note ?? claim.disputeNote,
        access: body.action === 'support'
          ? { enabled: true, capabilities: EVIDENCE_DERIVED_MASTER_CAPABILITIES, cleanMasterDownload: false }
          : claim.access,
      } : claim))
    } catch (cause) {
      setErrors(current => ({ ...current, [claimId]: cause instanceof Error ? cause.message : 'Claim could not be updated.' }))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black text-white">Master-ownership claims</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-lavdim">Review each claim separately. Confirmation records your response; supporting evidence is what unlocks the limited non-master workflow for the Label workspace.</p>
      </div>
      <div className="space-y-4" aria-live="polite">
        {claims.length === 0 ? <div className="rounded-[18px] border border-dashed border-hairstrong bg-card p-8 text-center text-sm text-lavdim">No claims need your review.</div> : claims.map(claim => (
          <article key={claim.id} className="rounded-[18px] border border-hairstrong bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[.1em] text-brandindigo">{claim.workspaceName || 'Label workspace'}</div>
                <h3 className="mt-1 text-lg font-bold text-white">{claim.workTitle || 'Recording version'}</h3>
                <p className="mt-1 text-xs text-lavdim">{claim.versionLabel || claim.workVersionId}</p>
              </div>
              <span className="rounded-full border border-hairstrong px-3 py-1 text-[10px] font-bold uppercase tracking-[.08em] text-lav">{claim.state.replaceAll('_', ' ')}</span>
            </div>
            {claim.note ? <p className="mt-4 rounded-xl bg-white/[.035] p-3 text-sm text-lav">{claim.note}</p> : null}
            {claim.disputeNote ? <p className="mt-4 text-sm text-[#ffb8bd]">Your dispute: {claim.disputeNote}</p> : null}

            {claim.state === 'claimed' ? (
              <div className="mt-5 space-y-3 border-t border-hair pt-4">
                <div className="flex flex-wrap gap-2">
                  <button type="button" aria-busy={pending === claim.id} disabled={pending === claim.id} onClick={() => decide(claim.id, { action: 'confirm' })} className="rounded-xl bg-grad px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Confirm claim</button>
                </div>
                <label className="block text-xs font-semibold text-lav" htmlFor={`dispute-${claim.id}`}>Or explain a conflict</label>
                <textarea id={`dispute-${claim.id}`} value={disputes[claim.id] ?? ''} onChange={event => setDisputes(current => ({ ...current, [claim.id]: event.target.value }))} maxLength={1000} rows={2} className="w-full rounded-xl border border-hairstrong bg-card2 px-3 py-2 text-sm text-white outline-none focus:border-brandindigo" />
                <button type="button" aria-busy={pending === claim.id} disabled={pending === claim.id || !(disputes[claim.id] ?? '').trim()} onClick={() => decide(claim.id, { action: 'dispute', note: disputes[claim.id] ?? '' })} className="rounded-xl border border-[#784044] px-4 py-2 text-sm font-bold text-[#ffb8bd] disabled:opacity-40">Dispute claim</button>
              </div>
            ) : null}

            {claim.state === 'contributor_confirmed' ? (
              <div className="mt-5 border-t border-hair pt-4">
                <label className="block text-xs font-semibold text-lav" htmlFor={`document-${claim.id}`}>Supporting document</label>
                <select id={`document-${claim.id}`} value={documentIds[claim.id] ?? ''} onChange={event => setDocumentIds(current => ({ ...current, [claim.id]: event.target.value }))} className="mt-2 w-full rounded-xl border border-hairstrong bg-card2 px-3 py-2 text-sm text-white">
                  <option value="">Choose a signed or verified project document</option>
                  {documents.map(document => <option key={document.id} value={document.id}>{document.label}</option>)}
                </select>
                <button type="button" aria-busy={pending === claim.id} disabled={pending === claim.id || !documentIds[claim.id]} onClick={() => decide(claim.id, { action: 'support', documentId: documentIds[claim.id] ?? '' })} className="mt-3 rounded-xl bg-grad px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Attach supporting evidence</button>
              </div>
            ) : null}

            {claim.state === 'document_supported' ? <p className="mt-4 text-sm text-[#7ce0ae]">Evidence attached. Clean-master download is still not included.</p> : null}
            {errors[claim.id] ? <p role="alert" className="mt-3 text-sm text-[#ff9da4]">{errors[claim.id]}</p> : null}
          </article>
        ))}
      </div>
    </div>
  )
}
