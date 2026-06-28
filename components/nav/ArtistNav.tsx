'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  VaultIcon,
  LockerIcon,
  AntennaIcon,
  PitchPlugIcon,
  CoachIcon,
  EarningsIcon,
  BenchmarkIcon,
  LaunchpadIcon,
  CollaboratorsIcon,
  SettingsIcon,
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
  { href: '/collaborators', label: 'Collaborators', match: '/collaborators', Icon: CollaboratorsIcon },
  { href: '/antenna', label: 'Antenna', match: '/antenna', Icon: AntennaIcon },
  { href: '/tools/pitchplug', label: 'PitchPlug', match: '/tools/pitchplug', Icon: PitchPlugIcon },
  { href: '/benchmarks', label: 'Benchmarks', match: '/benchmarks', Icon: BenchmarkIcon },
  { href: '/launchpad', label: 'Launchpad', match: '/launchpad', Icon: LaunchpadIcon },
  { href: '/coach', label: 'Rights Coach', match: '/coach', Icon: CoachIcon },
  { href: '/earnings', label: 'Earnings', match: '/earnings', Icon: EarningsIcon },
  { href: '/settings', label: 'Settings', match: '/settings', Icon: SettingsIcon },
]

const COLLAPSED_WIDTH = 68
const DEFAULT_WIDTH = 252
const MIN_WIDTH = 180
const MAX_WIDTH = 400
const STORAGE_KEY_WIDTH = 'funun-nav-width'
const STORAGE_KEY_COLLAPSED = 'funun-nav-collapsed'

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

  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [collapsed, setCollapsed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(DEFAULT_WIDTH)

  useEffect(() => {
    const storedCollapsed = localStorage.getItem(STORAGE_KEY_COLLAPSED)
    const storedWidth = localStorage.getItem(STORAGE_KEY_WIDTH)
    if (storedCollapsed === 'true') setCollapsed(true)
    if (storedWidth) {
      const w = Number(storedWidth)
      if (w >= MIN_WIDTH && w <= MAX_WIDTH) setWidth(w)
    }
  }, [])

  function toggle() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY_COLLAPSED, String(next))
      return next
    })
  }

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragStartX.current = e.clientX
    dragStartWidth.current = width
    setDragging(true)
  }, [width])

  useEffect(() => {
    if (!dragging) return

    function onMouseMove(e: MouseEvent) {
      const delta = e.clientX - dragStartX.current
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidth.current + delta))
      setWidth(next)
      // Snap to collapsed if dragged below threshold
      if (next <= MIN_WIDTH - 20) {
        setCollapsed(true)
        localStorage.setItem(STORAGE_KEY_COLLAPSED, 'true')
      } else {
        setCollapsed(false)
        localStorage.setItem(STORAGE_KEY_COLLAPSED, 'false')
      }
    }

    function onMouseUp(e: MouseEvent) {
      setDragging(false)
      const delta = e.clientX - dragStartX.current
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidth.current + delta))
      localStorage.setItem(STORAGE_KEY_WIDTH, String(next))
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragging])

  const navWidth = collapsed ? COLLAPSED_WIDTH : width

  return (
    <nav
      style={{ width: navWidth, minWidth: navWidth }}
      className={[
        'relative flex min-h-screen flex-none flex-col border-r border-hair bg-nav-rail pb-6 pt-[30px]',
        collapsed ? 'px-[10px]' : 'px-[18px]',
        dragging ? '' : 'transition-[width] duration-150',
      ].join(' ')}
    >
      {/* Shared gradient for active icon strokes */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id="ng" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#818CF8" />
            <stop offset="100%" stopColor="#D946EF" />
          </linearGradient>
        </defs>
      </svg>

      {/* Drag handle — right edge */}
      <div
        onMouseDown={onDragStart}
        className={[
          'absolute right-0 top-0 h-full w-[5px] cursor-col-resize z-10 group',
          dragging ? 'bg-lav/20' : 'hover:bg-lav/20',
        ].join(' ')}
        title="Drag to resize"
      >
        {/* Visible line that brightens on hover/drag */}
        <div className={[
          'absolute right-0 top-0 h-full w-px transition-colors',
          dragging ? 'bg-lav/60' : 'bg-transparent group-hover:bg-lav/40',
        ].join(' ')} />
      </div>

      {/* Brand + top collapse button */}
      <div className={['group/header relative mb-[42px] flex items-start', collapsed ? 'justify-center px-1' : 'px-3'].join(' ')}>
        <Link href="/vault" className="flex-1">
          {collapsed ? (
            <div className="gtext text-[18px] font-black tracking-[.04em]">F</div>
          ) : (
            <>
              <div className="gtext text-[25px] font-black tracking-[.04em]">FUNŪN</div>
              <div className="mt-[3px] text-[10px] font-bold tracking-[.32em] text-lavdim">THE ARTS</div>
            </>
          )}
        </Link>

        {/* Top collapse button — appears on hover like Notion */}
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={[
            'flex h-6 w-6 flex-none items-center justify-center rounded-md text-white/0 transition-all hover:bg-white/10 hover:text-white/70 group-hover/header:text-white/40',
            collapsed ? 'mt-0.5' : 'mt-1',
          ].join(' ')}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={['transition-transform duration-200', collapsed ? 'rotate-180' : ''].join(' ')}
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      {/* Scrollable items area — keeps footer pinned at bottom */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Workspace label */}
      {!collapsed && (
        <div className="mb-3 mt-[6px] px-[14px] text-[11px] font-bold uppercase tracking-[.18em] text-lavdim">
          Workspace
        </div>
      )}

      {/* Nav items */}
      {ITEMS.map(({ href, label, match, Icon }) => {
        const active = pathname === match || pathname.startsWith(match + '/')
        return (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            className={[
              'group relative mb-[5px] flex items-center rounded-[11px] transition',
              collapsed
                ? 'justify-center px-[10px] py-[13px]'
                : 'gap-[14px] px-[14px] py-[13px] text-[15.5px] font-semibold',
              active
                ? 'border border-hairstrong bg-card2 text-white'
                : 'text-lav hover:bg-white/5',
            ].join(' ')}
          >
            {active && (
              <span
                className={[
                  'absolute bottom-[11px] top-[11px] w-[3px] rounded-r-[3px] bg-grad',
                  collapsed ? '-left-[10px]' : '-left-[18px]',
                ].join(' ')}
              />
            )}
            <Icon gradient={active} className="h-[21px] w-[21px] flex-none" />
            {!collapsed && label}

            {/* Tooltip when collapsed */}
            {collapsed && (
              <span className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-lg border border-hairstrong bg-card px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                {label}
              </span>
            )}
          </Link>
        )
      })}
      </div>

      {/* Collapse toggle button */}
      <button
        type="button"
        onClick={toggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={[
          'mb-3 flex items-center rounded-[11px] py-[10px] text-white/30 transition hover:bg-white/5 hover:text-white/70',
          collapsed ? 'justify-center px-[10px]' : 'gap-[10px] px-[14px]',
        ].join(' ')}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={['transition-transform duration-200', collapsed ? 'rotate-180' : ''].join(' ')}
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
        {!collapsed && <span className="text-[13px] font-medium">Collapse</span>}
      </button>

      {/* User footer */}
      <Link
        href="/profile"
        title={collapsed ? `${name} — ${plan}` : undefined}
        className={[
          'mt-2 flex items-center border-t border-hair py-3 transition hover:opacity-90',
          collapsed ? 'justify-center px-1' : 'gap-3 px-3',
        ].join(' ')}
      >
        <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-grad text-[15px] font-extrabold text-white">
          {initials}
        </span>
        {!collapsed && (
          <span className="leading-tight">
            <span className="block text-[14.5px] font-bold text-white">{name}</span>
            <span className="block text-[12px] text-lavdim">{plan}</span>
          </span>
        )}
      </Link>
    </nav>
  )
}
