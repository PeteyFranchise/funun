'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  VaultIcon,
  LockerIcon,
  AntennaIcon,
  PitchPlugIcon,
  CoachIcon,
  EarningsIcon,
  BenchmarkIcon,
  LaunchpadIcon,
} from './icons'

type Item = {
  href: string
  label: string
  match: string
  Icon: (p: { gradient?: boolean; className?: string }) => React.ReactNode
}

const ITEMS: Item[] = [
  { href: '/vault', label: 'Sound Vault', match: '/vault', Icon: VaultIcon },
  { href: '/contracts', label: 'Contract Locker', match: '/contracts', Icon: LockerIcon },
  { href: '/antenna', label: 'Antenna', match: '/antenna', Icon: AntennaIcon },
  { href: '/benchmarks', label: 'Benchmarks', match: '/benchmarks', Icon: BenchmarkIcon },
  { href: '/tools/pitchplug', label: 'PitchPlug', match: '/tools/pitchplug', Icon: PitchPlugIcon },
  { href: '/launchpad', label: 'Launchpad', match: '/launchpad', Icon: LaunchpadIcon },
  { href: '/coach', label: 'Rights Coach', match: '/coach', Icon: CoachIcon },
  { href: '/earnings', label: 'Earnings', match: '/earnings', Icon: EarningsIcon },
]

type NavUser = { name?: string; plan?: string; initials?: string }

export function ArtistNav({ user }: { user?: NavUser }) {
  const pathname = usePathname() ?? ''
  const name = user?.name ?? 'Your Profile'
  const plan = user?.plan ?? 'Free plan'
  const initials =
    user?.initials ??
    name
      .split(' ')
      .map(w => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()

  return (
    <nav className="flex min-h-screen w-[252px] flex-none flex-col border-r border-hair bg-nav-rail px-[18px] pb-6 pt-[30px]">
      {/* Shared gradient for active icon strokes (referenced via url(#ng)). */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id="ng" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#818CF8" />
            <stop offset="100%" stopColor="#D946EF" />
          </linearGradient>
        </defs>
      </svg>

      {/* Brand */}
      <Link href="/vault" className="mb-[42px] block px-3">
        <div className="gtext text-[25px] font-black tracking-[.04em]">FUNŪN</div>
        <div className="mt-[3px] text-[10px] font-bold tracking-[.32em] text-lavdim">THE ARTS</div>
      </Link>

      {/* Workspace group */}
      <div className="mb-3 mt-[6px] px-[14px] text-[11px] font-bold uppercase tracking-[.18em] text-lavdim">
        Workspace
      </div>

      {ITEMS.map(({ href, label, match, Icon }) => {
        const active = pathname === match || pathname.startsWith(match + '/')
        return (
          <Link
            key={href}
            href={href}
            className={[
              'relative mb-[5px] flex items-center gap-[14px] rounded-[11px] px-[14px] py-[13px] text-[15.5px] font-semibold transition',
              active
                ? 'border border-hairstrong bg-card2 text-white'
                : 'text-lav hover:bg-white/5',
            ].join(' ')}
          >
            {active && (
              <span className="absolute -left-[18px] bottom-[11px] top-[11px] w-[3px] rounded-r-[3px] bg-grad" />
            )}
            <Icon gradient={active} className="h-[21px] w-[21px] flex-none" />
            {label}
          </Link>
        )
      })}

      <div className="flex-1" />

      {/* User footer → Your Profile */}
      <Link
        href="/profile"
        className="mt-2 flex items-center gap-3 border-t border-hair px-3 py-3 transition hover:opacity-90"
      >
        <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-grad text-[15px] font-extrabold text-white">
          {initials}
        </span>
        <span className="leading-tight">
          <span className="block text-[14.5px] font-bold text-white">{name}</span>
          <span className="block text-[12px] text-lavdim">{plan}</span>
        </span>
      </Link>
    </nav>
  )
}
