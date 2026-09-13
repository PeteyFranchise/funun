'use client'

import { useState } from 'react'
import type { WorkspaceRightsProposal } from '@/lib/workspaces/rights-proposals'

type DecisionState = 'idle' | 'busy' | 'confirmed' | 'declined' | 'error'

export function RightsProposalsPanel({ proposals }: { proposals: WorkspaceRightsProposal[] }) {
  const [states, setStates] = useState<Record<string, DecisionState>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = proposals.filter(proposal => proposal.status === 'pending')
  const history = proposals.filter(proposal => proposal.status !== 'pending')

  async function decide(proposalId: string, decision: 'confirmed' | 'declined') {
    setStates(previous => ({ ...previous, [proposalId]: 'busy' }))
    setErrors(previous => ({ ...previous, [proposalId]: '' }))
    try {
      const response = await fetch('/api/settings/rights-proposals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, decision }),
      })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'That decision did not go through.')
      setStates(previous => ({ ...previous, [proposalId]: decision }))
    } catch (error) {
      setStates(previous => ({ ...previous, [proposalId]: 'error' }))
      setErrors(previous => ({
        ...previous,
        [proposalId]: error instanceof Error ? error.message : 'That decision did not go through.',
      }))
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[22px] font-bold text-white">Rights proposals</h2>
        <p className="mt-1 text-sm leading-6 text-white/50">A team can help prepare this information, but only you can place it on your profile. Confirm one field at a time.</p>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-card border border-dashed border-hairstrong bg-card p-8 text-center text-sm text-lavdim">No rights information is waiting for your decision.</div>
      ) : (
        <section aria-labelledby="pending-rights-proposals">
          <h3 id="pending-rights-proposals" className="text-xs font-bold uppercase tracking-[.16em] text-lavdim">Waiting for you</h3>
          <div className="mt-3 space-y-4" aria-live="polite">
            {pending.map(proposal => {
              const state = states[proposal.id] ?? 'idle'
              if (state === 'confirmed' || state === 'declined') {
                return <div key={proposal.id} className="rounded-card border border-hair bg-card p-5 text-sm text-emerald-300">{state === 'confirmed' ? 'Confirmed and added to your rights information.' : 'Declined. Your rights information was not changed.'}</div>
              }
              return (
                <article key={proposal.id} className="rounded-card border border-hairstrong bg-card p-6">
                  <div className="text-xs font-bold uppercase tracking-[.12em] text-brandindigo">{proposal.workspaceName ?? 'A workspace'} proposed</div>
                  <h4 className="mt-2 font-bold text-white">{proposal.fieldLabel}</h4>
                  <div className="mt-3 rounded-xl border border-hair bg-white/[.025] px-4 py-3 font-mono text-sm text-white">{proposal.proposedValue}</div>
                  {proposal.note ? <p className="mt-3 text-sm leading-6 text-lavdim">{proposal.note}</p> : null}
                  <div className="mt-5 flex gap-3">
                    <button type="button" aria-busy={state === 'busy'} disabled={state === 'busy'} onClick={() => void decide(proposal.id, 'confirmed')} className="rounded-lg bg-grad px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Confirm</button>
                    <button type="button" aria-busy={state === 'busy'} disabled={state === 'busy'} onClick={() => void decide(proposal.id, 'declined')} className="px-3 py-2 text-sm font-semibold text-lavdim hover:text-white disabled:opacity-50">Decline</button>
                  </div>
                  {state === 'error' ? <p role="alert" className="mt-3 text-xs text-rose-300">{errors[proposal.id]}</p> : null}
                </article>
              )
            })}
          </div>
        </section>
      )}

      {history.length > 0 ? (
        <details className="rounded-card border border-hair bg-card p-5">
          <summary className="cursor-pointer text-sm font-semibold text-lav">Past decisions ({history.length})</summary>
          <ul className="mt-4 space-y-3 text-sm text-lavdim">
            {history.map(proposal => <li key={proposal.id}>{proposal.fieldLabel} · {proposal.status}</li>)}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
