'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Mirrors app/(admin)/layout.tsx's NAV_LINK_CLASS exactly, so "The
// Playbook" matches the other 15 Rail 1 links (33-UI-SPEC.md "Rail
// reconciliation" #1). This is a leaf primitive with no route dependency
// (33-04-PLAN.md Task 2); a later plan wires it into the shared layout.
const NAV_LINK_CLASS =
  'rounded-lg px-3 py-2 text-[13px] text-[color:var(--ink-2)] transition hover:bg-[color:var(--border)] hover:text-[color:var(--ink)]'

// The link's own hover treatment, made permanent when active — Rail 1 has
// no other active-state precedent, so this deliberately reuses the
// existing hover styling rather than inventing new chrome (UI-SPEC locked
// literal).
const ACTIVE_CLASS = 'bg-[color:var(--border)] text-[color:var(--ink)] font-semibold'

export function PlaybookNavLink() {
  const pathname = usePathname() ?? ''
  const active = pathname.startsWith('/admin/playbook')

  return (
    <Link href="/admin/playbook" className={[NAV_LINK_CLASS, active ? ACTIVE_CLASS : ''].join(' ').trim()}>
      The Playbook
    </Link>
  )
}
