'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ThreadView } from '@/lib/social/dm'
import { computeRequestBudget } from '@/lib/social/dm'
import { ThreadList } from '@/components/messages/ThreadList'
import { ConversationView, type ConversationTarget } from '@/components/messages/ConversationView'

export type MessagesPageClientProps = {
  viewerId: string
  viewerVerified: boolean
  initialThreads: ThreadView[]
  initialThreadId: string | null
  initialWith: { id: string; name: string; avatarUrl: string | null; handle: string; lastSeenAt: string | null } | null
}

// ─── MessagesPageClient (Task 3, D-01/D-04/D-05) ─────────────────────────
// The /messages inbox shell. Two-pane at lg (thread list left, conversation
// right); single-pane below lg (thread list OR full-screen conversation
// with a back affordance). Holds active-thread state and the read-only
// presence map (reusing PresenceTracker's single presence-global channel —
// never a second subscribe/join).

export function MessagesPageClient({ viewerId, viewerVerified, initialThreads, initialThreadId, initialWith }: MessagesPageClientProps) {
  const [threads, setThreads] = useState<ThreadView[]>(initialThreads)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    initialThreadId ?? initialThreads.find(t => t.other.id === initialWith?.id)?.id ?? null
  )
  const [pendingTarget, setPendingTarget] = useState(
    !initialThreadId && initialWith && !initialThreads.some(t => t.other.id === initialWith.id) ? initialWith : null
  )
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>({})
  const [mobileShowThread, setMobileShowThread] = useState(!!initialThreadId || !!initialWith)

  const refreshThreads = useCallback(() => {
    fetch('/api/dm/threads')
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (!Array.isArray(json?.data)) return
        const nextThreads = json.data as ThreadView[]
        setThreads(nextThreads)
        if (activeThreadId && !nextThreads.some(t => t.id === activeThreadId)) {
          setActiveThreadId(null)
          setPendingTarget(null)
          setMobileShowThread(false)
        }
      })
      .catch(() => {})
  }, [activeThreadId])

  // Read-only presence: reuse PresenceTracker's single presence-global
  // channel (same memoized browser client + topic name) — never a second
  // subscribe/track, only a sync listener + presenceState() read.
  // RealtimeChannel has no public unbind-one-listener API, so an `alive`
  // flag (mirroring DmWidget's reconcile-poll pattern) guards against a
  // stale callback updating state after unmount — the channel itself is
  // never torn down here, only PresenceTracker owns that lifecycle.
  useEffect(() => {
    let alive = true
    const supabase = createClient()
    const channel = supabase.channel('presence-global', { config: { presence: { key: viewerId } } })
    const sync = () => {
      if (!alive) return
      const state = channel.presenceState() as Record<string, unknown[]>
      const online: Record<string, boolean> = {}
      for (const key of Object.keys(state)) online[key] = true
      setPresenceMap(online)
    }
    channel.on('presence', { event: 'sync' }, sync)
    sync()
    return () => {
      alive = false
    }
  }, [viewerId])

  const activeThread = threads.find(t => t.id === activeThreadId) ?? null

  const target: ConversationTarget | null = useMemo(() => {
    if (activeThread) {
      return {
        threadId: activeThread.id,
        otherId: activeThread.other.id,
        otherName: activeThread.other.name,
        otherAvatarUrl: activeThread.other.avatarUrl,
        otherHandle: activeThread.other.handle,
        otherLastSeenAt: activeThread.other.lastSeenAt,
        status: activeThread.status as 'direct' | 'pending' | 'declined',
        requesterId: activeThread.requesterId,
      }
    }
    if (pendingTarget) {
      return {
        threadId: null,
        otherId: pendingTarget.id,
        otherName: pendingTarget.name,
        otherAvatarUrl: pendingTarget.avatarUrl,
        otherHandle: pendingTarget.handle,
        otherLastSeenAt: pendingTarget.lastSeenAt,
        status: null,
        requesterId: null,
      }
    }
    return null
  }, [activeThread, pendingTarget])

  // Rate-limit budget (D-17) — computed client-side from the viewer's own
  // thread list, mirroring countRecentRequests()'s window exactly. No
  // dedicated "remaining budget" endpoint needed.
  const budget = useMemo(() => computeRequestBudget(threads, viewerId, viewerVerified), [threads, viewerId, viewerVerified])

  function selectThread(thread: ThreadView) {
    setActiveThreadId(thread.id)
    setPendingTarget(null)
    setMobileShowThread(true)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className={`w-full flex-none border-r border-hair lg:block lg:w-[320px] ${mobileShowThread ? 'hidden' : 'block'}`}>
        <ThreadList
          threads={threads}
          activeThreadId={activeThreadId}
          onSelect={selectThread}
          presenceMap={presenceMap}
          viewerId={viewerId}
          onRefresh={refreshThreads}
        />
      </div>
      <div className={`min-w-0 flex-1 lg:flex ${mobileShowThread ? 'flex' : 'hidden'}`}>
        {target ? (
          <ConversationView
            key={target.otherId}
            viewerId={viewerId}
            target={target}
            presenceOnline={!!presenceMap[target.otherId]}
            remainingRequests={budget.remainingRequests}
            weeklyLimit={budget.weeklyLimit}
            nextSlotDate={budget.nextSlotDate}
            onBack={() => setMobileShowThread(false)}
            onThreadChanged={refreshThreads}
          />
        ) : (
          <div className="m-auto p-8 text-center text-[14px] text-lavdim">Select a conversation</div>
        )}
      </div>
    </div>
  )
}
