'use client'

import { useState } from 'react'
import { VaultProjectCard, type VaultCard } from './VaultProjectCard'

type Lane = 'all' | 'live' | 'scheduled' | 'draft'

const TABS: { key: Lane; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'draft', label: 'Drafts' },
]

export function VaultBrowser({ cards }: { cards: VaultCard[] }) {
  const [tab, setTab] = useState<Lane>('all')

  const count = (key: Lane) => (key === 'all' ? cards.length : cards.filter(c => c.lane === key).length)
  const shown = tab === 'all' ? cards : cards.filter(c => c.lane === tab)

  return (
    <>
      <div className="mb-6 flex gap-2">
        {TABS.map(t => {
          const on = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                'rounded-[9px] border px-4 py-[9px] text-[14px] font-semibold transition',
                on
                  ? 'border-hairstrong bg-card2 text-white'
                  : 'border-transparent text-lavdim hover:text-white',
              ].join(' ')}
            >
              {t.label}
              <span className="ml-[6px] font-semibold text-lavdim">{count(t.key)}</span>
            </button>
          )
        })}
      </div>

      {shown.length === 0 ? (
        <p className="text-[14px] text-lavdim">Nothing here yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(card => (
            <VaultProjectCard key={card.id} card={card} />
          ))}
        </div>
      )}
    </>
  )
}
