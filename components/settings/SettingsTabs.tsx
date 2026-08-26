'use client'

// ── The artist Settings tab bar ─────────────────────────────────────────
// Rendered by app/(artist)/settings/layout.tsx, so it appears on all three
// settings routes. Besides splitting a long page, this is what makes
// /settings/payouts reachable: that route already existed and connects the
// Stripe account Funūn pays sync-deal net into, and nothing anywhere in the
// app linked to it.
//
// These are real <Link> anchors with real hrefs, deliberately — the three
// routes are meant to be copyable, bookmarkable, and cmd-clickable, which a
// button-and-router-push tab bar would quietly take away.

import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'
import { SETTINGS_TABS } from '@/lib/profile/settings-form'

export function SettingsTabs() {
  // Returns null on /settings, 'profile' on /settings/profile, 'payouts' on
  // /settings/payouts. Do NOT swap this for a usePathname() prefix test —
  // '/settings' prefixes all three routes and would light up every tab.
  const segment = useSelectedLayoutSegment()

  return (
    <nav className="mt-6 flex items-center gap-1 border-b border-white/10">
      {SETTINGS_TABS.map(tab => {
        const active = tab.segment === segment
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={[
              '-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold transition',
              active
                ? 'border-lav text-white'
                : 'border-transparent text-white/40 hover:text-white/70',
            ].join(' ')}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
