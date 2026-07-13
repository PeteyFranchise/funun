'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ThreadView } from '@/lib/social/dm'
import { initials } from '@/components/messages/Composer'

export type { ThreadView } from '@/lib/social/dm'

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ThreadRow({
  thread,
  active,
  online,
  onSelect,
}: {
  thread: ThreadView
  active: boolean
  online: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-3 border-l-[3px] px-4 py-3 text-left ${
        active ? 'border-brandindigo bg-card2' : 'border-transparent hover:bg-card2/60'
      }`}
    >
      <span className="relative h-10 w-10 flex-none">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brandindigo to-brandfuchsia bg-cover bg-center text-[12px] font-bold text-white"
          style={thread.other.avatarUrl ? { backgroundImage: `url('${thread.other.avatarUrl}')` } : undefined}
        >
          {!thread.other.avatarUrl && initials(thread.other.name)}
        </span>
        {online && <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-card bg-emerald-400" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[15px] font-bold text-white">{thread.other.name}</span>
          {thread.lastMessage && (
            <span className="flex-none text-[12px] font-bold text-lavdim">{timeLabel(thread.lastMessage.createdAt)}</span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[14px] text-lavdim">{thread.lastMessage?.body ?? ''}</span>
          {thread.hasUnread && <span className="h-2 w-2 flex-none rounded-full bg-brandfuchsia" />}
        </span>
      </span>
    </button>
  )
}

// ─── ThreadList (Task 2, D-08/D-10/D-22) ─────────────────────────────────
// Normal threads (status='direct', or pending threads the viewer sent) as
// rows; a separate Requests section below for pending threads addressed TO
// the viewer. People-only search filter. Live via Realtime + refetch — no
// client-side unread counter (D-07).

export function ThreadList({
  threads,
  activeThreadId,
  onSelect,
  presenceMap,
  viewerId,
  onRefresh,
}: {
  threads: ThreadView[]
  activeThreadId: string | null
  onSelect: (thread: ThreadView) => void
  presenceMap: Record<string, boolean>
  viewerId: string
  onRefresh: () => void
}) {
  const [query, setQuery] = useState('')

  // Keep the list live: subscribe to dm_messages INSERTs and refetch (via
  // the parent's onRefresh) — never maintain a client-side counter (D-07).
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`dm-threads-list-${viewerId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' }, () => onRefresh())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [viewerId, onRefresh])

  const q = query.trim().toLowerCase()
  const matches = (t: ThreadView) => !q || t.other.name.toLowerCase().includes(q) || t.other.handle.toLowerCase().includes(q)

  const normal = threads.filter(
    t => (t.status === 'direct' || (t.status === 'pending' && t.requesterId === viewerId)) && matches(t)
  )
  const requests = threads.filter(t => t.status === 'pending' && t.requesterId !== viewerId && matches(t))

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-hair p-4">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="w-full rounded-[10px] border border-hair bg-card2 px-3 py-[10px] text-[14px] text-white placeholder:text-lavdim focus:outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {normal.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-[14px] font-bold text-white">No messages yet</p>
            <p className="mt-1 text-[14px] text-lavdim">When someone sends you a message, it&rsquo;ll appear here.</p>
          </div>
        ) : (
          normal.map(t => (
            <ThreadRow key={t.id} thread={t} active={t.id === activeThreadId} online={!!presenceMap[t.other.id]} onSelect={() => onSelect(t)} />
          ))
        )}

        <div className="flex items-center gap-2 border-t border-hair px-4 py-3">
          <span className="text-[12px] font-bold uppercase tracking-[.18em] text-lavdim">Requests</span>
          {requests.length > 0 && (
            <span className="rounded-full border border-[rgba(129,140,248,.28)] bg-[rgba(129,140,248,.12)] px-2 py-[1px] text-[12px] font-bold text-brandindigo">
              {requests.length}
            </span>
          )}
        </div>
        {requests.length === 0 ? (
          <p className="px-4 pb-4 text-[14px] text-lavdim">No pending requests</p>
        ) : (
          requests.map(t => (
            <ThreadRow key={t.id} thread={t} active={t.id === activeThreadId} online={!!presenceMap[t.other.id]} onSelect={() => onSelect(t)} />
          ))
        )}
      </div>
    </div>
  )
}
