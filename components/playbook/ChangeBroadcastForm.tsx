'use client'

import { useState } from 'react'
import type { StaffRole } from '@/lib/admin/staff-role'

const ROLE_LABELS: Record<StaffRole, string> = {
  leadership: 'Leadership', ae: 'Account Executives', bd: 'Business Development', anr: 'A&R',
  it: 'Product, Engineering & IT', legal: 'Rights, Legal & Contract Operations',
  tms: 'Team Member Services', accounting: 'Finance, Accounting & Royalties', marketing: 'Marketing & Community',
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ChangeBroadcastForm({ entryId, entryTitle, roomKey, revision, roles, staff }: {
  entryId: string
  entryTitle: string
  roomKey: string
  revision: number
  roles: StaffRole[]
  staff: Array<{ userId: string; label: string }>
}) {
  const [open, setOpen] = useState(false)
  const [headline, setHeadline] = useState(`${entryTitle} updated`)
  const [changeSummary, setChangeSummary] = useState('')
  const [whyItMatters, setWhyItMatters] = useState('')
  const [actionRequired, setActionRequired] = useState('')
  const [priority, setPriority] = useState<'standard' | 'important' | 'urgent'>('standard')
  const [audienceKind, setAudienceKind] = useState<'all_team' | 'role' | 'user'>('all_team')
  const [targetRole, setTargetRole] = useState<StaffRole | ''>(roles[0] ?? '')
  const [targetUserId, setTargetUserId] = useState(staff[0]?.userId ?? '')
  const [effectiveAt, setEffectiveAt] = useState(today())
  const [readingRequired, setReadingRequired] = useState(false)
  const [readingDueAt, setReadingDueAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function publish() {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/playbook/updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomKey, entryId, expectedRevision: revision, headline, changeSummary, whyItMatters,
          actionRequired: actionRequired.trim() || null, priority, audienceKind,
          targetRole: audienceKind === 'role' ? targetRole : null,
          targetUserId: audienceKind === 'user' ? targetUserId : null,
          effectiveAt: new Date(`${effectiveAt}T12:00:00`).toISOString(), readingRequired,
          readingDueAt: readingDueAt ? new Date(`${readingDueAt}T23:59:59`).toISOString() : null,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not publish this Playbook update')
      setMessage(`Update published to ${payload.data?.recipientCount ?? 0} Team Member${payload.data?.recipientCount === 1 ? '' : 's'}.`)
      setChangeSummary('')
      setWhyItMatters('')
      setActionRequired('')
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not publish this Playbook update')
    } finally {
      setBusy(false)
    }
  }

  return (
    <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className="mt-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)]">
      <summary className="cursor-pointer px-4 py-3 text-[13px] font-bold text-[color:var(--ink)]">Share an internal update for revision {revision}</summary>
      <div className="space-y-3 border-t border-[color:var(--border)] p-4">
        <p className="text-[10.5px] leading-5 text-[color:var(--ink-3)]">Tell the right Funūn Team Members what changed and what it means. This never appears in Member, guest, or Client Partner workspaces.</p>
        <label className="block text-[10px] font-bold uppercase tracking-[.08em] text-[color:var(--ink-3)]">Headline<input value={headline} onChange={event => setHeadline(event.target.value)} maxLength={180} className="mt-1 block w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] normal-case tracking-normal text-[color:var(--ink)]" /></label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-[10px] font-bold uppercase tracking-[.08em] text-[color:var(--ink-3)]">What changed<textarea value={changeSummary} onChange={event => setChangeSummary(event.target.value)} maxLength={2000} rows={4} className="mt-1 block w-full resize-y rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] normal-case tracking-normal text-[color:var(--ink)]" /></label>
          <label className="text-[10px] font-bold uppercase tracking-[.08em] text-[color:var(--ink-3)]">Why it matters<textarea value={whyItMatters} onChange={event => setWhyItMatters(event.target.value)} maxLength={2000} rows={4} className="mt-1 block w-full resize-y rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] normal-case tracking-normal text-[color:var(--ink)]" /></label>
        </div>
        <label className="block text-[10px] font-bold uppercase tracking-[.08em] text-[color:var(--ink-3)]">What should people do? <span className="normal-case font-normal">(optional)</span><textarea value={actionRequired} onChange={event => setActionRequired(event.target.value)} maxLength={2000} rows={3} className="mt-1 block w-full resize-y rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] normal-case tracking-normal text-[color:var(--ink)]" /></label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-[10px] font-bold uppercase tracking-[.08em] text-[color:var(--ink-3)]">Priority<select value={priority} onChange={event => setPriority(event.target.value as typeof priority)} className="mt-1 block w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] normal-case tracking-normal text-[color:var(--ink)]"><option value="standard">Standard</option><option value="important">Important</option><option value="urgent">Urgent</option></select></label>
          <label className="text-[10px] font-bold uppercase tracking-[.08em] text-[color:var(--ink-3)]">Audience<select value={audienceKind} onChange={event => setAudienceKind(event.target.value as typeof audienceKind)} className="mt-1 block w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] normal-case tracking-normal text-[color:var(--ink)]"><option value="all_team">All Team Members with room access</option><option value="role">One team / role</option><option value="user">One Team Member</option></select></label>
          {audienceKind === 'role' ? <label className="text-[10px] font-bold uppercase tracking-[.08em] text-[color:var(--ink-3)]">Team<select value={targetRole} onChange={event => setTargetRole(event.target.value as StaffRole)} className="mt-1 block w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] normal-case tracking-normal text-[color:var(--ink)]">{roles.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label> : audienceKind === 'user' ? <label className="text-[10px] font-bold uppercase tracking-[.08em] text-[color:var(--ink-3)]">Team Member<select value={targetUserId} onChange={event => setTargetUserId(event.target.value)} className="mt-1 block w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] normal-case tracking-normal text-[color:var(--ink)]">{staff.map(person => <option key={person.userId} value={person.userId}>{person.label}</option>)}</select></label> : <div />}
          <label className="text-[10px] font-bold uppercase tracking-[.08em] text-[color:var(--ink-3)]">Effective date<input type="date" value={effectiveAt} onChange={event => setEffectiveAt(event.target.value)} className="mt-1 block w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] normal-case tracking-normal text-[color:var(--ink)]" /></label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[11px] font-bold text-[color:var(--ink-2)]"><input type="checkbox" checked={readingRequired} onChange={event => setReadingRequired(event.target.checked)} /> Require revision-specific reading acknowledgement</label>
          {readingRequired && <label className="flex items-center gap-2 text-[11px] text-[color:var(--ink-2)]">Due <input type="date" value={readingDueAt} onChange={event => setReadingDueAt(event.target.value)} className="rounded-md border border-[color:var(--border)] bg-transparent px-2 py-1" /></label>}
        </div>
        <button type="button" disabled={busy || !headline.trim() || !changeSummary.trim() || !whyItMatters.trim() || !effectiveAt || (readingRequired && !actionRequired.trim()) || (audienceKind === 'role' && !targetRole) || (audienceKind === 'user' && !targetUserId)} onClick={publish} className="rounded-lg px-4 py-2 text-[11px] font-extrabold text-white disabled:opacity-50" style={{ background: 'var(--grad)' }}>{busy ? 'Publishing…' : 'Publish internal update'}</button>
        {message && <p role="status" className="text-[11px] text-[color:var(--ink-2)]">{message}</p>}
      </div>
    </details>
  )
}
