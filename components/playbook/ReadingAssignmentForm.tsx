'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { StaffRole } from '@/lib/admin/staff-role'

const ROLE_LABELS: Record<StaffRole, string> = {
  leadership: 'Leadership', ae: 'Account Executives', bd: 'Business Development', anr: 'A&R',
  it: 'Product, Engineering & IT', legal: 'Rights, Legal & Contract Operations',
  tms: 'Team Member Services', accounting: 'Finance, Accounting & Royalties', marketing: 'Marketing & Community',
}

type AssignmentRow = { id: string; audienceLabel: string; dueAt: string | null; required: boolean; requiredRevision: number }
type RosterRow = {
  userId: string; label: string; state: 'complete' | 'overdue' | 'due' | 'optional' | 'retired'
  sourceLabels: string[]; requiredRevision: number; acknowledgedRevision: number | null
  acknowledgedAt: string | null; dueAt: string | null
}

function dateValue(value: string | null): string {
  return value ? value.slice(0, 10) : ''
}

function AssignmentEditor({ assignment, roomKey }: { assignment: AssignmentRow; roomKey: string }) {
  const router = useRouter()
  const [required, setRequired] = useState(assignment.required)
  const [dueAt, setDueAt] = useState(dateValue(assignment.dueAt))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function mutate(method: 'PATCH' | 'DELETE') {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/playbook/assignments/${assignment.id}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(method === 'PATCH'
          ? { roomKey, required, dueAt: dueAt ? new Date(`${dueAt}T23:59:59`).toISOString() : null }
          : { roomKey }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not update assignment')
      setMessage(method === 'DELETE' ? 'Assignment revoked.' : 'Assignment updated.')
      router.refresh()
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not update assignment')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-[11px] font-extrabold text-[color:var(--ink)]">{assignment.audienceLabel} · revision {assignment.requiredRevision}</p>
        <label className="flex items-center gap-1.5 text-[10.5px] font-bold text-[color:var(--ink-2)]">
          <input type="checkbox" checked={required} onChange={event => setRequired(event.target.checked)} /> Required
        </label>
        <input aria-label={`Due date for ${assignment.audienceLabel}`} type="date" value={dueAt} onChange={event => setDueAt(event.target.value)} className="rounded-md border border-[color:var(--border)] bg-transparent px-2 py-1 text-[10.5px]" />
        <button type="button" disabled={busy} onClick={() => mutate('PATCH')} className="text-[10.5px] font-bold text-[color:var(--indigo)] disabled:opacity-50">Save</button>
        <button type="button" disabled={busy} onClick={() => mutate('DELETE')} className="text-[10.5px] font-bold text-[#fca5a5] disabled:opacity-50">Revoke</button>
      </div>
      {message && <p role="status" className="mt-1 text-[10px] text-[color:var(--ink-3)]">{message}</p>}
    </div>
  )
}

export function ReadingAssignmentForm({
  entryId, roomKey, roomHref, staff, roles, hasAssignments, assignments, roster, onClose,
}: {
  entryId: string
  roomKey: string
  roomHref: string
  staff: Array<{ userId: string; label: string }>
  roles: StaffRole[]
  hasAssignments: boolean
  assignments: AssignmentRow[]
  roster: RosterRow[]
  onClose: () => void
}) {
  const router = useRouter()
  const initialKind = staff.length > 0 ? 'user' : 'role'
  const [targetKind, setTargetKind] = useState<'user' | 'role'>(initialKind)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [targetRole, setTargetRole] = useState<StaffRole | ''>(roles[0] ?? '')
  const [required, setRequired] = useState(true)
  const [dueAt, setDueAt] = useState('')
  const [busy, setBusy] = useState<'assign' | 'reack' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  function toggleUser(userId: string) {
    setSelectedUsers(current => current.includes(userId) ? current.filter(id => id !== userId) : [...current, userId])
  }

  async function assign() {
    const targets = targetKind === 'user' ? selectedUsers : [targetRole]
    if (targets.length === 0 || !targets[0]) return
    setBusy('assign')
    setMessage(null)
    try {
      const results = await Promise.all(targets.map(async target => {
        const response = await fetch('/api/admin/playbook/assignments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomKey, entryId, targetKind, targetUserId: targetKind === 'user' ? target : null, targetRole: targetKind === 'role' ? target : null, required, dueAt: dueAt ? new Date(`${dueAt}T23:59:59`).toISOString() : null }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error || 'Could not assign reading')
      }))
      setMessage(`${results.length} reading assignment${results.length === 1 ? '' : 's'} saved.`)
      setSelectedUsers([])
      router.refresh()
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not assign reading')
    } finally { setBusy(null) }
  }

  async function requireAgain() {
    setBusy('reack')
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/playbook/entries/${entryId}/reacknowledgement`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomKey, dueAt: dueAt ? new Date(`${dueAt}T23:59:59`).toISOString() : null }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not require re-acknowledgement')
      setMessage(`${payload.data?.assignmentCount ?? 0} assignment(s) moved to the current revision.`)
      router.refresh()
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not require re-acknowledgement')
    } finally { setBusy(null) }
  }

  const canAssign = targetKind === 'user' ? selectedUsers.length > 0 : Boolean(targetRole)
  return (
    <div className="mt-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-[12px] font-extrabold text-[color:var(--ink)]">Reading operations</p><p className="mt-0.5 text-[10px] text-[color:var(--ink-3)]">Assign, monitor, remind, and preserve revision-specific acknowledgement history.</p></div>
        <button type="button" onClick={onClose} className="text-[11px] font-bold text-[color:var(--ink-3)] hover:text-[color:var(--ink)]">Close</button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[150px_minmax(220px,1fr)_170px]">
        <select value={targetKind} onChange={event => setTargetKind(event.target.value as 'user' | 'role')} aria-label="Assignment audience type" className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 text-[12px] text-[color:var(--ink)]">
          <option value="user" disabled={staff.length === 0}>People</option><option value="role">Team / role</option>
        </select>
        {targetKind === 'user' ? (
          <fieldset className="max-h-36 overflow-auto rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-2">
            <legend className="sr-only">Choose Team Members</legend>
            {staff.map(person => <label key={person.userId} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[11px] text-[color:var(--ink-2)] hover:bg-[color:var(--panel-2)]"><input type="checkbox" checked={selectedUsers.includes(person.userId)} onChange={() => toggleUser(person.userId)} />{person.label}</label>)}
          </fieldset>
        ) : (
          <select value={targetRole} onChange={event => setTargetRole(event.target.value as StaffRole)} aria-label="Assignment team" className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 text-[12px] text-[color:var(--ink)]">{roles.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select>
        )}
        <label className="flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 text-[11px] font-bold text-[color:var(--ink-2)]">Due <input type="date" value={dueAt} onChange={event => setDueAt(event.target.value)} className="min-w-0 bg-transparent" /></label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[11px] font-bold text-[color:var(--ink-2)]"><input type="checkbox" checked={required} onChange={event => setRequired(event.target.checked)} /> Required</label>
        <button type="button" disabled={!canAssign || busy !== null} onClick={assign} className="rounded-lg px-3 py-2 text-[11px] font-extrabold text-white disabled:opacity-50" style={{ background: 'var(--grad)' }}>{busy === 'assign' ? 'Assigning…' : `Assign${targetKind === 'user' && selectedUsers.length > 1 ? ` ${selectedUsers.length} people` : ' reading'}`}</button>
        {hasAssignments && <button type="button" disabled={busy !== null} onClick={requireAgain} className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-[11px] font-bold text-[color:var(--ink-2)] disabled:opacity-50">{busy === 'reack' ? 'Updating…' : 'Require current revision again'}</button>}
        <a href={`/api/admin/playbook/entries/${entryId}/reading-export?roomKey=${encodeURIComponent(roomKey)}`} className="text-[11px] font-bold text-[color:var(--indigo)]">Export CSV</a>
      </div>
      {assignments.length > 0 && <div className="mt-4 space-y-2"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[color:var(--ink-3)]">Active assignments</p>{assignments.map(assignment => <AssignmentEditor key={assignment.id} assignment={assignment} roomKey={roomKey} />)}</div>}
      {roster.length > 0 && <details className="mt-4"><summary className="cursor-pointer text-[11px] font-extrabold text-[color:var(--ink)]">Reader roster · {roster.length}</summary><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-[10.5px]"><thead className="text-[color:var(--ink-3)]"><tr><th className="py-2">Team Member</th><th>State</th><th>Source</th><th>Revision</th><th>Due</th></tr></thead><tbody>{roster.map(row => <tr key={row.userId} className="border-t border-[color:var(--border)]"><td className="py-2 font-bold text-[color:var(--ink)]">{row.label}</td><td className={row.state === 'overdue' ? 'text-[#fca5a5]' : 'text-[color:var(--ink-2)]'}>{row.state}</td><td className="text-[color:var(--ink-3)]">{row.sourceLabels.join(', ')}</td><td className="text-[color:var(--ink-3)]">{row.acknowledgedRevision ?? '—'} / {row.requiredRevision}</td><td className="text-[color:var(--ink-3)]">{row.dueAt ? new Date(row.dueAt).toLocaleDateString('en-US') : '—'}</td></tr>)}</tbody></table></div></details>}
      <p className="mt-3 text-[10.5px] leading-5 text-[color:var(--ink-3)]">Assigning a Gameplan? Use <Link href={roomHref} className="font-bold text-[color:var(--indigo)]">Connected Gameplans</Link> and choose “required reading”—that remains the single Gameplan workflow. Acknowledgement means “I read this revision”; it is not a signature or legal consent.</p>
      {message && <p role="status" className="mt-2 text-[11px] text-[color:var(--ink-2)]">{message}</p>}
    </div>
  )
}
