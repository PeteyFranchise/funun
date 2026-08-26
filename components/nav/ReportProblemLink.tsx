'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

// ─── ReportProblemLink — beta bug-report escape hatch ──────────────────────
// Until there is a proper in-app report form, an artist who hits something
// broken has NO way to tell us — Sentry only catches code that throws, never
// "the button did nothing" or "my song is still pending". Those are exactly
// the bugs a beta surfaces, and they are invisible without this.
//
// Deliberately a mailto, not a form: zero backend, zero new failure mode, and
// it cannot itself break the way a form depending on transactional email
// could. The prefilled body captures the page and browser because users
// almost never volunteer those, and "it didn't work" without them is the
// difference between a five-minute fix and an hour of guessing.
//
// SUPPORT_EMAIL: pete@funun.studio is used because it is a mailbox PROVEN to
// receive mail. docs/STATUS.md lists support@funun.studio as planned, not
// live — pointing beta users at an unmonitored alias would be worse than no
// link at all. Switch this one constant once support@ genuinely exists.
export const SUPPORT_EMAIL = 'pete@funun.studio'

export function ReportProblemLink({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname() ?? ''

  // The user agent is read AFTER mount, not during render. Reading it inline
  // (`typeof navigator !== 'undefined' ? ... : ''`) makes the server emit an
  // href without it and the client emit one with it — a hydration mismatch
  // React refuses to patch, which poisons the whole nav subtree. Starting at
  // '' matches the server exactly, then the effect fills it in on the client.
  const [userAgent, setUserAgent] = useState('')
  useEffect(() => setUserAgent(navigator.userAgent), [])

  const subject = 'Funūn — problem report'
  const body = [
    'What happened?',
    '',
    '',
    'What did you expect instead?',
    '',
    '',
    '— — — — —',
    'The details below help us find it faster:',
    `Page: ${pathname}`,
    userAgent ? `Browser: ${userAgent}` : '',
    '',
  ].join('\n')

  const href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  return (
    <a
      href={href}
      title={collapsed ? 'Report a problem' : undefined}
      className={[
        'flex items-center rounded-lg py-2 text-[13px] text-lavdim transition hover:text-white',
        collapsed ? 'justify-center px-1' : 'gap-2.5 px-3',
      ].join(' ')}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="flex-none">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5" strokeLinecap="round" />
        <path d="M12 16.2v.1" strokeLinecap="round" />
      </svg>
      {!collapsed && <span>Report a problem</span>}
    </a>
  )
}
