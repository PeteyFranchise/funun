'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { ReadingState } from '@/lib/playbook/assignments'
import {
  parsePlaybookRecoveryKey,
  readPlaybookRecovery,
  removePlaybookRecovery,
  type PlaybookRecoveryRecord,
} from '@/lib/playbook/draft-recovery'
import { reviewTiming, type MyPlaybookEntry } from '@/lib/playbook/my-workspace'
import type { ChangeBroadcastItem } from '@/lib/playbook/change-broadcasts'

type RoomOption = { id: string; key: string; label: string }
type SubgroupOption = { id: string; label: string }

export type MyReadingItem = {
  assignmentId: string
  title: string
  roomKey: string
  roomLabel: string
  slug: string
  dueAt: string | null
  state: Exclude<ReadingState, 'complete' | 'retired'>
}

export type MyChangeRequest = {
  entry: MyPlaybookEntry
  openCount: number
  addressedCount: number
  latestAt: string
}

type LocalDraft = {
  storageKey: string
  roomKey: string
  roomLabel: string
  record: PlaybookRecoveryRecord
}

function formatDate(value: string | number | null): string {
  if (value === null) return 'Not scheduled'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function EmptyState({ children }: { children: string }) {
  return <p className="rounded-xl border border-dashed border-[color:var(--border)] px-5 py-8 text-center text-[12px] text-[color:var(--ink-3)]">{children}</p>
}

function SectionHeading({ title, caption, count }: { title: string; caption: string; count: number }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[16px] font-extrabold text-[color:var(--ink)]">{title}</h2>
        <p className="mt-0.5 text-[11px] text-[color:var(--ink-3)]">{caption}</p>
      </div>
      <span className="rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[10px] font-bold text-[color:var(--ink-3)]">{count}</span>
    </div>
  )
}

function EntryLink({ item, room, subgroup, preferRoom = false }: { item: MyPlaybookEntry; room?: RoomOption; subgroup?: SubgroupOption; preferRoom?: boolean }) {
  const roomHref = room ? `/admin/playbook/${room.key}` : '/admin/playbook'
  const href = !preferRoom && room && item.slug && item.status === 'published'
    ? `${roomHref}/${item.slug}`
    : roomHref
  return (
    <Link href={href} className="block rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4 transition hover:border-[color:var(--indigo)]">
      <p className="text-[10px] font-bold uppercase tracking-[.1em] text-[color:var(--ink-3)]">
        {room?.label ?? 'Playbook'}{subgroup ? ` · ${subgroup.label}` : ''}
      </p>
      <p className="mt-1 text-[13px] font-extrabold text-[color:var(--ink)]">{item.title}</p>
      <p className="mt-2 text-[10.5px] text-[color:var(--ink-3)]">Revision {item.revision_number} · Updated {formatDate(item.draft_updated_at ?? item.updated_at)}</p>
    </Link>
  )
}

export function MyPlaybookWorkspace({
  viewerId,
  rooms,
  subgroups,
  drafts,
  readings,
  changesRequested,
  reviews,
  recent,
  updates,
  updatesSchemaReady,
}: {
  viewerId: string
  rooms: RoomOption[]
  subgroups: SubgroupOption[]
  drafts: MyPlaybookEntry[]
  readings: MyReadingItem[]
  changesRequested: MyChangeRequest[]
  reviews: MyPlaybookEntry[]
  recent: MyPlaybookEntry[]
  updates: ChangeBroadcastItem[]
  updatesSchemaReady: boolean
}) {
  const [localDrafts, setLocalDrafts] = useState<LocalDraft[]>([])
  const roomByKey = useMemo(() => new Map(rooms.map(room => [room.key.toLowerCase(), room])), [rooms])
  const roomById = useMemo(() => new Map(rooms.map(room => [room.id, room])), [rooms])
  const subgroupById = useMemo(() => new Map(subgroups.map(group => [group.id, group])), [subgroups])
  const now = new Date()

  useEffect(() => {
    const found: LocalDraft[] = []
    try {
      for (let index = 0; index < window.localStorage.length && found.length < 50; index += 1) {
        const storageKey = window.localStorage.key(index)
        if (!storageKey) continue
        const parsed = parsePlaybookRecoveryKey(storageKey, viewerId)
        if (!parsed) continue
        const room = roomByKey.get(parsed.roomKey.toLowerCase())
        if (!room) continue
        const record = readPlaybookRecovery(window.localStorage, storageKey)
        if (record) found.push({ storageKey, roomKey: room.key, roomLabel: room.label, record })
      }
    } catch {
      // The room remains fully usable when private browsing blocks storage.
    }
    found.sort((a, b) => b.record.savedAt - a.record.savedAt)
    setLocalDrafts(found)
  }, [roomByKey, viewerId])

  const discardLocal = (storageKey: string) => {
    if (!window.confirm('Discard this browser-local recovery copy? This cannot be undone.')) return
    if (removePlaybookRecovery(window.localStorage, storageKey)) {
      setLocalDrafts(current => current.filter(item => item.storageKey !== storageKey))
    }
  }

  const summary = [
    ['Continue writing', localDrafts.length + drafts.length],
    ['Assigned reading', readings.length],
    ['Changes requested', changesRequested.length],
    ['Reviews I own', reviews.length],
    ['New updates', updates.length],
    ['Recently published', recent.length],
  ] as const

  return (
    <div className="mt-6 space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {summary.map(([label, count]) => (
          <div key={label} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[.1em] text-[color:var(--ink-3)]">{label}</p>
            <p className="mt-1 text-2xl font-extrabold text-[color:var(--ink)]">{count}</p>
          </div>
        ))}
      </div>

      {updatesSchemaReady && (
        <section>
          <SectionHeading title="New Since Your Last Visit" caption="Internal Playbook changes targeted to you or your teams." count={updates.length} />
          {updates.length === 0 ? <EmptyState>You’re caught up on internal Playbook updates.</EmptyState> : (
            <div className="grid gap-3 lg:grid-cols-2">
              {updates.map(item => (
                <Link key={item.id} href={`/admin/playbook/updates?update=${item.id}#update-${item.id}`} className="rounded-xl border border-[color:var(--indigo)] bg-[color:var(--panel)] p-4 transition hover:bg-[color:var(--panel-2)]">
                  <div className="flex items-center gap-2 text-[9.5px] font-bold uppercase tracking-[.1em] text-[color:var(--indigo)]">
                    <span className="h-2 w-2 rounded-full bg-[color:var(--fuchsia)]" />
                    {item.priority} · {item.roomLabel}
                  </div>
                  <p className="mt-2 text-[13px] font-extrabold text-[color:var(--ink)]">{item.headline}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[color:var(--ink-3)]">{item.change_summary}</p>
                  <p className="mt-2 text-[10px] text-[color:var(--ink-3)]">{item.entryTitle} · Revision {item.revision_number}</p>
                </Link>
              ))}
            </div>
          )}
          {updates.length > 0 && <Link href="/admin/playbook/updates" className="mt-3 inline-flex text-[11.5px] font-bold text-[color:var(--indigo)]">Open all Playbook updates →</Link>}
        </section>
      )}

      <section>
        <SectionHeading title="Continue Writing" caption="Local recovery copies and drafts already saved to Funūn." count={localDrafts.length + drafts.length} />
        {localDrafts.length === 0 && drafts.length === 0 ? <EmptyState>No unfinished Playbook writing was found.</EmptyState> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {localDrafts.map(item => (
              <article key={item.storageKey} className="rounded-xl border border-[color:var(--amber-line)] bg-[color:var(--amber-bg)] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[.1em] text-[color:var(--amber-fg)]">Saved only in this browser</p>
                <h3 className="mt-1 text-[13px] font-extrabold text-[color:var(--ink)]">{item.record.draft.title || 'Untitled entry'}</h3>
                <p className="mt-1 text-[10.5px] text-[color:var(--ink-3)]">{item.roomLabel} · {formatDate(item.record.savedAt)}</p>
                <div className="mt-3 flex gap-2">
                  <Link href={`/admin/playbook/${item.roomKey}`} className="rounded-full border border-[color:var(--amber-line)] px-3 py-1.5 text-[11px] font-bold text-[color:var(--amber-fg)]">Resume in room</Link>
                  <button type="button" onClick={() => discardLocal(item.storageKey)} className="rounded-full border border-[color:var(--border)] px-3 py-1.5 text-[11px] text-[color:var(--ink-3)]">Discard</button>
                </div>
              </article>
            ))}
            {drafts.map(item => <EntryLink key={item.id} item={item} room={roomById.get(item.room_id)} subgroup={item.sub_group_id ? subgroupById.get(item.sub_group_id) : undefined} preferRoom />)}
          </div>
        )}
      </section>

      <section>
        <SectionHeading title="Changes Requested" caption="Clear, persistent reviewer instructions on drafts you authored." count={changesRequested.length} />
        {changesRequested.length === 0 ? <EmptyState>No open changes have been requested from you.</EmptyState> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {changesRequested.map(item => {
              const room = roomById.get(item.entry.room_id)
              return (
                <Link key={item.entry.id} href={room ? `/admin/playbook/${room.key}` : '/admin/playbook'} className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 transition hover:border-amber-400/60">
                  <p className="text-[10px] font-bold uppercase tracking-[.1em] text-amber-400">
                    {item.openCount} open · {item.addressedCount} addressed
                  </p>
                  <p className="mt-1 text-[13px] font-extrabold text-[color:var(--ink)]">{item.entry.title}</p>
                  <p className="mt-2 text-[10.5px] text-[color:var(--ink-3)]">{room?.label ?? 'Playbook'} · Latest note {formatDate(item.latestAt)}</p>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <SectionHeading title="Assigned to Me" caption="Required or recommended reading that still needs your attention." count={readings.length} />
        {readings.length === 0 ? <EmptyState>You’re caught up on assigned reading.</EmptyState> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {readings.slice(0, 6).map(item => (
              <Link key={item.assignmentId} href={`/admin/playbook/${item.roomKey}/${item.slug}`} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4 transition hover:border-[color:var(--indigo)]">
                <p className="text-[10px] font-bold uppercase tracking-[.1em] text-[color:var(--ink-3)]">{item.roomLabel} · {item.state === 'overdue' ? 'Overdue' : item.state === 'optional' ? 'Recommended' : 'Required'}</p>
                <p className="mt-1 text-[13px] font-extrabold text-[color:var(--ink)]">{item.title}</p>
                <p className="mt-2 text-[10.5px] text-[color:var(--ink-3)]">Due {formatDate(item.dueAt)}</p>
              </Link>
            ))}
          </div>
        )}
        {readings.length > 0 && <Link href="/admin/playbook/learning" className="mt-3 inline-flex text-[11.5px] font-bold text-[color:var(--indigo)]">Open all required reading →</Link>}
      </section>

      <section>
        <SectionHeading title="Reviews I Own" caption="Published guidance assigned to you for ongoing review." count={reviews.length} />
        {reviews.length === 0 ? <EmptyState>No published Playbook reviews are assigned to you.</EmptyState> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {reviews.slice(0, 8).map(item => {
              const timing = reviewTiming(item.review_due_at, now)
              const room = roomById.get(item.room_id)
              const href = room
                ? item.slug ? `/admin/playbook/${room.key}/${item.slug}` : `/admin/playbook/${room.key}`
                : '/admin/playbook'
              return (
                <Link key={item.id} href={href} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4 transition hover:border-[color:var(--indigo)]">
                  <p className="text-[10px] font-bold uppercase tracking-[.1em]" style={{ color: timing === 'overdue' ? 'var(--rose-fg)' : timing === 'soon' ? 'var(--amber-fg)' : 'var(--ink-3)' }}>{room?.label ?? 'Playbook'} · {timing === 'overdue' ? 'Review overdue' : timing === 'soon' ? 'Review due soon' : timing === 'scheduled' ? 'Scheduled' : 'Needs a review date'}</p>
                  <p className="mt-1 text-[13px] font-extrabold text-[color:var(--ink)]">{item.title}</p>
                  <p className="mt-2 text-[10.5px] text-[color:var(--ink-3)]">Next review · {formatDate(item.review_due_at)}</p>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <SectionHeading title="Recently Published" caption="The latest approved guidance from rooms you can access." count={recent.length} />
        {recent.length === 0 ? <EmptyState>No published Playbook entries are available yet.</EmptyState> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {recent.map(item => <EntryLink key={item.id} item={item} room={roomById.get(item.room_id)} subgroup={item.sub_group_id ? subgroupById.get(item.sub_group_id) : undefined} />)}
          </div>
        )}
      </section>
    </div>
  )
}
