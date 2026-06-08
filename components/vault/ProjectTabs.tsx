'use client'

import { useState } from 'react'

type TabKey = 'readiness' | 'contents' | 'tools'

/**
 * Client tab shell for the project detail page. The three panels are
 * server-rendered and passed in as nodes; we keep all three mounted and
 * toggle visibility so in-progress form state survives tab switches.
 */
export function ProjectTabs({
  readiness,
  contents,
  tools,
  counts,
}: {
  readiness: React.ReactNode
  contents: React.ReactNode
  tools: React.ReactNode
  counts: { readiness: string; contents: number; tools: number }
}) {
  const [active, setActive] = useState<TabKey>('readiness')

  const tabs: { key: TabKey; label: string; badge: string | number }[] = [
    { key: 'readiness', label: 'Readiness', badge: counts.readiness },
    { key: 'contents', label: 'Contents', badge: counts.contents },
    { key: 'tools', label: 'Tools', badge: counts.tools },
  ]

  return (
    <div>
      <div role="tablist" className="flex gap-1 border-b border-white/10">
        {tabs.map(t => {
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
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs ${
                  on ? 'bg-white/15 text-white' : 'bg-white/5 text-white/40'
                }`}
              >
                {t.badge}
              </span>
              {on && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-white" />}
            </button>
          )
        })}
      </div>

      <div className="pt-6">
        <div className={active === 'readiness' ? '' : 'hidden'}>{readiness}</div>
        <div className={active === 'contents' ? '' : 'hidden'}>{contents}</div>
        <div className={active === 'tools' ? '' : 'hidden'}>{tools}</div>
      </div>
    </div>
  )
}
