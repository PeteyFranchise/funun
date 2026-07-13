'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── PresenceTracker (PRESENCE-01/02, RESEARCH Pattern 1, Pitfall 1/2/4) ──
// Mount-only effect component (renders nothing) holding the single
// presence-global Realtime channel for the authenticated session. Mounted
// once at the layout root (app/(artist)/layout.tsx) — one channel, one
// cleanup per session, avoiding the connection-budget churn of mounting a
// presence channel per page or per surface (Pitfall 1/4). The presence key
// is user-scoped (never crypto.randomUUID) so multiple tabs for the same
// user coalesce into one presence entry instead of producing ghost users
// (Pitfall 2).
//
// Also fires a throttled heartbeat POST to /api/presence/heartbeat so
// last_seen_at persists for the D-21 offline-bucket display — Realtime
// Presence alone is ephemeral (connected-now only) and cannot answer
// "Active X ago" once a tab disconnects. The API route (Plan 03) throttles
// the actual DB write; this component only controls call cadence.

const HEARTBEAT_INTERVAL_MS = 50_000

export function PresenceTracker({ userId }: { userId: string }) {
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel('presence-global', {
      config: { presence: { key: userId } },
    })

    const track = () => {
      channel.track({ online_at: new Date().toISOString() })
    }
    const heartbeat = () => {
      fetch('/api/presence/heartbeat', { method: 'POST' }).catch(() => {})
    }

    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') track()
    })

    // Fire one heartbeat immediately on mount.
    heartbeat()

    // visibilitychange re-track (RESEARCH Pattern 1 — required): re-track
    // and heartbeat on becoming visible; untrack (but do not tear down the
    // channel itself) while hidden.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        track()
        heartbeat()
      } else {
        channel.untrack()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    // Throttled heartbeat while visible, on a <=60s cadence (D-21 offline
    // buckets need last_seen_at kept fresh without hammering the API on
    // every tick).
    const heartbeatId = setInterval(() => {
      if (document.visibilityState === 'visible') heartbeat()
    }, HEARTBEAT_INTERVAL_MS)

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(heartbeatId)
    }
  }, [userId])

  return null
}
