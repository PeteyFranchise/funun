'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Notification } from '@/types'
import { NOTIFICATION_TYPES, type NotificationType } from '@/lib/social/notifications'

// ─── NotificationPanel (NOTIF-03, D-08–D-11) ─────────────────────────────
// Dropdown list anchored top-right of the bell. Mark-all-read is an explicit
// PATCH (D-09). connection_request rows carry inline Accept/Decline that act
// in place (D-10). Older rows auto-load via a created_at cursor + an
// IntersectionObserver sentinel (D-11). Bespoke design tokens + a copied
// inline timeAgo() only — no date-fns (RESEARCH Package Legitimacy Audit).

// Copied verbatim from components/profile/Wall.tsx — no date-fns.
function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 604800) return `${Math.floor(s / 86400)}d`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Hand-rolled per-type SVG glyphs (1.7 stroke, round caps — icons.tsx
// convention). Keyed by the NOTIFICATION_TYPES[type].icon string.
const ICON_PATHS: Record<string, React.ReactNode> = {
  'user-plus': (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  'message-square': <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  star: <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />,
  'message-circle': <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />,
  radio: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M4.93 19.07a10 10 0 0 1 0-14.14M7.76 16.24a6 6 0 0 1 0-8.48M16.24 7.76a6 6 0 0 1 0 8.48M19.07 4.93a10 10 0 0 1 0 14.14" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
}

function TypeIcon({ name, className }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON_PATHS[name] ?? ICON_PATHS.bell}
    </svg>
  )
}

const PAGE_SIZE = 20

type Props = {
  userId: string
  unreadCount: number
  onMarkedAllRead: () => void
  onRespondedToRequest: () => void
}

export function NotificationPanel({ unreadCount, onMarkedAllRead, onRespondedToRequest }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [done, setDone] = useState(false)
  const [marking, setMarking] = useState(false)
  const [busyRows, setBusyRows] = useState<Record<string, boolean>>({})
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadFirstPage = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json()
      const rows = (json.data ?? []) as Notification[]
      setItems(rows)
      setDone(rows.length < PAGE_SIZE)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFirstPage()
  }, [loadFirstPage])

  const loadMore = useCallback(async () => {
    if (loadingMore || done || loading || error || items.length === 0) return
    setLoadingMore(true)
    try {
      const oldest = items[items.length - 1]
      const params = new URLSearchParams({ before: oldest.created_at, beforeId: oldest.id })
      const res = await fetch(`/api/notifications?${params.toString()}`)
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json()
      const rows = (json.data ?? []) as Notification[]
      setItems(prev => {
        const seen = new Set(prev.map(p => p.id))
        return [...prev, ...rows.filter(r => !seen.has(r.id))]
      })
      if (rows.length < PAGE_SIZE) setDone(true)
    } catch {
      setDone(true)
    } finally {
      setLoadingMore(false)
    }
  }, [items, loadingMore, done, loading, error])

  // IntersectionObserver cursor pagination (D-11) — auto-fetch on scroll.
  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { root: node.parentElement, rootMargin: '80px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [loadMore])

  async function markAllRead() {
    if (unreadCount === 0 || marking) return
    setMarking(true)
    try {
      const res = await fetch('/api/notifications', { method: 'PATCH' })
      if (!res.ok) throw new Error('patch failed')
      setItems(prev => prev.map(n => ({ ...n, read: true })))
      onMarkedAllRead()
    } catch {
      // Non-fatal — leave state as-is; the poll will reconcile.
    } finally {
      setMarking(false)
    }
  }

  async function respond(n: Notification, action: 'accept' | 'decline') {
    const connectionId = (n.data as { connectionId?: string })?.connectionId
    if (!connectionId || busyRows[n.id]) return
    setBusyRows(b => ({ ...b, [n.id]: true }))
    try {
      const res = await fetch('/api/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, action }),
      })
      if (!res.ok) throw new Error('respond failed')
      const actor = n.actor_name || 'their'
      const resolvedTitle =
        action === 'accept'
          ? `You accepted ${actor}'s connection request`
          : `You declined ${actor}'s connection request`
      setItems(prev =>
        prev.map(x =>
          x.id === n.id ? { ...x, type: '__resolved__', title: resolvedTitle, read: true } : x
        )
      )
      onRespondedToRequest()
    } catch {
      // Non-fatal — leave the inline actions in place for a retry.
    } finally {
      setBusyRows(b => ({ ...b, [n.id]: false }))
    }
  }

  function rowInlineAction(n: Notification): boolean {
    const meta = NOTIFICATION_TYPES[n.type as NotificationType]
    return meta?.inlineAction === 'connection_respond'
  }

  function iconFor(n: Notification): string {
    const meta = NOTIFICATION_TYPES[n.type as NotificationType]
    return meta?.icon ?? 'bell'
  }

  const markDisabled = unreadCount === 0 || marking

  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-[380px] overflow-hidden rounded-[12px] border border-hair bg-card shadow-[0_12px_30px_-10px_rgba(0,0,0,.5)]">
      <div className="flex items-center justify-between border-b border-hair px-[18px] py-4">
        <span className="text-[16px] font-extrabold text-white">Notifications</span>
        <button
          type="button"
          onClick={markAllRead}
          disabled={markDisabled}
          className={`text-[13px] font-semibold text-brandindigo ${markDisabled ? 'cursor-not-allowed opacity-50' : 'hover:underline'}`}
        >
          Mark all read
        </button>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {loading ? (
          <div className="px-[18px] py-10 text-center text-[13px] text-lavdim">Loading…</div>
        ) : error ? (
          <div className="px-[18px] py-10 text-center">
            <p className="text-[14px] font-bold text-white">Couldn&apos;t load notifications</p>
            <p className="mt-1 text-[13px] text-lavdim">Check your connection and try again.</p>
            <button
              type="button"
              onClick={loadFirstPage}
              className="mt-3 text-[14px] font-semibold text-brandindigo hover:underline"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center px-[18px] py-10 text-center">
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] bg-card2 text-lav">
              <TypeIcon name="bell" className="h-5 w-5" />
            </span>
            <p className="text-[16px] font-extrabold text-white">No notifications yet</p>
            <p className="mt-1 text-[13px] text-lavdim">
              You&apos;ll see new followers, connection requests, and activity here.
            </p>
          </div>
        ) : (
          <>
            {items.map(n => {
              const resolved = n.type === '__resolved__'
              const inline = !resolved && rowInlineAction(n)
              const unread = !n.read
              const busy = !!busyRows[n.id]
              const isRequestTile = n.type === 'connection_request'
              return (
                <div
                  key={n.id}
                  onClick={() => {
                    if (!resolved && n.link) router.push(n.link)
                  }}
                  className={`relative flex gap-3 border-b border-hair px-[18px] py-[14px] last:border-b-0 ${
                    unread ? 'bg-card2' : 'bg-transparent'
                  } ${!resolved && n.link ? 'cursor-pointer' : ''}`}
                >
                  {unread && (
                    <span className="absolute left-[6px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-brandfuchsia" />
                  )}

                  {n.actor_avatar_url ? (
                    <span
                      className="h-9 w-9 flex-none rounded-full bg-cover bg-center"
                      style={{ backgroundImage: `url('${n.actor_avatar_url}')` }}
                    />
                  ) : (
                    <span
                      className={`flex h-9 w-9 flex-none items-center justify-center rounded-[10px] ${
                        isRequestTile
                          ? 'bg-gradient-to-br from-brandindigo/20 to-brandfuchsia/20 text-brandindigo'
                          : 'bg-card2 text-lav'
                      }`}
                    >
                      <TypeIcon name={resolved ? 'check' : iconFor(n)} className="h-[18px] w-[18px]" />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-white">{n.title}</p>
                    {n.body && (
                      <p className="mt-[2px] line-clamp-2 text-[13px] font-medium text-lavdim">{n.body}</p>
                    )}
                    <p className="mt-[3px] text-[12px] text-lavdim">{timeAgo(n.created_at)}</p>

                    {inline && (
                      <div className="mt-[10px] flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={e => {
                            e.stopPropagation()
                            respond(n, 'accept')
                          }}
                          className="flex h-9 items-center rounded-[9px] bg-grad px-[14px] text-[13px] font-bold text-white disabled:opacity-50"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={e => {
                            e.stopPropagation()
                            respond(n, 'decline')
                          }}
                          className="flex h-9 items-center rounded-[9px] border border-hairstrong bg-card px-[14px] text-[13px] font-bold text-white disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            <div ref={sentinelRef} className="h-1" />
            {loadingMore && (
              <div className="px-[18px] py-3 text-center text-[13px] text-lavdim">Loading…</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
