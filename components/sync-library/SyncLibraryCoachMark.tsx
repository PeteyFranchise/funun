'use client'

import { useEffect, useState } from 'react'

// ─── Reusable "newly-unlocked feature" highlight primitive (26-CONTEXT.md) ─
// A per-user, localStorage-backed "seen" flag that drives both a nav "New"
// dot (ArtistNav.tsx) and a one-time coach-mark (this file). Generalized so
// a future gated feature can reuse the same seen-flag mechanics with a
// different `feature`/copy — this module is the ONLY place the read/write/
// broadcast logic lives (T-26-33 — the flag is cosmetic only: it clears a
// dot and dismisses a tooltip, and carries no access-control meaning; the
// server-side hasSyncLibraryAccess gate is the real authority).
//
// Cross-component sync: ArtistNav (mounted once in the persistent artist
// layout) and SyncLibraryCoachMark (mounted only on the hub page) are
// SIBLINGS, not parent/child, so a localStorage write in one does not
// automatically re-render the other. A same-tab CustomEvent broadcast on
// every write lets any other mounted consumer of the same key react
// instantly, without waiting for a full remount or a second tab's
// `storage` event (which never fires in the tab that wrote it).
const SEEN_EVENT = 'funun:newly-unlocked-seen'

/** Builds the per-user, per-feature localStorage key (e.g. `funun-synclib-seen-<userId>`). */
export function newFeatureSeenKey(feature: string, userId: string): string {
  return `funun-${feature}-seen-${userId}`
}

/** SSR-safe read — always false outside the browser. */
export function readSeenFlag(key: string): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(key) === 'true'
}

/** Marks `key` permanently seen and notifies any other mounted consumer of the same key (same tab). */
export function markFeatureSeen(key: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, 'true')
  window.dispatchEvent(new CustomEvent(SEEN_EVENT, { detail: { key } }))
}

/**
 * Generic hook: tracks whether `key` has been seen, reacting to same-tab
 * writes from ANY consumer of the same key (including a different mounted
 * component) via the CustomEvent broadcast above. Read-only — does not
 * itself mark the flag seen; pass `null` to disable (e.g. userId not yet
 * resolved). Reusable for a future gated feature by passing a different key.
 */
export function useNewFeatureSeen(key: string | null): boolean {
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    if (!key) return
    setSeen(readSeenFlag(key))
    function onSeen(e: Event) {
      const detail = (e as CustomEvent<{ key: string }>).detail
      if (detail?.key === key) setSeen(true)
    }
    window.addEventListener(SEEN_EVENT, onSeen)
    return () => window.removeEventListener(SEEN_EVENT, onSeen)
  }, [key])

  return seen
}

// Mirrors ArtistNav.tsx's own nav-rail layout constants (DEFAULT_WIDTH /
// STORAGE_KEY_WIDTH / STORAGE_KEY_COLLAPSED) so this tooltip lands next to
// the actual Sync Library nav item without a hard import dependency
// between these two client components. If ArtistNav's rail sizing ever
// changes, update both.
const NAV_STORAGE_KEY_WIDTH = 'funun-nav-width'
const NAV_STORAGE_KEY_COLLAPSED = 'funun-nav-collapsed'
const NAV_COLLAPSED_WIDTH = 68
const NAV_DEFAULT_WIDTH = 252
// Approximate vertical offset of the Sync Library row (5th item: Sound
// Vault, Contract Locker, Split Sheets, Deals, Sync Library) — header
// block + workspace label + 4 preceding ~48px rows.
const SYNC_LIBRARY_ROW_TOP = 260

/**
 * One-time, nav-anchored coach-mark shown on first arrival at the Sync
 * Library hub (26-UI-SPEC.md "New-feature highlight"). Mounted directly on
 * the hub page (app/(artist)/sync-library/page.tsx) — mounting HERE (not in
 * ArtistNav) is what marks the "first visit" moment, which is also what
 * clears the nav's "New" dot (via the CustomEvent broadcast above), even if
 * the artist never clicks "Got it".
 */
export function SyncLibraryCoachMark({ userId }: { userId: string }) {
  const key = newFeatureSeenKey('synclib', userId)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const alreadySeen = readSeenFlag(key)
    if (!alreadySeen) setShow(true)
    // Idempotent — also the "first visit" event that clears the nav dot.
    markFeatureSeen(key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [navWidth, setNavWidth] = useState(NAV_DEFAULT_WIDTH)
  useEffect(() => {
    const collapsed = window.localStorage.getItem(NAV_STORAGE_KEY_COLLAPSED) === 'true'
    const storedWidth = Number(window.localStorage.getItem(NAV_STORAGE_KEY_WIDTH))
    setNavWidth(collapsed ? NAV_COLLAPSED_WIDTH : storedWidth || NAV_DEFAULT_WIDTH)
  }, [])

  if (!show) return null

  return (
    <div
      className="fixed z-50 w-[280px] rounded-xl border border-hairstrong bg-card2 p-4 shadow-xl"
      style={{ left: navWidth + 16, top: SYNC_LIBRARY_ROW_TOP }}
      role="dialog"
      aria-label="Your Sync Library is live"
    >
      <p className="text-[15px] font-semibold text-white">Your Sync Library is live</p>
      <p className="mt-1.5 text-[13px] text-lav">
        Manage admitted songs, view your signed agreement, and submit more songs from here.
      </p>
      <button
        type="button"
        onClick={() => setShow(false)}
        className="mt-3 rounded-lg bg-grad px-3 py-1.5 text-[13px] font-semibold text-white shadow-cta transition hover:opacity-90"
      >
        Got it
      </button>
    </div>
  )
}
