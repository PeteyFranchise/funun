'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { ChangeBroadcastItem, ChangeBroadcastPriority } from '@/lib/playbook/change-broadcasts'

const PRIORITY_LABELS: Record<ChangeBroadcastPriority, string> = {
  standard: 'Update', important: 'Important', urgent: 'Urgent',
}

const PRIORITY_STYLES: Record<ChangeBroadcastPriority, string> = {
  standard: 'border-[color:var(--border)] text-[color:var(--indigo)]',
  important: 'border-amber-400/35 text-amber-300',
  urgent: 'border-rose-400/40 text-rose-300',
}

function dateLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

export function ChangeBroadcastCenter({ initialItems, schemaReady }: { initialItems: ChangeBroadcastItem[]; schemaReady: boolean }) {
  const [items, setItems] = useState(initialItems)
  const [query, setQuery] = useState('')
  const [room, setRoom] = useState('all')
  const [priority, setPriority] = useState<'all' | ChangeBroadcastPriority>('all')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rooms = useMemo(() => Array.from(new Map(items.map(item => [item.roomKey, item.roomLabel])).entries()), [items])
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter(item => {
      if (room !== 'all' && item.roomKey !== room) return false
      if (priority !== 'all' && item.priority !== priority) return false
      if (unreadOnly && item.isRead) return false
      if (!needle) return true
      return [item.headline, item.change_summary, item.why_it_matters, item.action_required ?? '', item.entryTitle, item.roomLabel]
        .some(value => value.toLowerCase().includes(needle))
    })
  }, [items, priority, query, room, unreadOnly])

  async function markRead(id: string) {
    setBusy(id)
    setError(null)
    try {
      const response = await fetch(`/api/admin/playbook/updates/${id}/read`, { method: 'POST' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not mark this update read')
      setItems(current => current.map(item => item.id === id ? { ...item, isRead: true } : item))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not mark this update read')
    } finally {
      setBusy(null)
    }
  }

  if (!schemaReady) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--panel)] px-6 py-10 text-center">
        <p className="text-[13px] font-extrabold text-[color:var(--ink)]">The internal update center is built and awaiting activation.</p>
        <p className="mt-2 text-[11.5px] text-[color:var(--ink-3)]">Its human-gated candidate migration has not been applied.</p>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <div className="grid gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4 md:grid-cols-[minmax(240px,1fr)_180px_150px_auto]">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search what changed, why, or what to do…" aria-label="Search Playbook updates" className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] text-[color:var(--ink)] outline-none focus:border-[color:var(--indigo)]" />
        <select value={room} onChange={event => setRoom(event.target.value)} aria-label="Filter update room" className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] text-[color:var(--ink)]"><option value="all">All teams</option>{rooms.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select value={priority} onChange={event => setPriority(event.target.value as typeof priority)} aria-label="Filter update priority" className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[12px] text-[color:var(--ink)]"><option value="all">All priorities</option><option value="urgent">Urgent</option><option value="important">Important</option><option value="standard">Standard</option></select>
        <label className="flex items-center gap-2 whitespace-nowrap px-1 text-[11px] font-bold text-[color:var(--ink-2)]"><input type="checkbox" checked={unreadOnly} onChange={event => setUnreadOnly(event.target.checked)} /> Unread only</label>
      </div>

      <div className="mt-4 space-y-3">
        {visible.map(item => (
          <article id={`update-${item.id}`} key={item.id} className={['rounded-xl border bg-[color:var(--panel)] p-5', item.isRead ? 'border-[color:var(--border)] opacity-80' : PRIORITY_STYLES[item.priority]].join(' ')}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {!item.isRead && <span className="h-2 w-2 rounded-full bg-[color:var(--fuchsia)] shadow-[0_0_7px_rgba(217,70,239,.65)]" aria-label="Unread" />}
                  <span className={['rounded-full border px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[.1em]', PRIORITY_STYLES[item.priority]].join(' ')}>{PRIORITY_LABELS[item.priority]}</span>
                  {item.reading_required && <span className="rounded-full border border-amber-400/30 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[.1em] text-amber-300">Reading required</span>}
                </div>
                <h2 className="mt-3 text-[17px] font-extrabold text-[color:var(--ink)]">{item.headline}</h2>
                <p className="mt-1 text-[10.5px] text-[color:var(--ink-3)]">{item.roomLabel} · {item.entryTitle} · Revision {item.revision_number}</p>
              </div>
              <p className="text-right text-[10.5px] leading-5 text-[color:var(--ink-3)]">Published {dateLabel(item.published_at)}<br />Effective {dateLabel(item.effective_at)}</p>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div><h3 className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[color:var(--ink-3)]">What changed</h3><p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-6 text-[color:var(--ink-2)]">{item.change_summary}</p></div>
              <div><h3 className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[color:var(--ink-3)]">Why it matters</h3><p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-6 text-[color:var(--ink-2)]">{item.why_it_matters}</p></div>
            </div>
            {item.action_required && <div className="mt-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] p-3"><h3 className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[color:var(--ink-3)]">What you need to do</h3><p className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-[color:var(--ink)]">{item.action_required}</p>{item.reading_due_at && <p className="mt-2 text-[10.5px] font-bold text-amber-300">Due {dateLabel(item.reading_due_at)}</p>}</div>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link href={`/admin/playbook/${item.roomKey}/${item.entrySlug}`} className="rounded-lg px-3 py-2 text-[11px] font-extrabold text-white" style={{ background: 'var(--grad)' }}>Open guidance</Link>
              {!item.isRead && <button type="button" disabled={busy !== null} onClick={() => markRead(item.id)} className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-[11px] font-bold text-[color:var(--ink-2)] disabled:opacity-50">{busy === item.id ? 'Saving…' : 'Mark as read'}</button>}
              <span className="ml-auto text-[10px] text-[color:var(--ink-3)]">Shared by {item.publisherName}</span>
            </div>
          </article>
        ))}
        {visible.length === 0 && <p className="rounded-xl border border-dashed border-[color:var(--border)] px-5 py-10 text-center text-[12px] text-[color:var(--ink-3)]">No Playbook updates match these filters.</p>}
      </div>
      {error && <p role="alert" className="mt-3 text-[11px] text-rose-400">{error}</p>}
      <p className="mt-4 text-[10.5px] text-[color:var(--ink-3)]">Marking an update read only manages discovery. Required guidance is acknowledged separately in My Required Reading.</p>
    </div>
  )
}
