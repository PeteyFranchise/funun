'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── ProfilePresenceDot (PRESENCE-01, D-22) ────────────────────────────
// Read-only subscriber to the shared `presence-global` Realtime Presence
// channel that `PresenceTracker` (nav) tracks into. This component never
// calls `track()` itself — only the current authenticated session's
// PresenceTracker does that. Here we join the same channel purely to read
// `presenceState()` and derive whether `targetUserId` currently has an
// entry (i.e. is connected right now).
//
// Honesty rule carried over from the Phase 9 stub: render nothing unless
// we can positively confirm live presence. A stale `last_seen_at` value
// must never produce this pill — that column only ever drives the
// "Active X ago" bucket text elsewhere (DM header / docked widget, Plan 05).
export function ProfilePresenceDot({ targetUserId }: { targetUserId: string }) {
  const [online, setOnline] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel('presence-global', {
      config: { presence: { key: '' } },
    })

    const syncFromState = () => {
      const state = channel.presenceState()
      setOnline(Boolean(state[targetUserId]?.length))
    }

    channel
      .on('presence', { event: 'sync' }, syncFromState)
      .on('presence', { event: 'join' }, syncFromState)
      .on('presence', { event: 'leave' }, syncFromState)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [targetUserId])

  if (!online) return null
  return (
    <div
      data-testid="presence-pill"
      className="absolute bottom-3 right-3 flex items-center gap-[6px] rounded-full border border-hairstrong bg-ink px-[9px] py-1 text-[12px] font-bold text-emerald-400"
    >
      <span className="h-[7px] w-[7px] rounded-full bg-emerald-400" />
      Online
    </div>
  )
}
