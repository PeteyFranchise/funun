'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import {
  buildRoomPresenceViews,
  PRESENCE_HEARTBEAT_MS,
  roomActivityLabel,
  type RoomActivity,
  type RoomPresencePerson,
  type RoomPresenceView,
} from '@/lib/catalogue/room-presence'

type ConnectionState = 'connecting' | 'live' | 'offline'

export type WriterRoomLiveHandle = {
  broadcast: (event: 'lock_changed' | 'lyric_saved', payload: { blockId: string }) => Promise<boolean>
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?'
}
export const WriterRoomPresence = forwardRef<WriterRoomLiveHandle, {
  workId: string
  viewer: RoomPresencePerson
  people: RoomPresencePerson[]
  activity: RoomActivity
  onLiveHint?: (event: 'lock_changed' | 'lyric_saved', payload: unknown) => void
  onResync?: () => void
}>(function WriterRoomPresence({
  workId,
  viewer,
  people,
  activity,
  onLiveHint,
  onResync,
}, ref) {
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [present, setPresent] = useState<RoomPresenceView[]>([{ ...viewer, activity }])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const activityRef = useRef(activity)
  const liveHintRef = useRef(onLiveHint)
  const resyncRef = useRef(onResync)

  useEffect(() => {
    liveHintRef.current = onLiveHint
    resyncRef.current = onResync
  }, [onLiveHint, onResync])

  useImperativeHandle(ref, () => ({
    async broadcast(event, payload) {
      const channel = channelRef.current
      if (!channel) return false
      const result = await channel.send({ type: 'broadcast', event, payload })
      return result === 'ok'
    },
  }), [])

  useEffect(() => {
    activityRef.current = activity
    if (channelRef.current && document.visibilityState === 'visible') {
      void channelRef.current.track({
        kind: activity.kind,
        label: activity.label,
        updated_at: new Date().toISOString(),
      })
    }
  }, [activity])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`writers-room:${workId}:presence`, {
      config: {
        private: true,
        presence: { key: viewer.userId },
        broadcast: { ack: true, self: false },
      },
    })
    channelRef.current = channel

    const publish = () => {
      const current = activityRef.current
      void channel.track({
        kind: current.kind,
        label: current.label,
        updated_at: new Date().toISOString(),
      })
    }
    const sync = () => {
      const views = buildRoomPresenceViews(channel.presenceState() as Record<string, unknown[]>, people)
      setPresent(views.length > 0 ? views : [{ ...viewer, activity: activityRef.current }])
    }

    channel.on('presence', { event: 'sync' }, sync)
    channel.on('broadcast', { event: 'lock_changed' }, ({ payload }) => {
      liveHintRef.current?.('lock_changed', payload)
    })
    channel.on('broadcast', { event: 'lyric_saved' }, ({ payload }) => {
      liveHintRef.current?.('lyric_saved', payload)
    })

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setConnection('offline')
        return
      }
      await supabase.realtime.setAuth(data.session.access_token)
      channel.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          setConnection('live')
          publish()
          resyncRef.current?.()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection('offline')
        }
      })
    })

    const onVisibility = () => {
      if (document.visibilityState === 'visible') publish()
      else void channel.untrack()
    }
    document.addEventListener('visibilitychange', onVisibility)
    const heartbeatId = setInterval(() => {
      if (document.visibilityState === 'visible') publish()
    }, PRESENCE_HEARTBEAT_MS)
    const staleSweepId = setInterval(sync, 5_000)

    return () => {
      channelRef.current = null
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(heartbeatId)
      clearInterval(staleSweepId)
      void channel.untrack()
      void supabase.removeChannel(channel)
    }
  }, [people, viewer, workId])

  return (
    <section aria-label="Writer's Room presence" className="mt-4 rounded-[12px] border border-hair bg-card/70 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[12px] font-semibold text-white">In the Writer&apos;s Room</p>
          <p className="mt-0.5 text-[10px] text-lavdim">Creative context only — no keystrokes or productivity tracking.</p>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] text-lavdim">
          <span className={`h-1.5 w-1.5 rounded-full ${connection === 'live' ? 'bg-emerald-400' : 'bg-lavdim/50'}`} />
          {connection === 'live' ? 'Live' : connection === 'offline' ? 'Reconnecting…' : 'Connecting…'}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {present.map(person => (
          <div key={person.userId} className="flex items-center gap-2 rounded-full border border-hairstrong bg-card2 px-2 py-1.5">
            {person.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={person.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-lav/10 text-[9px] font-bold text-lav">
                {initials(person.name)}
              </span>
            )}
            <span>
              <span className="block text-[10px] font-semibold leading-tight text-white">
                {person.name}{person.isViewer ? ' (you)' : ''}
              </span>
              <span className="block text-[9px] leading-tight text-lavdim">{roomActivityLabel(person.activity)}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
})
