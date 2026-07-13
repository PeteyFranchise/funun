'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { DmMessageView, ThreadView } from '@/lib/social/dm'
import { computeRequestBudget } from '@/lib/social/dm'
import { createClient } from '@/lib/supabase/client'
import { formatPresenceStatus } from '@/lib/social/presence'
import { Composer, MessageBubble, initials } from '@/components/messages/Composer'
import { RequestView } from '@/components/messages/RequestView'

// ─── DockedWidget (Task 3, D-03/D-22) ────────────────────────────────────
// Bottom-right floating widget rendered by ArtistLayoutClient, identical
// chrome to the existing DmWidget.tsx `.pf-dm`. It only receives a
// threadId — there is no dedicated single-thread GET route, so it resolves
// the other-party snapshot + thread status + rate-limit budget from the
// full GET /api/dm/threads list (already RLS-scoped to the caller's own
// threads; cheap for the thread-count this phase expects).

export function DockedWidget({ threadId, viewerId, onClose }: { threadId: string; viewerId: string; onClose: () => void }) {
  const [other, setOther] = useState<ThreadView['other'] | null>(null)
  const [status, setStatus] = useState<'direct' | 'pending' | 'declined' | null>(null)
  const [requesterId, setRequesterId] = useState<string | null>(null)
  const [messages, setMessages] = useState<DmMessageView[]>([])
  const [isConnection, setIsConnection] = useState(true)
  const [budget, setBudget] = useState<{ remainingRequests: number; nextSlotDate: string | null; weeklyLimit: number }>({
    remainingRequests: 0,
    nextSlotDate: null,
    weeklyLimit: 10,
  })
  const [presenceOnline, setPresenceOnline] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Resolve the other-party snapshot + status + rate-limit budget from the
  // thread list. NOTE: the viewer's `verified` flag is not threaded into
  // this component (see 11-05-SUMMARY known limitation) — the budget
  // computed here conservatively assumes unverified (BASELINE limit).
  useEffect(() => {
    let alive = true
    fetch('/api/dm/threads')
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (!alive || !Array.isArray(json?.data)) return
        const rows = json.data as ThreadView[]
        const row = rows.find(t => t.id === threadId)
        if (row) {
          setOther(row.other)
          setStatus(row.status as 'direct' | 'pending' | 'declined')
          setRequesterId(row.requesterId)
          setIsConnection(row.status === 'direct')
        }
        setBudget(computeRequestBudget(rows, viewerId, false))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [threadId, viewerId])

  // Realtime subscribe — mirrors DmWidget.tsx exactly.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`dm-${threadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `thread_id=eq.${threadId}` },
        payload => {
          const n = payload.new as { id: string; body: string; created_at: string; sender_id: string }
          setMessages(m =>
            m.some(x => x.id === n.id) ? m : [...m, { id: n.id, body: n.body, createdAt: n.created_at, mine: n.sender_id === viewerId }]
          )
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [threadId, viewerId])

  // Read-only presence — reuse the presence-global channel PresenceTracker
  // already joined (same client singleton + topic); do not re-subscribe.
  // RealtimeChannel has no public unbind-one-listener API, so an `alive`
  // flag guards against a stale callback updating state after unmount.
  useEffect(() => {
    if (!other) return
    let alive = true
    const supabase = createClient()
    const channel = supabase.channel('presence-global', { config: { presence: { key: viewerId } } })
    const sync = () => {
      if (!alive) return
      const state = channel.presenceState() as Record<string, unknown[]>
      setPresenceOnline(!!state[other.id])
    }
    channel.on('presence', { event: 'sync' }, sync)
    sync()
    return () => {
      alive = false
    }
  }, [other, viewerId])

  // 20s reconcile poll — mirrors DmWidget.tsx.
  useEffect(() => {
    if (!other) return
    let alive = true
    const tick = async () => {
      const res = await fetch(`/api/dm/messages?with=${other.id}`)
      if (!alive || !res.ok) return
      const json = await res.json().catch(() => ({}))
      if (Array.isArray(json.data)) setMessages(json.data as DmMessageView[])
      if (typeof json.isConnection === 'boolean') setIsConnection(json.isConnection)
    }
    tick()
    const id = setInterval(tick, 20000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [other])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  // Auto-read on open (D-06).
  useEffect(() => {
    fetch(`/api/dm/read/${threadId}`, { method: 'POST' }).catch(() => {})
  }, [threadId])

  if (!other) return null

  const presenceStatus = presenceOnline ? 'Active now' : formatPresenceStatus(other.lastSeenAt)
  const isPendingReceived = status === 'pending' && requesterId !== viewerId && requesterId !== null
  const pendingMineCount = status === 'pending' && requesterId === viewerId ? messages.filter(m => m.mine).length : 0

  return (
    <div className="fixed bottom-0 right-8 z-50 w-[336px] overflow-hidden rounded-t-[14px] border border-hairstrong bg-card shadow-[0_-20px_60px_-20px_rgba(0,0,0,.7)]">
      <div className="flex items-center gap-[11px] border-b border-hair bg-[#13112a] px-4 py-[14px]">
        <span
          className="h-9 w-9 flex-none rounded-full bg-gradient-to-br from-brandindigo to-brandfuchsia bg-cover bg-center text-center text-[12px] font-bold leading-9 text-white"
          style={other.avatarUrl ? { backgroundImage: `url('${other.avatarUrl}')` } : undefined}
        >
          {!other.avatarUrl && initials(other.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-white">{other.name}</div>
          <div className={`flex items-center gap-1 text-[12px] font-bold ${presenceOnline ? 'text-emerald-400' : 'text-lavdim'}`}>
            {presenceOnline && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
            {presenceStatus ?? 'Direct message'}
          </div>
        </div>
        <Link href={`/messages?thread=${threadId}`} aria-label="Open in Messages" className="text-lavdim hover:text-white">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </Link>
        <button onClick={onClose} aria-label="Close" className="text-lavdim hover:text-white">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {isPendingReceived ? (
        <div className="max-h-[400px] min-h-[180px] overflow-y-auto">
          <RequestView
            threadId={threadId}
            requesterName={other.name}
            requesterAvatarUrl={other.avatarUrl}
            messages={messages}
            onAccepted={() => setStatus('direct')}
            onDeclined={onClose}
            onBlocked={onClose}
          />
        </div>
      ) : (
        <>
          <div ref={listRef} className="flex max-h-[320px] min-h-[180px] flex-col gap-2 overflow-y-auto bg-ink px-4 py-4">
            {messages.length === 0 ? (
              <p className="m-auto text-center text-[13px] text-lavdim">Say hello to {other.name.split(' ')[0]}.</p>
            ) : (
              messages.map(m => <MessageBubble key={m.id} message={m} />)
            )}
          </div>
          <Composer
            otherId={other.id}
            otherHandle={other.handle}
            isConnection={isConnection}
            remainingRequests={budget.remainingRequests}
            weeklyLimit={budget.weeklyLimit}
            pendingCount={pendingMineCount}
            nextSlotDate={budget.nextSlotDate}
            setMessages={setMessages}
          />
        </>
      )}
    </div>
  )
}
