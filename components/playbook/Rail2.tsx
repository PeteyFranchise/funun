'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PLAYBOOK_ROOMS, IT_SUBPAGES, type PlaybookRoom } from '@/lib/playbook/nav'

// Rail 2 — the Playbook's secondary sidebar of rooms/sub-rooms. Built to
// playbook-double-sidebar.html's `.rail2` (33-UI-SPEC.md "Rail
// reconciliation" #2). Reads PLAYBOOK_ROOMS/IT_SUBPAGES from
// lib/playbook/nav.ts as the single source — never a re-declared local
// list.
//
// `canSeeItRoom` is resolved server-side by the caller (the 33-05 nested
// layout, from getStaffRole) and passed down. When false, the IT Team room
// is omitted from the DOM entirely — not rendered locked or greyed (D-06,
// T-33-04 mitigation).
const ROOM_BASE_CLASS =
  'flex items-center gap-[9px] rounded-[9px] px-[10px] py-[8px] text-[13.5px] font-medium text-[color:var(--ink-2)]'

const ROOM_DOT_CLASS = 'h-[6px] w-[6px] flex-none rounded-full bg-[color:var(--ink-3)]'

export function Rail2({ canSeeItRoom }: { canSeeItRoom: boolean }) {
  const pathname = usePathname() ?? ''
  const itRoomActive = pathname.startsWith('/admin/playbook/it')

  return (
    <aside className="sticky top-0 flex h-screen w-[238px] flex-none flex-col gap-[2px] overflow-y-auto border-r border-[color:var(--border)] bg-[color:var(--panel)] px-[14px] py-[20px]">
      <div className="flex items-center gap-[9px] px-2 pb-1">
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
        <span className="text-[15px] font-extrabold tracking-[-.01em] text-[color:var(--ink)]">
          The Playbook
        </span>
      </div>
      <div className="mb-2 border-b border-[color:var(--border)] px-2 pb-3 text-[11px] text-[color:var(--ink-3)]">
        Company wiki · SOPs, topics &amp; plays
      </div>

      {PLAYBOOK_ROOMS.map(room => {
        // Only the IT Team room is role-conditional (D-06) — every other
        // room is always a "Coming soon" ghost for every staff member
        // (D-05). Omitting the IT room from the map() output (returning
        // null) keeps it out of the DOM entirely for non-authorized staff.
        if (room.itGated) {
          if (!canSeeItRoom) return null
          return <ItRoomEntry key={room.id} room={room} pathname={pathname} active={itRoomActive} />
        }
        return <GhostRoom key={room.id} room={room} />
      })}
    </aside>
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
