'use client'

import { useEffect, useRef, useState } from 'react'
import type { DmMessageView } from '@/lib/social/dm'
import { createClient } from '@/lib/supabase/client'
import { formatPresenceStatus } from '@/lib/social/presence'
import { Composer, MessageBubble, initials } from '@/components/messages/Composer'
import { RequestView } from '@/components/messages/RequestView'
import { useMessagesDock } from '@/components/nav/ArtistLayoutClient'

export type ConversationTarget = {
  threadId: string | null
  otherId: string
  otherName: string
  otherAvatarUrl: string | null
  otherHandle: string
  otherLastSeenAt: string | null
  status: 'direct' | 'pending' | 'declined' | null
  requesterId: string | null
}

// ─── ConversationView (Task 3, D-06/D-22) ────────────────────────────────
// The two-pane right column (full height, not fixed-position). Inherits
// DmWidget's Realtime subscribe + 20s reconcile poll + optimistic send via
// the shared Composer. Header shows presence status. Auto-marks read on
// open (D-06). Renders RequestView instead of the bubble list/composer when
// the thread is a pending request addressed to the viewer.

export function ConversationView({
  viewerId,
  target,
  presenceOnline,
  remainingRequests,
  weeklyLimit,
  nextSlotDate,
  onBack,
  onThreadChanged,
}: {
  viewerId: string
  target: ConversationTarget
  presenceOnline: boolean
  remainingRequests: number
  weeklyLimit: number
  nextSlotDate: string | null
  onBack: () => void
  onThreadChanged: () => void
}) {
  const [messages, setMessages] = useState<DmMessageView[]>([])
  const [threadId, setThreadId] = useState<string | null>(target.threadId)
  const [otherLastSeenAt, setOtherLastSeenAt] = useState<string | null>(target.otherLastSeenAt)
  const [isConnection, setIsConnection] = useState(target.status === 'direct')
  const listRef = useRef<HTMLDivElement>(null)
  const { openDock } = useMessagesDock()

  // Reset local state when the selected target changes.
  useEffect(() => {
    setMessages([])
    setThreadId(target.threadId)
    setOtherLastSeenAt(target.otherLastSeenAt)
    setIsConnection(target.status === 'direct')
  }, [target.otherId, target.threadId, target.status, target.otherLastSeenAt])

  // Realtime subscribe — mirrors DmWidget.tsx exactly.
  useEffect(() => {
    if (!threadId) return
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

  // 20s reconcile poll — mirrors DmWidget.tsx; also refreshes isConnection
  // and otherLastSeenAt so the composer/presence self-correct while open.
  useEffect(() => {
    let alive = true
    const tick = async () => {
      const res = await fetch(`/api/dm/messages?with=${target.otherId}`)
      if (!alive || !res.ok) return
      const json = await res.json().catch(() => ({}))
      if (Array.isArray(json.data)) setMessages(json.data as DmMessageView[])
      if (typeof json.threadId === 'string') setThreadId(json.threadId)
      if (typeof json.isConnection === 'boolean') setIsConnection(json.isConnection)
      if (typeof json.otherLastSeenAt === 'string' || json.otherLastSeenAt === null) setOtherLastSeenAt(json.otherLastSeenAt)
    }
    tick()
    const id = setInterval(tick, 20000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [target.otherId])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  // Auto-read on open (D-06) — best-effort, no await.
  useEffect(() => {
    if (!threadId || !viewerId) return
    fetch(`/api/dm/read/${threadId}`, { method: 'POST' }).catch(() => {})
  }, [threadId, viewerId])

  const presenceStatus = presenceOnline ? 'Active now' : formatPresenceStatus(otherLastSeenAt)
  const isPendingReceived = target.status === 'pending' && target.requesterId !== viewerId && target.requesterId !== null
  const pendingMineCount = target.status === 'pending' && target.requesterId === viewerId ? messages.filter(m => m.mine).length : 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-hair px-6 py-4">
        <button onClick={onBack} aria-label="Back" className="text-lavdim hover:text-white lg:hidden">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span
          className="h-9 w-9 flex-none rounded-full bg-gradient-to-br from-brandindigo to-brandfuchsia bg-cover bg-center text-center text-[12px] font-bold leading-9 text-white"
          style={target.otherAvatarUrl ? { backgroundImage: `url('${target.otherAvatarUrl}')` } : undefined}
        >
          {!target.otherAvatarUrl && initials(target.otherName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-white">{target.otherName}</div>
          {presenceStatus && (
            <div className={`flex items-center gap-1 text-[12px] font-bold ${presenceOnline ? 'text-emerald-400' : 'text-lavdim'}`}>
              {presenceOnline && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
              {presenceStatus}
            </div>
          )}
        </div>
        {threadId && (
          <button onClick={() => openDock(threadId)} aria-label="Collapse conversation" className="text-lavdim hover:text-white">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </button>
        )}
      </div>

      {isPendingReceived ? (
        <RequestView
          threadId={threadId as string}
          requesterName={target.otherName}
          requesterAvatarUrl={target.otherAvatarUrl}
          messages={messages}
          onAccepted={onThreadChanged}
          onDeclined={onThreadChanged}
          onBlocked={onThreadChanged}
        />
      ) : (
        <>
          <div ref={listRef} className="flex flex-1 flex-col gap-2 overflow-y-auto bg-ink px-6 py-4">
            {messages.length === 0 ? (
              <p className="m-auto text-center text-[14px] text-lavdim">Say hello to {target.otherName.split(' ')[0]}.</p>
            ) : (
              messages.map(m => <MessageBubble key={m.id} message={m} />)
            )}
          </div>
          <Composer
            otherId={target.otherId}
            otherHandle={target.otherHandle}
            isConnection={isConnection}
            remainingRequests={remainingRequests}
            weeklyLimit={weeklyLimit}
            pendingCount={pendingMineCount}
            nextSlotDate={nextSlotDate}
            setMessages={setMessages}
            onSent={newThreadId => {
              setThreadId(newThreadId)
              onThreadChanged()
            }}
          />
        </>
      )}
    </div>
  )
}
