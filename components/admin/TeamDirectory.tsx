'use client'

import { useEffect, useMemo, useState } from 'react'
import type { StaffRole } from '@/lib/admin/gate'

// ─── TeamDirectory ──────────────────────────────────────────────────────
// All-roles, read-only Team Member phone book (25-10). Two switchable
// views (Cards / List), a client-side search, and native mailto:/tel:
// contact actions — no writes, no new endpoint. Styled through the
// console tokens (components/admin/console-theme.ts) for light + dark.

export type DirectoryMember = {
  user_id: string
  staff_role: StaffRole
  display_name: string
  title: string | null
  phone: string | null
  avatar_url: string | null
  email: string
}

type ViewMode = 'cards' | 'list'

const VIEW_STORAGE_KEY = 'funun-team-directory-view'

const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  leadership: 'Leadership',
  ae: 'Account Executive',
  bd: 'BD',
  anr: 'A&R',
  it: 'IT',
}

// Mirrors components/messages/Composer.tsx's initials() so avatar
// fallbacks read identically across the app.
function initials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function matchesSearch(member: DirectoryMember, query: string): boolean {
  if (!query) return true
  const haystack = [member.display_name, member.title ?? '', STAFF_ROLE_LABELS[member.staff_role]]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query.toLowerCase())
}

function Avatar({ member, size }: { member: DirectoryMember; size: 'sm' | 'lg' }) {
  const dims = size === 'lg' ? 'h-14 w-14 text-[16px]' : 'h-9 w-9 text-[12px]'
  if (member.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.avatar_url}
        alt={member.display_name}
        className={`${dims} flex-none rounded-full object-cover border border-[color:var(--border)]`}
      />
    )
  }
  return (
    <span
      className={`${dims} flex flex-none items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--panel-2)] font-bold text-[color:var(--ink-2)]`}
    >
      {initials(member.display_name)}
    </span>
  )
}

function RolePill({ role }: { role: StaffRole }) {
  return (
    <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--panel-2)] px-2.5 py-0.5 text-[11px] font-semibold text-[color:var(--ink-2)]">
      {STAFF_ROLE_LABELS[role]}
    </span>
  )
}

function ContactActions({ member, compact }: { member: DirectoryMember; compact?: boolean }) {
  const linkClass = compact
    ? 'rounded-md border border-[color:var(--border)] px-2 py-1 text-[11px] font-semibold text-[color:var(--ink-2)] transition hover:border-[color:var(--border-2)] hover:text-[color:var(--ink)]'
    : 'fncon-cta rounded-lg px-3 py-1.5 text-[12px] font-bold shadow transition hover:opacity-90'
  const secondaryClass = compact
    ? linkClass
    : 'rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-[12px] font-semibold text-[color:var(--ink-2)] transition hover:border-[color:var(--border-2)] hover:text-[color:var(--ink)]'
  return (
    <div className="flex flex-none items-center gap-2">
      <a href={`mailto:${member.email}`} className={linkClass}>
        Email
      </a>
      {member.phone && (
        <a href={`tel:${member.phone}`} className={secondaryClass}>
          Call
        </a>
      )}
    </div>
  )
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex flex-none gap-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] p-1">
      {(['cards', 'list'] as ViewMode[]).map(mode => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={[
            'rounded-md px-3 py-1.5 text-[12px] font-semibold capitalize transition',
            view === mode
              ? 'bg-[color:var(--indigo)]/20 text-[color:var(--ink)]'
              : 'text-[color:var(--ink-3)] hover:text-[color:var(--ink-2)]',
          ].join(' ')}
        >
          {mode}
        </button>
      ))}
    </div>
  )
}

export function TeamDirectory({ members }: { members: DirectoryMember[] }) {
  const [view, setView] = useState<ViewMode>('cards')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY)
    if (stored === 'cards' || stored === 'list') setView(stored)
  }, [])

  const handleViewChange = (next: ViewMode) => {
    setView(next)
    window.localStorage.setItem(VIEW_STORAGE_KEY, next)
  }

  const filtered = useMemo(() => members.filter(m => matchesSearch(m, query)), [members, query])

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name, title, or role…"
          className="min-w-[240px] flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)] focus:outline-none"
        />
        <ViewToggle view={view} onChange={handleViewChange} />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 text-[14px] text-[color:var(--ink-3)]">No team members match your search.</p>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(member => (
            <div
              key={member.user_id}
              className="flex flex-col gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4"
            >
              <div className="flex items-start gap-3">
                <Avatar member={member} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold text-[color:var(--ink)]">{member.display_name}</p>
                  <div className="mt-1">
                    <RolePill role={member.staff_role} />
                  </div>
                  {member.title && (
                    <p className="mt-1 truncate text-[12px] text-[color:var(--ink-3)]">{member.title}</p>
                  )}
                </div>
              </div>
              <p className="truncate text-[12px] text-[color:var(--ink-2)]">{member.email}</p>
              <ContactActions member={member} />
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[color:var(--border)]">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-[color:var(--border)] text-[11px] uppercase text-[color:var(--ink-3)]">
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold">Role</th>
                <th className="px-4 py-2 font-semibold">Title</th>
                <th className="px-4 py-2 font-semibold">Email</th>
                <th className="px-4 py-2 font-semibold">Phone</th>
                <th className="px-4 py-2 font-semibold">Contact</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(member => (
                <tr key={member.user_id} className="border-b border-[color:var(--border)] last:border-0">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar member={member} size="sm" />
                      <span className="truncate font-bold text-[color:var(--ink)]">{member.display_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <RolePill role={member.staff_role} />
                  </td>
                  <td className="px-4 py-2 text-[color:var(--ink-3)]">{member.title ?? '—'}</td>
                  <td className="px-4 py-2 text-[color:var(--ink-2)]">{member.email}</td>
                  <td className="px-4 py-2 text-[color:var(--ink-3)]">{member.phone ?? '—'}</td>
                  <td className="px-4 py-2">
                    <ContactActions member={member} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
