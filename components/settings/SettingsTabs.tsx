'use client'

// ── The artist Settings tab bar, with save-on-switch ────────────────────
// Rendered by app/(artist)/settings/layout.tsx, so it appears on all three
// settings routes. Besides splitting a long page, this is what makes
// /settings/payouts reachable: that route already existed and connects the
// Stripe account Funūn pays sync-deal net into, and nothing anywhere in the
// app linked to it.
//
// These are real <Link> anchors with real hrefs, deliberately — the three
// routes are meant to be copyable, bookmarkable, and cmd-clickable, which a
// button-and-router-push tab bar would quietly take away. The click guard
// below bails out of interception entirely for modified and non-primary
// clicks so the browser keeps doing its normal thing with them.
//
// Switching tabs SAVES first. The owner chose that over a "you have unsaved
// changes" dialog, which means the failure path must not navigate: if the
// write fails, the artist has to still be looking at the fields holding
// their values, with an error they can retry. saveThenNavigate owns that
// rule; this component only renders what it reports.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSelectedLayoutSegment } from 'next/navigation'
import { SETTINGS_TABS, saveThenNavigate, type SettingsTabId } from '@/lib/profile/settings-form'
import { useSettingsFormOptional } from '@/components/settings/SettingsFormProvider'

export function SettingsTabs() {
  const router = useRouter()
  // Returns null on /settings, 'profile' on /settings/profile, 'payouts' on
  // /settings/payouts. Do NOT swap this for a usePathname() prefix test —
  // '/settings' prefixes all three routes and would light up every tab.
  const segment = useSelectedLayoutSegment()
  const settings = useSettingsFormOptional()

  const activeTab: SettingsTabId =
    SETTINGS_TABS.find(t => t.segment === segment)?.id ?? 'rights'

  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 2500)
    return () => clearTimeout(t)
  }, [saved])

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>, href: string, id: SettingsTabId) {
    // Let the browser handle anything that isn't a plain left click: this is
    // what keeps cmd/ctrl-click-to-new-tab and copy-link-address working,
    // which is the entire reason these tabs are anchors.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (id === activeTab) return

    e.preventDefault()

    // A second click while a save is in flight is ignored, not queued —
    // queueing would issue a second write of the same fields.
    if (pendingHref) return

    setPendingHref(href)
    setError(null)
    setSaved(false)

    void (async () => {
      const savers = settings ? settings.saversForTab(activeTab) : []
      const result = await saveThenNavigate(savers, () => router.push(href))
      setPendingHref(null)
      // Both affordances come from the returned result rather than separate
      // local booleans — the pure function already reports whether it wrote,
      // whether it navigated, and why it stopped, and mirroring that into
      // component state is how the two drift apart.
      setError(result.error)
      setSaved(result.navigated && result.writes > 0)
    })()
  }

  const busy = pendingHref !== null

  return (
    <div className="mt-6">
      <nav className="flex items-center gap-1 border-b border-white/10">
        {SETTINGS_TABS.map(tab => {
          const active = tab.segment === segment
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              aria-disabled={busy || undefined}
              onClick={e => handleClick(e, tab.href, tab.id)}
              className={[
                '-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold transition',
                active
                  ? 'border-lav text-white'
                  : 'border-transparent text-white/40 hover:text-white/70',
                busy && !active ? 'pointer-events-none opacity-40' : '',
              ].join(' ')}
            >
              {tab.label}
              {pendingHref === tab.href && (
                <span className="ml-2 text-xs font-normal text-white/40">Saving…</span>
              )}
            </Link>
          )
        })}
      </nav>

      {error && (
        <p className="mt-2 text-xs text-rose-300">
          {error} — your changes are still here. Click the tab again to retry.
        </p>
      )}
      {saved && !error && <p className="mt-2 text-xs text-emerald-300">Saved</p>}
    </div>
  )
}
