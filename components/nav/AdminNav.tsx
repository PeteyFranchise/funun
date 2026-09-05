'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import type { StaffRole } from '@/lib/admin/staff-role'
import { AdminThemeToggle } from '@/components/admin/AdminThemeToggle'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { AccountContextSwitch } from '@/components/auth/AccountContextSwitch'
import {
  PlaybookIcon,
  ChecklistIcon,
  TipsIcon,
  CuratorsIcon,
  IndustryIcon,
  TeamIcon,
  ClientPartnersIcon,
  DealsIcon,
  MetricsIcon,
  PlacementsIcon,
  ReportsIcon,
  VerificationIcon,
  ESignIcon,
  SyncIcon,
  CrateIcon,
  SelectsIcon,
  InvitesIcon,
  ProfileIcon,
  HealthPulseIcon,
} from './admin-icons'

type IconCmp = (p: { gradient?: boolean; className?: string }) => React.ReactNode

type Item = {
  href: string
  label: string
  match: string
  Icon: IconCmp
  // Which roles see this item. Mirrors app/(admin)/layout.tsx gating exactly.
  show: (role: StaffRole) => boolean
}

const isLead = (r: StaffRole) => r === 'leadership'
const notIt = (r: StaffRole) => r !== 'it'
const always = () => true

// Order matches the current admin sidebar exactly (app/(admin)/layout.tsx).
const ITEMS: Item[] = [
  { href: '/admin/playbook', label: 'The Playbook', match: '/admin/playbook', Icon: PlaybookIcon, show: always },
  { href: '/checklist', label: 'Checklist Items', match: '/checklist', Icon: ChecklistIcon, show: isLead },
  { href: '/tips', label: 'Tips', match: '/tips', Icon: TipsIcon, show: isLead },
  { href: '/admin/curators', label: 'PitchPlug · Curators', match: '/admin/curators', Icon: CuratorsIcon, show: isLead },
  { href: '/admin/members', label: 'Industry Members', match: '/admin/members', Icon: IndustryIcon, show: isLead },
  // Team Members folds in the old read-only Directory — visible to every staff
  // role except 'it'; the Add/manage controls inside are gated to Leadership +
  // TMS (StaffAdmin's canManage), so this is safe as an all-staff directory.
  { href: '/admin/team-members', label: 'Team Members', match: '/admin/team-members', Icon: TeamIcon, show: notIt },
  // Consolidated Client Partners room (D-31.1-01) — replaces the former
  // separate 'Client Partners' (/admin/buyer-orgs, leadership-only) and 'My
  // Client Partners' (/admin/my-client-partners, all staff) entries. Every
  // operational staff role sees this ONE item; the leadership-only All tab
  // + tower render INSIDE the room itself (server-gated, never a second nav
  // entry) — an AE never sees the All tab or the tower via any nav path.
  { href: '/admin/client-partners', label: 'Client Partners', match: '/admin/client-partners', Icon: ClientPartnersIcon, show: notIt },
  { href: '/admin/deals', label: 'Deals', match: '/admin/deals', Icon: DealsIcon, show: isLead },
  { href: '/admin/deals/metrics', label: 'GTM Metrics', match: '/admin/deals/metrics', Icon: MetricsIcon, show: isLead },
  { href: '/admin/green-room-placements', label: 'Green Room Placements', match: '/admin/green-room-placements', Icon: PlacementsIcon, show: isLead },
  { href: '/admin/reports', label: 'Reports', match: '/admin/reports', Icon: ReportsIcon, show: isLead },
  { href: '/admin/verification', label: 'Verification', match: '/admin/verification', Icon: VerificationIcon, show: isLead },
  { href: '/admin/esign-usage', label: 'E-Sign Usage', match: '/admin/esign-usage', Icon: ESignIcon, show: isLead },
  { href: '/admin/sync-library', label: 'Sync Library', match: '/admin/sync-library', Icon: SyncIcon, show: r => r === 'leadership' || r === 'ae' },
  { href: '/admin/crate-requests', label: 'Crate Requests', match: '/admin/crate-requests', Icon: CrateIcon, show: notIt },
  { href: '/admin/selects', label: 'Selects', match: '/admin/selects', Icon: SelectsIcon, show: notIt },
  // D-31.1-07 — Health Rules is the leadership-only relationship-health
  // config surface (thresholds + keeps-warm toggles + the D-31.1-08
  // prospect image). Nav entry lands with this plan; the page itself ships
  // in plan 05.
  { href: '/admin/health-rules', label: 'Health Rules', match: '/admin/health-rules', Icon: HealthPulseIcon, show: isLead },
  { href: '/admin/artist-invites', label: 'Artist Invites', match: '/admin/artist-invites', Icon: InvitesIcon, show: notIt },
  { href: '/admin/profile', label: 'My Profile', match: '/admin/profile', Icon: ProfileIcon, show: notIt },
]

const STORAGE_KEY_COLLAPSED = 'funun-admin-nav-collapsed'
const EXPANDED_WIDTH = 232
const COLLAPSED_WIDTH = 64

function Chevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="16"
      height="16"
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
  )
}

export function AdminNav({
  role,
  theme,
  activeOverride,
  userLabel,
}: {
  role: StaffRole
  theme: 'light' | 'dark'
  userLabel?: string
  // Preview-only: force a given href to render active (usePathname won't match
  // on the standalone /nav-preview route).
  activeOverride?: string
}) {
  const pathname = usePathname() ?? ''
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY_COLLAPSED) === 'true') setCollapsed(true)
  }, [])

  function toggle() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY_COLLAPSED, String(next))
      return next
    })
  }

  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH
  const visible = ITEMS.filter(i => i.show(role))

  return (
    <nav
      style={{ width, minWidth: width }}
      className={[
        'relative flex min-h-screen flex-none flex-col border-r border-[color:var(--border)] bg-[color:var(--panel)] pb-4 pt-5 transition-[width] duration-150',
        collapsed ? 'px-2' : 'px-3',
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

      {/* Header: ADMIN label + top collapse toggle */}
      <div className={['mb-3 flex items-center', collapsed ? 'justify-center' : 'justify-between px-2'].join(' ')}>
        {!collapsed && (
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--ink-3)]">Admin</span>
        )}
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? 'Expand menu' : 'Collapse menu'}
          aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          className="flex h-6 w-6 flex-none items-center justify-center rounded-md text-[color:var(--ink-3)] transition hover:bg-[color:var(--border)] hover:text-[color:var(--ink)]"
        >
          <Chevron collapsed={collapsed} />
        </button>
      </div>

      {/* Scrollable items */}
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {visible.map(({ href, label, match, Icon }) => {
          const active = activeOverride
            ? activeOverride === match
            : pathname === match || pathname.startsWith(match + '/')
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={[
                'group relative flex items-center rounded-lg transition',
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2 text-[13px]',
                active
                  ? 'bg-[color:var(--panel-2)] font-medium text-[color:var(--ink)]'
                  : 'text-[color:var(--ink-2)] hover:bg-[color:var(--border)] hover:text-[color:var(--ink)]',
              ].join(' ')}
            >
              {active && (
                <span
                  className={[
                    'absolute bottom-1.5 top-1.5 w-[3px] rounded-r bg-[image:linear-gradient(180deg,#818CF8,#D946EF)]',
                    collapsed ? '-left-2' : '-left-3',
                  ].join(' ')}
                />
              )}
              <span className="flex-none">
                <Icon gradient={active} className="h-[18px] w-[18px]" />
              </span>
              {!collapsed && <span className="truncate">{label}</span>}

              {collapsed && (
                <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-lg border border-[color:var(--border-2)] bg-[color:var(--panel)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--ink)] opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                  {label}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      {/* Bottom collapse toggle */}
      <button
        type="button"
        onClick={toggle}
        title={collapsed ? 'Expand menu' : 'Collapse menu'}
        className={[
          'mt-2 flex items-center rounded-lg py-2 text-[color:var(--ink-3)] transition hover:bg-[color:var(--border)] hover:text-[color:var(--ink)]',
          collapsed ? 'justify-center px-2' : 'gap-2.5 px-3',
        ].join(' ')}
      >
        <Chevron collapsed={collapsed} />
        {!collapsed && <span className="text-[12px] font-medium">Collapse</span>}
      </button>

      {/* Footer: theme toggle + sign out */}
      <div className="mt-1 flex flex-col gap-1 border-t border-[color:var(--border)] pt-2">
        <div
          className={[
            'rounded-lg',
            collapsed ? 'px-0 py-1' : 'px-3 py-2',
          ].join(' ')}
          title={collapsed ? `Funūn Team — ${userLabel ?? 'Team Member'}` : undefined}
        >
          {collapsed ? (
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-[image:linear-gradient(135deg,#818CF8,#D946EF)] text-[10px] font-extrabold text-white">
              FT
            </div>
          ) : (
            <>
              <div className="text-[9px] font-bold uppercase tracking-[.14em] text-[color:var(--ink-3)]">
                Active workspace
              </div>
              <div className="mt-0.5 text-[12px] font-bold text-[color:var(--ink)]">Funūn Team</div>
              {userLabel && <div className="truncate text-[10px] text-[color:var(--ink-3)]">{userLabel}</div>}
            </>
          )}
        </div>
        <div className={collapsed ? 'flex justify-center' : 'px-3'}>
          <AccountContextSwitch currentContext="team" collapsed={collapsed} appearance="team" />
        </div>
        <AdminThemeToggle theme={theme} collapsed={collapsed} />
        {!collapsed && (
          <div className="px-3 py-1 [&>button]:text-[13px] [&>button]:text-[color:var(--ink-3)] [&>button:hover]:text-[color:var(--ink)]">
            <SignOutButton />
          </div>
        )}
      </div>
    </nav>
  )
}
