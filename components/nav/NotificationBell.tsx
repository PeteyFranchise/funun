'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NotificationPanel } from '@/components/nav/NotificationPanel'

// ─── NotificationBell (NOTIF-02, D-12, D-13) ─────────────────────────────
// Global unread-count bell mounted once in the authenticated header row
// (app/(artist)/layout.tsx). The Realtime subscription is GLOBAL — not gated
// on the panel being open, unlike DmWidget — with a stable per-user channel
// name and always-return removeChannel cleanup (RESEARCH Pitfall 5). The
// unread count is ONLY ever set from a fresh COUNT fetch, never a
// client-side increment (Anti-Patterns guard, T-10-16).

export function NotificationBell({ userId }: { userId: string }) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Memoize the browser client so the Realtime channel isn't torn down and
  // recreated on every render (Pitfall 5 — memoized client + stable channel).
  const supabase = useMemo(() => createClient(), [])

  // Fresh unread head-count fetch — the single source of the badge number.
  // Called on the poll tick and on every Realtime INSERT; never incremented.
  useEffect(() => {
    let alive = true
    const tick = async () => {
      const res = await fetch('/api/notifications?unread=true')
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

  // Global Realtime subscription (D-13 — NO open-gate). Stable per-user
  // channel name so multiple tabs of the same user reuse the channel; on any
  // INSERT, refetch the count (do not client-increment). Always cleanup.
  useEffect(() => {
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          fetch('/api/notifications?unread=true')
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

  // Close the panel on an outside mousedown (mirrors ProfileMoreMenu).
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const badgeLabel = unreadCount >= 10 ? '9+' : String(unreadCount)

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Notifications"
        className="relative flex h-[42px] w-[42px] items-center justify-center rounded-[11px] border border-hair bg-card text-lav"
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
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>

        {unreadCount > 0 && (
          <span
            className="absolute -right-[4px] -top-[4px] flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 border-card bg-brandfuchsia px-[3px] text-[10px] font-extrabold leading-none text-white [font-variant-numeric:tabular-nums]"
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <NotificationPanel
          userId={userId}
          unreadCount={unreadCount}
          onMarkedAllRead={() => {
            fetch('/api/notifications?unread=true')
              .then(r => (r.ok ? r.json() : null))
              .then(json => {
                if (json && typeof json.unreadCount === 'number') setUnreadCount(json.unreadCount)
              })
              .catch(() => {})
          }}
          onRespondedToRequest={() => {
            fetch('/api/notifications?unread=true')
              .then(r => (r.ok ? r.json() : null))
              .then(json => {
                if (json && typeof json.unreadCount === 'number') setUnreadCount(json.unreadCount)
              })
              .catch(() => {})
          }}
        />
      )}
    </div>
  )
}
