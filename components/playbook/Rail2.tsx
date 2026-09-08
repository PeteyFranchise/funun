'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { IT_SUBPAGES } from '@/lib/playbook/nav'
import type { PlaybookRoom } from '@/lib/playbook/rooms'

// Rail 2 — the Playbook's secondary sidebar of rooms/sub-rooms. Built to
// playbook-double-sidebar.html's `.rail2` (33-UI-SPEC.md "Rail
// reconciliation" #2).
//
// DB-driven (31.2-07 Task 2, D-31.2-01/03): `rooms` is the caller's
// (PlaybookLayout's) already-visibility-filtered loadRooms() list — this
// component renders whatever it is given, it does not re-derive visibility.
// nav.ts's PLAYBOOK_ROOMS/PlaybookRoom are no longer imported here (DB rooms
// replace them as the live authority); IT_SUBPAGES stays, since the IT
// room's fixed sub-page list has not moved to the DB in this phase.
//
// `isLeadership` gates the "Access" link to the room×role editor
// (/admin/playbook/access) — UX-only, matching every other visibility
// decision in this component (the real gate is that page's own
// requireStaffPage(['leadership']) self-guard).
//
// Nav visibility here (which rooms are IN `rooms`, whether the Access link
// renders) is UX only, never the authority — each IT-room page carries its
// own requireRoomAccessPage('it-team') self-guard (D-06, T-33-04
// mitigation), and the access page carries its own leadership guard.
//
// Collapse (2026-08): a chevron in the header collapses the rail to a slim
// strip so the content column gets full width; state persists per-member via
// localStorage, mirroring AdminNav's collapse. The far-left AdminNav and this
// rail collapse independently.
const ROOM_BASE_CLASS =
  'flex items-center gap-[9px] rounded-[9px] px-[10px] py-[8px] text-[13.5px] font-medium text-[color:var(--ink-2)]'

const ROOM_DOT_CLASS = 'h-[6px] w-[6px] flex-none rounded-full bg-[color:var(--ink-3)]'

const STORAGE_KEY_COLLAPSED = 'funun-playbook-rail2-collapsed'

function PlaybookMark() {
  return (
    <svg
      className="h-[18px] w-[18px] flex-none text-[color:var(--fuchsia)]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 5a2 2 0 0 1 2-2h11v16H7a2 2 0 0 0-2 2z" />
      <path d="M5 19a2 2 0 0 1 2-2h11" />
    </svg>
  )
}

function CollapseButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? 'Expand Playbook menu' : 'Collapse Playbook menu'}
      aria-label={collapsed ? 'Expand Playbook menu' : 'Collapse Playbook menu'}
      className="flex h-6 w-6 flex-none items-center justify-center rounded-md text-[color:var(--ink-3)] transition hover:bg-[color:var(--border)] hover:text-[color:var(--ink)]"
    >
      <svg
        width="15"
        height="15"
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
    </button>
  )
}

export function Rail2({
  rooms,
  isLeadership,
  hasGovernanceScope,
  hasLearningScope,
  availableFeatures,
}: {
  rooms: PlaybookRoom[]
  isLeadership: boolean
  hasGovernanceScope: boolean
  hasLearningScope: boolean
  availableFeatures: string[]
}) {
  const pathname = usePathname() ?? ''
  const itRoomActive = pathname.startsWith('/admin/playbook/it')
  const myPlaybookActive = pathname === '/admin/playbook/my'
  const accessActive = pathname === '/admin/playbook/access'
  const playsActive = pathname === '/admin/playbook/plays'
  const governanceActive = pathname === '/admin/playbook/governance'
  const publicationActive = pathname === '/admin/playbook/publication'
  const learningActive = pathname === '/admin/playbook/learning'
  const updatesActive = pathname === '/admin/playbook/updates'
  const searchActive = pathname === '/admin/playbook/search'
  const askActive = pathname === '/admin/playbook/ask'
  const learningPathsActive = pathname === '/admin/playbook/learning-paths'
  const feedbackActive = pathname === '/admin/playbook/feedback'
  const workflowsActive = pathname === '/admin/playbook/workflows'
  const exceptionsActive = pathname === '/admin/playbook/exceptions'
  const incidentsActive = pathname === '/admin/playbook/incidents'
  const mediaActive = pathname === '/admin/playbook/media'
  const readinessActive = pathname === '/admin/playbook/readiness'
  const globalActive = pathname === '/admin/playbook/global'
  const activationActive = pathname === '/admin/playbook/activation'
  const inboxActive = pathname === '/admin/playbook/inbox'
  const dependenciesActive = pathname === '/admin/playbook/dependencies'
  const simulationsActive = pathname === '/admin/playbook/simulations'
  const integrationsActive = pathname === '/admin/playbook/integrations'
  const features = new Set(availableFeatures)
  const [collapsed, setCollapsed] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY_COLLAPSED) === 'true') setCollapsed(true)
  }, [])

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.key !== '/' || target?.matches('input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault()
      router.push('/admin/playbook/search')
    }
    window.addEventListener('keydown', openSearch)
    return () => window.removeEventListener('keydown', openSearch)
  }, [router])

  function toggle() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY_COLLAPSED, String(next))
      return next
    })
  }

  if (collapsed) {
    return (
      <aside className="sticky top-0 flex h-screen w-[52px] flex-none flex-col items-center gap-3 border-r border-[color:var(--border)] bg-[color:var(--panel)] py-[20px]">
        <PlaybookMark />
        <CollapseButton collapsed onClick={toggle} />
      </aside>
    )
  }

  return (
    <aside className="sticky top-0 flex h-screen w-[238px] flex-none flex-col gap-[2px] overflow-y-auto border-r border-[color:var(--border)] bg-[color:var(--panel)] px-[14px] py-[20px]">
      <div className="flex items-center gap-[9px] px-2 pb-1">
        <PlaybookMark />
        <span className="text-[15px] font-extrabold tracking-[-.01em] text-[color:var(--ink)]">
          The Playbook
        </span>
        <span className="ml-auto flex-none">
          <CollapseButton collapsed={false} onClick={toggle} />
        </span>
      </div>
      <div className="mb-2 border-b border-[color:var(--border)] px-2 pb-3 text-[11px] text-[color:var(--ink-3)]">
        Company wiki · SOPs, topics &amp; plays
      </div>

      {hasLearningScope && (
        <Link href="/admin/playbook/search" className={[ROOM_BASE_CLASS, 'mb-2 transition hover:bg-[rgba(199,203,247,.05)] hover:text-[color:var(--ink)]', searchActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : ''].join(' ')}><span className={[ROOM_DOT_CLASS, searchActive ? 'bg-[color:var(--fuchsia)] shadow-[0_0_7px_rgba(217,70,239,.7)]' : ''].join(' ')} />Knowledge Finder<span className="ml-auto rounded border border-[color:var(--border)] px-1.5 py-0.5 text-[8px] text-[color:var(--ink-3)]">/</span></Link>
      )}

      {hasLearningScope && features.has('sla_inbox') && <Link href="/admin/playbook/inbox" className={[ROOM_BASE_CLASS, inboxActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : ''].join(' ')}><span className={[ROOM_DOT_CLASS, inboxActive ? 'bg-[color:var(--fuchsia)]' : ''].join(' ')} />Inbox &amp; SLAs</Link>}
      {hasLearningScope && features.has('simulations') && <Link href="/admin/playbook/simulations" className={[ROOM_BASE_CLASS, simulationsActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : ''].join(' ')}><span className={[ROOM_DOT_CLASS, simulationsActive ? 'bg-[color:var(--fuchsia)]' : ''].join(' ')} />Simulations</Link>}
      {hasLearningScope && features.has('operational_integrations') && <Link href="/admin/playbook/integrations" className={[ROOM_BASE_CLASS, integrationsActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : ''].join(' ')}><span className={[ROOM_DOT_CLASS, integrationsActive ? 'bg-[color:var(--fuchsia)]' : ''].join(' ')} />Connected Work</Link>}

      {hasLearningScope && <Link href="/admin/playbook/ask" className={[ROOM_BASE_CLASS, askActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : ''].join(' ')}><span className={[ROOM_DOT_CLASS, askActive ? 'bg-[color:var(--fuchsia)]' : ''].join(' ')} />Ask The Playbook</Link>}

      {hasLearningScope && (
        <Link
          href="/admin/playbook/updates"
          className={[
            ROOM_BASE_CLASS,
            'transition hover:bg-[rgba(199,203,247,.05)] hover:text-[color:var(--ink)]',
            updatesActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : '',
          ].join(' ')}
        >
          <span className={[ROOM_DOT_CLASS, updatesActive ? 'bg-[color:var(--fuchsia)] shadow-[0_0_7px_rgba(217,70,239,.7)]' : ''].join(' ')} />
          What’s New
        </Link>
      )}

      {hasLearningScope && <><div className="my-2 border-t border-[color:var(--border)]" /><Link href="/admin/playbook/learning-paths" className={[ROOM_BASE_CLASS, learningPathsActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : ''].join(' ')}><span className={[ROOM_DOT_CLASS, learningPathsActive ? 'bg-[color:var(--fuchsia)]' : ''].join(' ')} />Learning Paths</Link><Link href="/admin/playbook/workflows" className={[ROOM_BASE_CLASS, workflowsActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : ''].join(' ')}><span className={[ROOM_DOT_CLASS, workflowsActive ? 'bg-[color:var(--fuchsia)]' : ''].join(' ')} />Workflow Workbench</Link><Link href="/admin/playbook/feedback" className={[ROOM_BASE_CLASS, feedbackActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : ''].join(' ')}><span className={[ROOM_DOT_CLASS, feedbackActive ? 'bg-[color:var(--fuchsia)]' : ''].join(' ')} />Reader Feedback</Link><Link href="/admin/playbook/media" className={[ROOM_BASE_CLASS, mediaActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : ''].join(' ')}><span className={[ROOM_DOT_CLASS, mediaActive ? 'bg-[color:var(--fuchsia)]' : ''].join(' ')} />Training Media</Link><Link href="/admin/playbook/global" className={[ROOM_BASE_CLASS, globalActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : ''].join(' ')}><span className={[ROOM_DOT_CLASS, globalActive ? 'bg-[color:var(--fuchsia)]' : ''].join(' ')} />Global Enablement</Link></>}

      {hasLearningScope && (
        <Link
          href="/admin/playbook/my"
          className={[
            ROOM_BASE_CLASS,
            'mb-2 transition hover:bg-[rgba(199,203,247,.05)] hover:text-[color:var(--ink)]',
            myPlaybookActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : '',
          ].join(' ')}
        >
          <span className={[ROOM_DOT_CLASS, myPlaybookActive ? 'bg-[color:var(--fuchsia)] shadow-[0_0_7px_rgba(217,70,239,.7)]' : ''].join(' ')} />
          My Playbook
        </Link>
      )}

      {rooms.map(room => {
        // The `rooms` prop is already visibility-filtered by the caller.
        // IT keeps its bespoke sub-navigation; every other DB-activated
        // room uses the generic authored-entry page. `coming_soon` remains
        // the source of truth for inert ghost rooms.
        if (room.key === 'it-team') {
          return <ItRoomEntry key={room.id} room={room} pathname={pathname} active={itRoomActive} />
        }
        if (room.coming_soon) return <GhostRoom key={room.id} room={room} />
        return <LiveRoomEntry key={room.id} room={room} pathname={pathname} />
      })}

      {hasLearningScope && (
        <Link
          href="/admin/playbook/learning"
          className={[
            ROOM_BASE_CLASS,
            'transition hover:bg-[rgba(199,203,247,.05)] hover:text-[color:var(--ink)]',
            learningActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : '',
          ].join(' ')}
        >
          <span
            className={[
              ROOM_DOT_CLASS,
              learningActive ? 'bg-[color:var(--fuchsia)] shadow-[0_0_7px_rgba(217,70,239,.7)]' : '',
            ].join(' ')}
          />
          My Required Reading
        </Link>
      )}

      {hasGovernanceScope && (
        <>
          <div className="my-2 border-t border-[color:var(--border)]" />
          <Link
            href="/admin/playbook/governance"
            className={[
              ROOM_BASE_CLASS,
              'transition hover:bg-[rgba(199,203,247,.05)] hover:text-[color:var(--ink)]',
              governanceActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : '',
            ].join(' ')}
          >
            <span
              className={[
                ROOM_DOT_CLASS,
                governanceActive ? 'bg-[color:var(--fuchsia)] shadow-[0_0_7px_rgba(217,70,239,.7)]' : '',
              ].join(' ')}
            />
            Governance Inbox
          </Link>
          <Link
            href="/admin/playbook/publication"
            className={[
              ROOM_BASE_CLASS,
              'transition hover:bg-[rgba(199,203,247,.05)] hover:text-[color:var(--ink)]',
              publicationActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : '',
            ].join(' ')}
          >
            <span
              className={[
                ROOM_DOT_CLASS,
                publicationActive ? 'bg-[color:var(--fuchsia)] shadow-[0_0_7px_rgba(217,70,239,.7)]' : '',
              ].join(' ')}
            />
            Doctrine Readiness
          </Link>
          <Link href="/admin/playbook/readiness" className={[ROOM_BASE_CLASS, readinessActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : ''].join(' ')}><span className={[ROOM_DOT_CLASS, readinessActive ? 'bg-[color:var(--fuchsia)]' : ''].join(' ')} />Readiness Console</Link>
          <Link href="/admin/playbook/exceptions" className={[ROOM_BASE_CLASS, exceptionsActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : ''].join(' ')}><span className={[ROOM_DOT_CLASS, exceptionsActive ? 'bg-[color:var(--fuchsia)]' : ''].join(' ')} />Exceptions</Link>
          <Link href="/admin/playbook/incidents" className={[ROOM_BASE_CLASS, incidentsActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : ''].join(' ')}><span className={[ROOM_DOT_CLASS, incidentsActive ? 'bg-[color:var(--fuchsia)]' : ''].join(' ')} />Incident Mode</Link>
          {features.has('dependency_map') && <Link href="/admin/playbook/dependencies" className={[ROOM_BASE_CLASS, dependenciesActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : ''].join(' ')}><span className={[ROOM_DOT_CLASS, dependenciesActive ? 'bg-[color:var(--fuchsia)]' : ''].join(' ')} />Doctrine Dependencies</Link>}
        </>
      )}

      {isLeadership && (
        <>
          <div className="my-2 border-t border-[color:var(--border)]" />
          <Link href="/admin/playbook/activation" className={[ROOM_BASE_CLASS, activationActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : ''].join(' ')}><span className={[ROOM_DOT_CLASS, activationActive ? 'bg-[color:var(--fuchsia)]' : ''].join(' ')} />Beta Activation</Link>
          {/* Leadership-only chrome — UX visibility only; each page carries its
              own server guard (access → requireStaffPage(['leadership']) on the
              access page; plays → same guard on /admin/playbook/plays, 31.2-09). */}
          <Link
            href="/admin/playbook/plays"
            className={[
              ROOM_BASE_CLASS,
              'transition hover:bg-[rgba(199,203,247,.05)] hover:text-[color:var(--ink)]',
              playsActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : '',
            ].join(' ')}
          >
            <span
              className={[
                ROOM_DOT_CLASS,
                playsActive ? 'bg-[color:var(--fuchsia)] shadow-[0_0_7px_rgba(217,70,239,.7)]' : '',
              ].join(' ')}
            />
            Plays
          </Link>
          <Link
            href="/admin/playbook/access"
            className={[
              ROOM_BASE_CLASS,
              'transition hover:bg-[rgba(199,203,247,.05)] hover:text-[color:var(--ink)]',
              accessActive ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : '',
            ].join(' ')}
          >
            <span
              className={[
                ROOM_DOT_CLASS,
                accessActive ? 'bg-[color:var(--fuchsia)] shadow-[0_0_7px_rgba(217,70,239,.7)]' : '',
              ].join(' ')}
            />
            Access
          </Link>
        </>
      )}
    </aside>
  )
}

function LiveRoomEntry({ room, pathname }: { room: PlaybookRoom; pathname: string }) {
  const href = `/admin/playbook/${room.key}`
  const active = pathname === href || pathname.startsWith(href + '/')

  return (
    <Link
      href={href}
      className={[
        ROOM_BASE_CLASS,
        'relative transition hover:bg-[rgba(199,203,247,.05)] hover:text-[color:var(--ink)]',
        active ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : '',
      ].join(' ')}
    >
      {active && (
        <span
          className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-[3px]"
          style={{ background: 'var(--grad)' }}
        />
      )}
      <span
        className={[
          ROOM_DOT_CLASS,
          active ? 'bg-[color:var(--fuchsia)] shadow-[0_0_7px_rgba(217,70,239,.7)]' : '',
        ].join(' ')}
      />
      {room.label}
    </Link>
  )
}

// "Coming soon" rooms are inert content, never a focusable/clickable
// control (they have no destination) — a <div>, not an <a>/<button>, and no
// tabindex (33-UI-SPEC.md "Coming soon ghost rooms").
function GhostRoom({ room }: { room: PlaybookRoom }) {
  return (
    <div className={[ROOM_BASE_CLASS, 'cursor-default opacity-[.45]'].join(' ')}>
      <span className={ROOM_DOT_CLASS} />
      {room.label}
      <span className="ml-auto shrink-0 rounded-[20px] border border-[color:var(--border)] px-2 py-[2px] text-[8.5px] font-bold uppercase tracking-[.08em] text-[color:var(--ink-3)]">
        Coming soon
      </span>
    </div>
  )
}

function ItRoomEntry({
  room,
  pathname,
  active,
}: {
  room: PlaybookRoom
  pathname: string
  active: boolean
}) {
  return (
    <>
      <Link
        href={IT_SUBPAGES[0].href}
        className={[
          ROOM_BASE_CLASS,
          'relative transition hover:bg-[rgba(199,203,247,.05)] hover:text-[color:var(--ink)]',
          active ? 'bg-[color:var(--panel-2)] font-bold text-[color:var(--ink)]' : '',
        ].join(' ')}
      >
        {active && (
          <span
            className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-[3px]"
            style={{ background: 'var(--grad)' }}
          />
        )}
        <span
          className={[
            ROOM_DOT_CLASS,
            active ? 'bg-[color:var(--fuchsia)] shadow-[0_0_7px_rgba(217,70,239,.7)]' : '',
          ].join(' ')}
        />
        {room.label}
      </Link>
      <div className="mb-1 ml-[19px] mt-[2px] flex flex-col gap-[1px] border-l border-[color:var(--border)] pl-[10px]">
        {IT_SUBPAGES.map(sub => {
          const on = pathname === sub.href || pathname.startsWith(sub.href + '/')
          return (
            <Link
              key={sub.slug}
              href={sub.href}
              className={[
                'flex items-center gap-[7px] rounded-[8px] px-[9px] py-[6px] text-[12.5px] text-[color:var(--ink-3)] transition hover:text-[color:var(--ink-2)]',
                on ? 'bg-[rgba(129,140,248,.12)] font-semibold text-[color:var(--ink)]' : '',
              ].join(' ')}
            >
              {sub.label}
              {sub.slug === 'dashboard' && (
                <span className="ml-auto flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-[.08em] text-[color:var(--green-fg)]">
                  <span className="h-[5px] w-[5px] rounded-full bg-[color:var(--green-fg)] shadow-[0_0_6px_var(--green-fg)]" />
                  Live
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </>
  )
}
