'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

function SectionIcon({ kind }: { kind: 'roster' | 'contracts' | 'claims' | 'activity' | 'plan' }) {
  if (kind === 'roster') {
    return (
      <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6M16 8h5M16 12h5M17 16h4" />
      </svg>
    )
  }
  if (kind === 'contracts') {
    return (
      <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <path d="M7 3.5h8l3 3V20H7z" />
        <path d="M15 3.5V7h3M10 11h5M10 15h5" />
      </svg>
    )
  }
  if (kind === 'claims') {
    return (
      <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <path d="M12 3.5 19 6v5c0 4.4-2.4 7.6-7 9.5C7.4 18.6 5 15.4 5 11V6z" />
        <path d="m9 12 2 2 4-5" />
      </svg>
    )
  }
  if (kind === 'plan') {
    return (
      <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
        <path d="M3.5 9h17M7 14h4" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

export function WorkspaceSectionLinks({
  workspaceId,
  rosterEnabled,
  showMasterClaims,
}: {
  workspaceId: string
  rosterEnabled: boolean
  showMasterClaims: boolean
}) {
  const pathname = usePathname() ?? ''
  const items = [
    ...(rosterEnabled ? [{ href: `/w/${workspaceId}/roster`, label: 'Roster', kind: 'roster' as const }] : []),
    { href: `/w/${workspaceId}/contracts`, label: 'Contract Locker', kind: 'contracts' as const },
    ...(showMasterClaims ? [{ href: `/w/${workspaceId}/master-claims`, label: 'Master claims', kind: 'claims' as const }] : []),
    { href: `/w/${workspaceId}/activity`, label: 'Activity', kind: 'activity' as const },
    { href: `/w/${workspaceId}/plan`, label: 'Plan & usage', kind: 'plan' as const },
  ]

  return (
    <div className="space-y-[5px]">
      {items.map(item => {
        const active = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex items-center gap-[14px] rounded-[11px] border px-[14px] py-[13px] text-[15.5px] font-semibold transition ${
              active
                ? 'border-hairstrong bg-card2 text-white'
                : 'border-transparent text-lav hover:bg-white/[.035] hover:text-white'
            }`}
          >
            {active ? <span className="absolute -left-[18px] bottom-[11px] top-[11px] w-[3px] rounded-r-[3px] bg-grad" /> : null}
            <span className={active ? 'text-brandindigo' : 'text-lavdim'}>
              <SectionIcon kind={item.kind} />
            </span>
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}
