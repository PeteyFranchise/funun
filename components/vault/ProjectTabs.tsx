'use client'

import { useState } from 'react'
import Link from 'next/link'

export type TabItem = {
  key: string
  label: string
  badge?: string | number
  content: React.ReactNode
}

/**
 * Client tab shell. Panels are server-rendered and passed in as nodes; we
 * keep all of them mounted and toggle visibility so in-progress form state
 * survives switching tabs.
 */
export function ProjectTabs({ items, playbackHref }: { items: TabItem[]; playbackHref?: string }) {
  const [active, setActive] = useState<string>(items[0]?.key)

  return (
    <div>
      <div role="tablist" className="flex items-center gap-1 border-b border-white/10">
        {items.map(t => {
          const on = active === t.key
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.key)}
              className={`relative -mb-px flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition ${
                on ? 'text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              {t.label}
              {t.badge !== undefined && t.badge !== '' && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs ${
                    on ? 'bg-white/15 text-white' : 'bg-white/5 text-white/40'
                  }`}
                >
                  {t.badge}
                </span>
              )}
              {on && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-white" />}
            </button>
          )
        })}
        {playbackHref && (
          <Link
            href={playbackHref}
            className="ml-auto px-4 py-2.5 text-sm font-medium text-white/50 hover:text-white/80 transition"
          >
            Playback room →
          </Link>
        )}
      </div>

      <div className="pt-6">
        {items.map(t => (
          <div key={t.key} className={active === t.key ? '' : 'hidden'}>
            {t.content}
          </div>
        ))}
      </div>
    </div>
  )
}
