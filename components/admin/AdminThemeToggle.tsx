'use client'

import { useState } from 'react'
import { ADMIN_THEME_COOKIE } from '@/lib/admin/theme'

// ─── AdminThemeToggle ───────────────────────────────────────────────────
// Per-member light/dark control mounted in the Team Console sidebar
// footer. DARK is the console default; this control is opt-in-to-light
// (25-08, mirrors components/buyer/ThemeToggle.tsx's opt-in-to-dark
// shape). On click it flips two things:
//  1. ADMIN_THEME_COOKIE -- so the server-rendered layout reads the
//     member's choice on the NEXT request (readAdminTheme, no flash), and
//  2. the `data-theme` attribute on the closest `.fncon` wrapper -- so the
//     switch is instant on the CURRENT page without a reload.
export function AdminThemeToggle({ theme }: { theme: 'light' | 'dark' }) {
  const [current, setCurrent] = useState<'light' | 'dark'>(theme)

  function toggle() {
    const next = current === 'dark' ? 'light' : 'dark'
    setCurrent(next)
    document.cookie = `${ADMIN_THEME_COOKIE}=${next}; path=/; max-age=31536000`
    const wrapper = document.querySelector('.fncon')
    if (wrapper) wrapper.setAttribute('data-theme', next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={current === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-[color:var(--ink-2)] transition hover:bg-[color:var(--border)] hover:text-[color:var(--ink)]"
    >
      {current === 'dark' ? (
        <svg className="icn h-4 w-4" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg className="icn h-4 w-4" viewBox="0 0 24 24">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
      <span>{current === 'dark' ? 'Light mode' : 'Dark mode'}</span>
    </button>
  )
}
