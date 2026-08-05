'use client'

import { useState } from 'react'
import { BUYER_THEME_COOKIE } from '@/lib/buyers/theme'

// ─── ThemeToggle ────────────────────────────────────────────────────────
// Per-buyer light/dark control mounted inside BuyerTopNav. LIGHT is the
// buyer-portal default; this control is opt-in-to-dark only (22-03).
// On click it flips two things:
//  1. BUYER_THEME_COOKIE -- so the server-rendered layout reads the
//     buyer's choice on the NEXT request (readBuyerTheme, no flash), and
//  2. the `data-theme` attribute on the closest `.fnbl` wrapper -- so the
//     switch is instant on the CURRENT page without a reload.
export function ThemeToggle({ theme }: { theme: 'light' | 'dark' }) {
  const [current, setCurrent] = useState<'light' | 'dark'>(theme)

  function toggle() {
    const next = current === 'dark' ? 'light' : 'dark'
    setCurrent(next)
    document.cookie = `${BUYER_THEME_COOKIE}=${next}; path=/; max-age=31536000`
    const wrapper = document.querySelector('.fnbl')
    if (wrapper) wrapper.setAttribute('data-theme', next)
  }

  return (
    <button
      className="themetoggle"
      type="button"
      onClick={toggle}
      aria-label={current === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {current === 'dark' ? (
        <svg className="icn" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg className="icn" viewBox="0 0 24 24">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  )
}
