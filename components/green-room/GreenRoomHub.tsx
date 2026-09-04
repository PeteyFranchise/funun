'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GreenRoomFeed } from '@/components/green-room/GreenRoomFeed'
import type { GreenRoomView } from '@/lib/green-room/views'

const PeopleSearch = dynamic(
  () => import('@/components/green-room/PeopleSearch').then(module => module.PeopleSearch),
  { loading: () => <LoadingCard label="Opening member discovery…" /> }
)

const NetworkTab = dynamic(
  () => import('@/components/network/NetworkTab').then(module => module.NetworkTab),
  { loading: () => <LoadingCard label="Loading your network…" /> }
)

const PRIMARY_VIEWS: Array<{ value: GreenRoomView; label: string; hint: string }> = [
  { value: 'room', label: 'The Room', hint: 'Conversation and opportunities' },
  { value: 'people', label: 'Find People', hint: 'Discover the right members' },
  { value: 'network', label: 'My Network', hint: 'Relationships and requests' },
]

export function GreenRoomHub({ initialView }: { initialView: GreenRoomView }) {
  const router = useRouter()

  function openView(nextView: GreenRoomView) {
    router.push(nextView === 'room' ? '/green-room' : `/green-room?view=${nextView}`, { scroll: false })
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
      <header className="overflow-hidden rounded-[28px] border border-white/10 bg-black/30 p-6 shadow-[0_24px_90px_rgba(0,0,0,.35)] backdrop-blur">
        <p className="text-xs font-bold uppercase tracking-[.24em] text-emerald-300/80">The Green Room</p>
        <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-[-.04em] text-white md:text-5xl">
          Find the room where your next connection is already talking.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
          Share what you&apos;re making, find the people you need, and keep your creative relationships close.
        </p>
      </header>

      <nav
        aria-label="Green Room spaces"
        className="mt-5 flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-black/25 p-2"
      >
        {PRIMARY_VIEWS.map(item => (
          <Link
            key={item.value}
            href={item.value === 'room' ? '/green-room' : `/green-room?view=${item.value}`}
            scroll={false}
            aria-current={initialView === item.value ? 'page' : undefined}
            className={[
              'min-w-48 flex-1 rounded-xl px-4 py-3 text-left transition',
              initialView === item.value ? 'bg-white text-black' : 'bg-white/[0.03] text-white hover:bg-white/[0.08]',
            ].join(' ')}
          >
            <span className="block text-sm font-black">{item.label}</span>
            <span className={['mt-1 block text-[11px]', initialView === item.value ? 'text-black/55' : 'text-white/38'].join(' ')}>
              {item.hint}
            </span>
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {initialView === 'room' ? <GreenRoomFeed onFindPeople={() => openView('people')} /> : null}
        {initialView === 'people' ? (
          <section aria-labelledby="find-people-heading" className="mx-auto max-w-5xl">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-300/75">Member discovery</p>
              <h2 id="find-people-heading" className="mt-2 text-3xl font-black tracking-[-.03em] text-white">
                Find the people who fit the work.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
                Search by role, genre, location, availability, or where someone sits in your network.
              </p>
            </div>
            <PeopleSearch fullWidth />
          </section>
        ) : null}
        {initialView === 'network' ? <NetworkTab embedded /> : null}
      </div>
    </div>
  )
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-sm text-white/55">
      {label}
    </div>
  )
}
