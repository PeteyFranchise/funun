'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ─── MessagesIcon (PRESENCE-03, NOTIF-02 messages-badge half, D-02) ──────
// Topbar chat-bubble icon + unread-thread-count badge, mounted once in the
// authenticated header row (app/(artist)/layout.tsx) beside NotificationBell.
// Mirrors NotificationBell's global-subscription discipline: the badge
// number is ONLY ever set from a fresh GET /api/dm/threads?unread=true
// count — never client-incremented (D-07). Unlike NotificationBell, this is
// a plain link (no dropdown panel) — clicking navigates to /messages (D-02).

export function MessagesIcon({ userId }: { userId: string }) {
  const [unreadCount, setUnreadCount] = useState(0)

  // Memoize the browser client so the Realtime channel isn't torn down and
  // recreated on every render (mirrors NotificationBell's memoized-client
  // guard).
  const supabase = useMemo(() => createClient(), [])

  // Fresh unread-THREAD-count fetch — the single source of the badge number.
  // Called on the poll tick and on every Realtime INSERT; never incremented.
  useEffect(() => {
    let alive = true
    const tick = async () => {
      const res = await fetch('/api/dm/threads?unread=true')
      if (!alive || !res.ok) return
      const json = await res.json().catch(() => ({}))
      if (typeof json.unreadCount === 'number') setUnreadCount(json.unreadCount)
    }
    tick()
    const id = setInterval(tick, 25000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [userId])

  // Global Realtime subscription — no per-thread filter; refetch the fresh
  // count on any dm_messages INSERT and let the COUNT endpoint decide what
  // is unread (D-07). Always cleanup with removeChannel (Pitfall 1).
  useEffect(() => {
    const channel = supabase
      .channel(`dm-messages-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages' },
        () => {
          fetch('/api/dm/threads?unread=true')
            .then(r => (r.ok ? r.json() : null))
            .then(json => {
              if (json && typeof json.unreadCount === 'number') setUnreadCount(json.unreadCount)
            })
            .catch(() => {})
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, userId])

  const badgeLabel = unreadCount >= 10 ? '9+' : String(unreadCount)

  return (
    <Link
      href="/messages"
      aria-label="Messages"
      className="relative flex h-11 w-11 items-center justify-center rounded-[11px] border border-hair bg-card text-lav"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>

      {unreadCount > 0 && (
        <span
          className="absolute -right-[4px] -top-[4px] flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 border-card bg-brandfuchsia px-[3px] text-[12px] font-bold leading-none text-white [font-variant-numeric:tabular-nums]"
        >
          {badgeLabel}
        </span>
      )}
    </Link>
  )
}
