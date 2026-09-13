'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { WorkspaceAccessState } from '@/lib/workspaces/access-kill-switch'

export type WorkspaceCohortCard = {
  id: string
  accountUserId: string
  label: string
  handle: string | null
  enabled: boolean
  startsAt: string
  endsAt: string | null
}

export type WorkspaceRolloutAccount = { id: string; label: string }

export function WorkspaceRolloutConsole({
  accessState,
  cohortRequired,
  pilotDeclared,
  cohort,
  accounts,
  billingCounts,
}: {
  accessState: WorkspaceAccessState
  cohortRequired: boolean
  pilotDeclared: boolean
  cohort: WorkspaceCohortCard[]
  accounts: WorkspaceRolloutAccount[]
  billingCounts: Record<string, number>
}) {
  const router = useRouter()
  const [accountUserId, setAccountUserId] = useState(accounts[0]?.id ?? '')
  const [endsAt, setEndsAt] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function mutate(url: string, body: Record<string, unknown>, key: string) {
    setBusy(key)
    setMessage(null)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'The change could not be saved.')
      setMessage('Saved. The control is active now.')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The change could not be saved.')
    } finally {
      setBusy(null)
    }
  }

  function togglePlatform() {
    const enabled = !accessState.enabled
    if (!enabled && !reason.trim()) {
      setMessage('Add an incident or operational reason before disabling workspace access.')
      return
    }
    if (!window.confirm(enabled
      ? 'Re-enable workspace access for eligible accounts?'
      : 'Disable workspace access platform-wide? Personal Member catalogues remain available.')) return
    void mutate('/api/admin/workspaces/access', { enabled, reason: reason.trim() || undefined }, 'platform')
  }

  return (
    <div className="mt-6 space-y-5">
      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--ink-3)]">Platform control</p>
            <h2 className="mt-1 text-lg font-bold">Workspace access is {accessState.enabled ? 'on' : 'off'}</h2>
            <p className="mt-1 max-w-2xl text-sm text-[color:var(--ink-3)]">
              The database kill switch remains authoritative. Turning it off never disables a Member's personal catalogue.
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${accessState.enabled ? 'border-emerald-500/30 text-emerald-400' : 'border-red-500/30 text-red-400'}`}>
            {accessState.enabled ? 'Enabled' : 'Emergency stop active'}
          </span>
        </div>
        {!accessState.enabled && accessState.disabledReason && (
          <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">Reason: {accessState.disabledReason}</p>
        )}
        <label className="mt-4 block text-xs font-semibold text-[color:var(--ink-2)]">
          Reason required to disable
          <input value={reason} onChange={event => setReason(event.target.value)} maxLength={500} className="mt-2 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--ground)] px-3 py-2 text-sm" placeholder="Incident or operational reason" />
        </label>
        <button type="button" onClick={togglePlatform} disabled={busy !== null} className={`mt-3 rounded-lg px-4 py-2 text-sm font-bold ${accessState.enabled ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/15 text-emerald-300'} disabled:opacity-50`}>
          {busy === 'platform' ? 'Saving…' : accessState.enabled ? 'Activate emergency stop' : 'Restore workspace access'}
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatusCard label="Rollout boundary" value={cohortRequired ? 'Pilot cohort required' : 'General Member access'} />
        <StatusCard label="Pilot environment" value={pilotDeclared ? 'Declared active' : 'Not declared'} />
        <StatusCard label="Active pilot records" value={String(cohort.filter(row => row.enabled).length)} />
      </section>

      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
        <h2 className="text-lg font-bold">Workspace billing posture</h2>
        <p className="mt-1 text-sm text-[color:var(--ink-3)]">
          Operational counts only. Billing status never changes personal Member ownership or catalogue access.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Object.entries(billingCounts).map(([status, count]) => (
            <StatusCard key={status} label={status.replaceAll('_', ' ')} value={String(count)} />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
        <h2 className="text-lg font-bold">Pilot cohort</h2>
        <p className="mt-1 text-sm text-[color:var(--ink-3)]">Only Leadership can see or change this list. Accounts outside the cohort continue receiving a 404.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px_auto]">
          <select value={accountUserId} onChange={event => setAccountUserId(event.target.value)} className="rounded-lg border border-[color:var(--border)] bg-[color:var(--ground)] px-3 py-2 text-sm" aria-label="Member account">
            {accounts.map(account => <option key={account.id} value={account.id}>{account.label}</option>)}
          </select>
          <input type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} className="rounded-lg border border-[color:var(--border)] bg-[color:var(--ground)] px-3 py-2 text-sm" aria-label="Optional pilot end time" />
          <button type="button" disabled={!accountUserId || busy !== null} onClick={() => void mutate('/api/admin/workspaces/cohorts', { action: 'add', accountUserId, endsAt: endsAt ? new Date(endsAt).toISOString() : null }, 'add')} className="rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy === 'add' ? 'Adding…' : 'Add to pilot'}</button>
        </div>
        <div className="mt-5 divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]">
          {cohort.length === 0 ? <p className="py-5 text-sm text-[color:var(--ink-3)]">No pilot cohort records yet.</p> : cohort.map(row => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-semibold">{row.label}</p>
                <p className="mt-1 text-xs text-[color:var(--ink-3)]">{row.handle ? `@${row.handle} · ` : ''}{row.enabled ? 'Eligible' : 'Disabled'} · starts {new Date(row.startsAt).toLocaleDateString()}{row.endsAt ? ` · ends ${new Date(row.endsAt).toLocaleDateString()}` : ''}</p>
              </div>
              <button type="button" disabled={busy !== null} onClick={() => void mutate('/api/admin/workspaces/cohorts', { action: 'set_enabled', cohortId: row.id, enabled: !row.enabled }, row.id)} className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-xs font-bold disabled:opacity-50">{busy === row.id ? 'Saving…' : row.enabled ? 'Disable' : 'Re-enable'}</button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
        <h2 className="text-lg font-bold">Workspace billing posture</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Object.entries(billingCounts).map(([status, count]) => <StatusCard key={status} label={status.replaceAll('_', ' ')} value={String(count)} />)}
        </div>
      </section>

      {message && <p className="text-sm text-[color:var(--ink-2)]" role="status" aria-live="polite">{message}</p>}
    </div>
  )
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[color:var(--ink-3)]">{label}</p><p className="mt-2 text-base font-bold capitalize">{value}</p></div>
}
