'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { slaState } from '@/lib/playbook/operational-v1'
export type PlaybookInboxCard = {
  id: string
  kind: string
  title: string
  context: string
  href: string
  dueAt: string | null
  complete: boolean
  severity: number | null
  roomId: string | null
  openedAt: string | null
}
const FILTERS = [
  'all',
  'overdue',
  'due_soon',
  'reading',
  'learning',
  'feedback',
  'workflow',
  'exception',
  'incident',
  'simulation',
] as const
export function PlaybookInbox({ items }: { items: PlaybookInboxCard[] }) {
  const [filter, setFilter] = useState<string>('all')
  const now = useMemo(() => new Date(), [])
  const visible = items.filter(
    (item) =>
      filter === 'all' || filter === item.kind || filter === slaState(item, now)
  )
  return (
    <div className="mt-6">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Filter Playbook work"
      >
        {FILTERS.map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-full border px-3 py-1.5 text-xs capitalize ${filter === value ? 'border-[color:var(--indigo)] bg-[color:var(--panel-2)]' : 'border-[color:var(--border)]'}`}
          >
            {value.replace('_', ' ')}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {visible.map((item) => {
          const state = slaState(item, now)
          return (
            <Link
              key={`${item.kind}:${item.id}`}
              href={item.href}
              className="flex items-start gap-4 rounded-xl border border-[color:var(--border)] p-4 transition hover:bg-[color:var(--panel)]"
            >
              <span
                className={`mt-1 h-2.5 w-2.5 rounded-full ${state === 'overdue' ? 'bg-red-400' : state === 'due_soon' ? 'bg-amber-300' : item.severity === 1 ? 'bg-red-500' : 'bg-[color:var(--indigo)]'}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap justify-between gap-2">
                  <h2 className="font-bold">{item.title}</h2>
                  <span className="text-[10px] uppercase text-[color:var(--ink-3)]">
                    {item.kind.replace('_', ' ')} · {state.replace('_', ' ')}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[color:var(--ink-3)]">
                  {item.context}
                </p>
                {item.dueAt && (
                  <p className="mt-1 text-xs text-[color:var(--ink-3)]">
                    Due {new Date(item.dueAt).toLocaleString()}
                  </p>
                )}
              </div>
            </Link>
          )
        })}
        {visible.length === 0 && (
          <p className="rounded-xl border border-dashed border-[color:var(--border)] p-10 text-center text-sm text-[color:var(--ink-3)]">
            Nothing in this view.
          </p>
        )}
      </div>
    </div>
  )
}
