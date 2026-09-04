'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ThreadView } from '@/lib/social/dm'
import { createClient } from '@/lib/supabase/client'

// Global message control: the badge is always sourced from the server's
// unread-thread count. The heavier thread list is fetched only while the
// member asks to see the drawer, keeping Messages available everywhere
// without occupying permanent workspace navigation.

export function MessagesIcon({ userId }: { userId: string }) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [threads, setThreads] = useState<ThreadView[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(open)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    openRef.current = open
  }, [open])

  const loadUnreadCount = useCallback(async () => {
    const res = await fetch('/api/dm/threads?unread=true')
    if (!res.ok) return
    const json = await res.json().catch(() => ({}))
    if (typeof json.unreadCount === 'number') setUnreadCount(json.unreadCount)
  }, [])

  const loadThreads = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dm/threads', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Could not load messages')
      setThreads(Array.isArray(json.data) ? json.data : [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load messages')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUnreadCount()
    const id = setInterval(() => void loadUnreadCount(), 25000)
    return () => clearInterval(id)
  }, [loadUnreadCount, userId])

  useEffect(() => {
    if (!open) return
    void loadThreads()
  }, [loadThreads, open])

  useEffect(() => {
    if (!open) return

    function closeOnOutsidePress(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  useEffect(() => {
    const channel = supabase
      .channel(`dm-messages-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' }, () => {
        void loadUnreadCount()
        if (openRef.current) void loadThreads()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadThreads, loadUnreadCount, supabase, userId])

  const incomingRequests = threads.filter(thread => thread.status === 'pending' && thread.requesterId !== userId)
  const conversations = threads.filter(thread => !(thread.status === 'pending' && thread.requesterId !== userId))
  const visibleThreads = [...incomingRequests, ...conversations].slice(0, 6)
  const badgeLabel = unreadCount >= 10 ? '9+' : String(unreadCount)

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-label="Messages"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="global-messages-drawer"
        className="relative flex h-11 w-11 items-center justify-center rounded-[11px] border border-hair bg-card text-lav transition hover:border-brandindigo/50 hover:text-white"
      >
        <MessageBubbleIcon />
        {unreadCount > 0 ? (
          <span className="absolute -right-[4px] -top-[4px] flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 border-card bg-brandfuchsia px-[3px] text-[12px] font-bold leading-none text-white [font-variant-numeric:tabular-nums]">
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          id="global-messages-drawer"
          role="dialog"
          aria-label="Recent messages"
          className="absolute right-0 top-[calc(100%+12px)] z-50 w-[min(380px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-hairstrong bg-[#0f0e1d] shadow-[0_24px_80px_rgba(0,0,0,.55)]"
        >
          <div className="flex items-center justify-between border-b border-hair px-5 py-4">
            <div>
              <h2 className="text-base font-black text-white">Messages</h2>
              <p className="mt-0.5 text-xs text-lavdim">
                {incomingRequests.length > 0
                  ? `${incomingRequests.length} ${incomingRequests.length === 1 ? 'request' : 'requests'} waiting`
                  : 'Your recent conversations'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close messages"
              className="rounded-lg p-2 text-lavdim hover:bg-white/5 hover:text-white"
            >
              <span aria-hidden>×</span>
            </button>
          </div>

          <div className="max-h-[430px] overflow-y-auto py-2">
            {loading ? <DrawerState>Loading conversations…</DrawerState> : null}
            {!loading && error ? <DrawerState tone="error">{error}</DrawerState> : null}
            {!loading && !error && visibleThreads.length === 0 ? (
              <DrawerState>No conversations yet. Find someone in The Green Room and say hello.</DrawerState>
            ) : null}
            {!loading && !error
              ? visibleThreads.map(thread => (
                  <MessageThreadRow
                    key={thread.id}
                    thread={thread}
                    incomingRequest={thread.status === 'pending' && thread.requesterId !== userId}
                    onOpen={() => setOpen(false)}
                  />
                ))
              : null}
          </div>

          <Link
            href="/messages"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between border-t border-hair px-5 py-4 text-sm font-black text-brandindigo transition hover:bg-white/[0.04] hover:text-white"
          >
            Open full inbox <span aria-hidden>→</span>
          </Link>
        </section>
      ) : null}
    </div>
  )
}

function MessageThreadRow({
  thread,
  incomingRequest,
  onOpen,
}: {
  thread: ThreadView
  incomingRequest: boolean
  onOpen: () => void
}) {
  return (
    <Link
      href={`/messages?thread=${thread.id}`}
      onClick={onOpen}
      className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.05]"
    >
      <span
        className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-gradient-to-br from-brandindigo to-brandfuchsia bg-cover bg-center text-xs font-black text-white"
        style={thread.other.avatarUrl ? { backgroundImage: `url('${thread.other.avatarUrl}')` } : undefined}
      >
        {!thread.other.avatarUrl ? initials(thread.other.name) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-black text-white">{thread.other.name}</span>
          {incomingRequest ? (
            <span className="rounded-full bg-brandindigo/15 px-2 py-0.5 text-[10px] font-bold text-brandindigo">
              Request
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-lavdim">
          {thread.lastMessage?.body ?? (incomingRequest ? 'Wants to start a conversation' : 'Open conversation')}
        </span>
      </span>
      {thread.hasUnread ? <span className="h-2.5 w-2.5 flex-none rounded-full bg-brandfuchsia" aria-label="Unread" /> : null}
    </Link>
  )
}

function DrawerState({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'error' }) {
  return (
    <p className={['px-5 py-8 text-center text-sm', tone === 'error' ? 'text-rose-200' : 'text-lavdim'].join(' ')}>
      {children}
    </p>
  )
}

function MessageBubbleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
