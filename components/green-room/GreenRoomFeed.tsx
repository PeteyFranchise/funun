'use client'

import { useEffect, useMemo, useState } from 'react'
import { GreenRoomComposer } from '@/components/green-room/GreenRoomComposer'
import { FeedCard } from '@/components/green-room/FeedCard'
import { subscribeToGreenRoomFeedUpdates } from '@/lib/green-room/realtime'
import { createClient } from '@/lib/supabase/client'
import type { GreenRoomFeedCard } from '@/lib/green-room/feed-query'
import type { GreenRoomTab } from '@/lib/green-room/feed'

const TABS: Array<{ value: GreenRoomTab; label: string; hint: string }> = [
  { value: 'for_you', label: 'For You', hint: 'Network signals, fresh posts, and discovery' },
  { value: 'following', label: 'Following', hint: 'People you follow or connect with' },
  { value: 'discover', label: 'Discover', hint: 'Outside your graph, still relevant' },
  { value: 'opportunities', label: 'Opportunities', hint: 'Collabs, needs, and open calls' },
]

export function GreenRoomFeed() {
  const [tab, setTab] = useState<GreenRoomTab>('for_you')
  const [cards, setCards] = useState<GreenRoomFeedCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [pendingActivityCount, setPendingActivityCount] = useState(0)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/green-room/feed?tab=${tab}`, { cache: 'no-store' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Could not load the Green Room feed')
        if (!cancelled) {
          setCards(data.cards ?? [])
          setPendingActivityCount(0)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the Green Room feed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [tab, refreshKey])

  useEffect(() => {
    setPendingActivityCount(0)
    return subscribeToGreenRoomFeedUpdates(supabase, tab, () => {
      setPendingActivityCount(count => Math.min(99, count + 1))
    })
  }, [supabase, tab])

  function refresh() {
    setRefreshKey(key => key + 1)
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
      <section className="min-w-0">
        <header className="overflow-hidden rounded-[28px] border border-white/10 bg-black/30 p-6 shadow-[0_24px_90px_rgba(0,0,0,.35)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.24em] text-emerald-300/80">The Green Room</p>
              <h1 className="mt-3 text-4xl font-black tracking-[-.04em] text-white md:text-5xl">
                Find the room where your next connection is already talking.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
                Follow releases, ask questions, post opportunities, and discover the people shaping your next move.
              </p>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white hover:border-emerald-300/40 hover:bg-emerald-300/10"
            >
              Refresh feed
            </button>
          </div>
        </header>

        <div className="mt-5">
          <GreenRoomComposer onPosted={refresh} />
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-black/25 p-2">
          {TABS.map(item => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={[
                'min-w-36 rounded-xl px-4 py-3 text-left transition',
                tab === item.value
                  ? 'bg-white text-black'
                  : 'bg-white/[0.03] text-white hover:bg-white/[0.08]',
              ].join(' ')}
            >
              <span className="block text-sm font-black">{item.label}</span>
              <span className={['mt-1 block text-[11px]', tab === item.value ? 'text-black/55' : 'text-white/38'].join(' ')}>
                {item.hint}
              </span>
            </button>
          ))}
        </div>

        {pendingActivityCount > 0 && (
          <div className="sticky top-[88px] z-20 mt-4 flex justify-center">
            <button
              type="button"
              onClick={refresh}
              data-testid="feed-new-updates"
              className="rounded-full border border-emerald-300/30 bg-emerald-300 px-5 py-2 text-sm font-black text-black shadow-[0_12px_40px_rgba(52,211,153,.28)] transition hover:-translate-y-0.5"
            >
              {pendingActivityCount === 1 ? '1 new update' : `${pendingActivityCount} new updates`} · Show latest
            </button>
          </div>
        )}

        <div className="mt-5 space-y-4">
          {loading && (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-sm text-white/55">
              Loading the room...
            </div>
          )}
          {error && (
            <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-5 text-sm text-rose-100">
              {error}
            </div>
          )}
          {!loading && !error && cards.length === 0 && (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
              <p className="text-lg font-black text-white">The room is quiet on this tab.</p>
              <p className="mt-2 text-sm text-white/50">
                Try another tab, follow more members, or start the conversation with a post.
              </p>
            </div>
          )}
          {cards.map(card => (
            <FeedCard key={`${card.kind}-${card.id}`} card={card} onChanged={refresh} />
          ))}
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-lavdim">Room Rules</p>
          <ul className="mt-3 space-y-2 text-sm text-white/60">
            <li>Share context, not noise.</li>
            <li>Keep opportunities specific and respectful.</li>
            <li>Visibility and blocks are enforced server-side.</li>
          </ul>
        </div>
        <div className="rounded-[24px] border border-emerald-300/20 bg-emerald-300/[0.06] p-5">
          <p className="text-sm font-black text-white">Monetization runway</p>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Featured and sponsored cards are labeled in-feed now, without shipping self-serve ad buying or targeting.
          </p>
        </div>
      </aside>
    </div>
  )
}
