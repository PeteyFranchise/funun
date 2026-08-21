'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import type { StaffRole } from '@/lib/admin/gate'
// Runtime values come from the client-safe resolver, NOT from gate.ts: gate.ts
// transitively imports next/headers (via lib/supabase/server), which cannot be
// pulled into a 'use client' bundle. staff-role.ts is the module gate.ts itself
// re-exports these from, extracted precisely so client components can use them.
import { ALL_STAFF_ROLES, primaryStaffRole } from '@/lib/admin/staff-role'

// ─── StaffAdmin ─────────────────────────────────────────────────────────────
// Team Members management surface (leadership + TMS). A pixel port of the
// approved mockup: gradient add flow, List/Cards roster, "Filter by role"
// chips + search, a per-member ⋯ menu, an edit-roles drawer, and a destructive
// remove confirm. Styled entirely through the console tokens
// (components/admin/console-theme.ts) — including the seven role hues
// (--r-lead / --r-ae / …) — so light + dark both work, exactly like
// TeamDirectory. Role accents that need color-mix() are applied via inline
// `style` (correctness over Tailwind purity); everything else is arbitrary-
// value Tailwind bound to the same CSS variables.
//
// Endpoints (see app/api/admin/staff): POST create, PATCH [id] edit roles/phone,
// DELETE [id] remove, POST [id]/resend. The dynamic segment is the member's
// user_id. Local React state is the source of truth for the rendered roster;
// each successful call patches it (add → pending row, edit → roles/phone,
// remove → drop, resend → toast only).

export type StaffRow = {
  id: string
  user_id: string
  staff_role: StaffRole
  staff_roles: StaffRole[]
  display_name: string
  title: string | null
  phone: string | null
  avatar_url: string | null
  created_at: string
  email: string
  status: 'active' | 'pending'
}

type ViewMode = 'list' | 'cards'
type ToastKind = 'ok' | 'warn' | 'bad'

const VIEW_STORAGE_KEY = 'funun-team-members-view'

// Display order everywhere (add form, filter chips, role cards): legal before
// it. This is a reordering of ALL_STAFF_ROLES (which lists it before legal) for
// presentation only; ALL_STAFF_ROLES stays the validation authority.
const ROLE_ORDER: StaffRole[] = ['leadership', 'ae', 'bd', 'anr', 'legal', 'it', 'tms']

const ROLE_META: Record<StaffRole, { cssVar: string; label: string; desc: string }> = {
  leadership: { cssVar: '--r-lead', label: 'Leadership', desc: 'Full access — manages the team, clients, and deals.' },
  ae: { cssVar: '--r-ae', label: 'Account Executive', desc: 'Owns client relationships and the sales pipeline.' },
  bd: { cssVar: '--r-bd', label: 'BD', desc: 'Sources new leads and business development.' },
  anr: { cssVar: '--r-anr', label: 'A&R', desc: 'Scouts and develops artist talent.' },
  legal: { cssVar: '--r-legal', label: 'Legal', desc: 'Contracts, rights, and compliance.' },
  it: { cssVar: '--r-it', label: 'IT', desc: 'Systems, security, and the tech stack.' },
  tms: { cssVar: '--r-tms', label: 'TMS', desc: 'Team Member Services — people ops and onboarding.' },
}

const roleHue = (role: StaffRole): string => `var(${ROLE_META[role].cssVar})`

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--indigo)]'

const INPUT_CLASS =
  'w-full rounded-[11px] border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2.5 text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] transition focus:border-[color:var(--indigo)] focus:outline-none motion-reduce:transition-none'

const CONTACT_BTN = `inline-flex items-center gap-1.5 rounded-[9px] border border-[color:var(--border)] px-3 py-1.5 text-[12px] font-bold text-[color:var(--ink-2)] transition hover:border-[color:var(--border-2)] hover:text-[color:var(--ink)] motion-reduce:transition-none ${FOCUS_RING}`

const MENU_ITEM = `flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2.5 text-left text-[13px] font-semibold text-[color:var(--ink-2)] transition hover:bg-[color:var(--panel-2)] hover:text-[color:var(--ink)] motion-reduce:transition-none ${FOCUS_RING}`

const MENU_ITEM_DANGER = `flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2.5 text-left text-[13px] font-semibold transition hover:bg-[color:var(--panel-2)] motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS_RING}`

// ─── Pure helpers ───────────────────────────────────────────────────────────

function initials(name: string, email: string): string {
  const base = (name || email || '').trim()
  const parts = base.split(/\s+/).filter(Boolean)
  const str = parts.map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return str || email.charAt(0).toUpperCase() || '—'
}

function formatDate(dateString: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
      new Date(dateString)
    )
  } catch {
    return dateString
  }
}

function telHref(phone: string): string {
  return 'tel:' + phone.replace(/[^\d+]/g, '')
}

// A member's effective, de-duped, display-ordered roles. Falls back to the
// single staff_role for legacy rows whose staff_roles column is empty, and
// filters against ALL_STAFF_ROLES so unknown values never render a bare pill.
function memberRoles(m: StaffRow): StaffRole[] {
  const raw = m.staff_roles && m.staff_roles.length > 0 ? m.staff_roles : m.staff_role ? [m.staff_role] : []
  const set = new Set(raw.filter((r): r is StaffRole => (ALL_STAFF_ROLES as string[]).includes(r as string)))
  return ROLE_ORDER.filter(r => set.has(r))
}

// ─── Presentational sub-components (pure, module scope) ──────────────────────

function Icon({ children, size = 16, strokeWidth }: { children: ReactNode; size?: number; strokeWidth?: number }) {
  return (
    <svg
      className="icn"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={strokeWidth ? { strokeWidth } : undefined}
    >
      {children}
    </svg>
  )
}

function RolePill({ role }: { role: StaffRole }) {
  const hue = roleHue(role)
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11.5px] font-bold"
      style={{
        color: hue,
        backgroundColor: `color-mix(in srgb, ${hue} 13%, transparent)`,
        borderColor: `color-mix(in srgb, ${hue} 36%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: hue }} />
      {ROLE_META[role].label}
    </span>
  )
}

function RolePills({ roles, className }: { roles: StaffRole[]; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className ?? ''}`}>
      {roles.map(r => (
        <RolePill key={r} role={r} />
      ))}
    </div>
  )
}

function YouTag() {
  return (
    <span className="rounded-[6px] border border-[color:var(--border)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[color:var(--ink-3)]">
      You
    </span>
  )
}

function PendingTag() {
  return (
    <span
      className="rounded-[6px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]"
      style={{
        color: 'var(--r-bd)',
        backgroundColor: 'color-mix(in srgb, var(--r-bd) 13%, transparent)',
        border: '1px solid color-mix(in srgb, var(--r-bd) 34%, transparent)',
      }}
    >
      Pending
    </span>
  )
}

function Avatar({ member, size }: { member: StaffRow; size: 'sm' | 'lg' }) {
  const dims = size === 'lg' ? 'h-[52px] w-[52px] text-[17px]' : 'h-11 w-11 text-[15px]'
  if (member.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.avatar_url}
        alt={member.display_name}
        className={`${dims} flex-none rounded-full border border-[color:var(--border)] object-cover`}
      />
    )
  }
  const pending = member.status === 'pending'
  return (
    <span
      className={`${dims} flex flex-none items-center justify-center rounded-full font-extrabold tracking-wide ${
        pending
          ? 'border border-dashed border-[color:var(--border-2)] bg-[color:var(--panel-2)] text-[color:var(--ink-3)]'
          : 'text-white'
      }`}
      style={pending ? undefined : { background: 'var(--grad)' }}
    >
      {initials(member.display_name, member.email)}
    </span>
  )
}

function RoleCards({
  selected,
  onToggle,
  columns,
}: {
  selected: StaffRole[]
  onToggle: (role: StaffRole) => void
  columns: 2 | 3
}) {
  const set = new Set(selected)
  const cols = columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'
  return (
    <div role="group" aria-label="Roles" className={`grid gap-2.5 ${cols}`}>
      {ROLE_ORDER.map(role => {
        const meta = ROLE_META[role]
        const hue = roleHue(role)
        const on = set.has(role)
        return (
          <button
            key={role}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(role)}
            className={`relative rounded-[13px] border border-[color:var(--border)] bg-[color:var(--panel-2)] p-[13px] pr-10 text-left transition hover:border-[color:var(--border-2)] motion-reduce:transition-none ${FOCUS_RING}`}
            style={
              on
                ? {
                    borderColor: hue,
                    backgroundColor: `color-mix(in srgb, ${hue} 12%, var(--panel-2))`,
                    boxShadow: `0 0 0 1px ${hue} inset`,
                  }
                : undefined
            }
          >
            <span className="flex items-center gap-2 text-[13.5px] font-bold text-[color:var(--ink)]">
              <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: hue }} />
              {meta.label}
            </span>
            <span className="mt-1.5 block text-[11.5px] leading-snug text-[color:var(--ink-3)]">{meta.desc}</span>
            <span
              className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-[6px] text-white transition motion-reduce:transition-none"
              style={
                on ? { backgroundColor: hue, border: 'none' } : { backgroundColor: 'transparent', border: '1.5px solid var(--border-2)' }
              }
            >
              {on && (
                <Icon size={12} strokeWidth={3}>
                  <path d="M5 12l5 5L20 7" />
                </Icon>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  hint?: string
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-[0.05em] text-[color:var(--ink-2)]">
        {label}
        {required && <span style={{ color: 'var(--fuchsia)' }}> *</span>}
        {hint && <span className="ml-2 font-medium normal-case tracking-normal text-[color:var(--ink-3)]">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function StaffAdmin({
  initialStaff,
  currentUserId,
}: {
  initialStaff: StaffRow[]
  currentUserId: string
}) {
  const [staff, setStaff] = useState<StaffRow[]>(initialStaff)
  const [view, setView] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Set<StaffRole>>(new Set())

  // Add flow
  const [showAdd, setShowAdd] = useState(false)
  const [addEmail, setAddEmail] = useState('')
  const [addName, setAddName] = useState('')
  const [addPhone, setAddPhone] = useState('')
  // No role is pre-selected (see report): the mockup pre-checks Leadership, but
  // starting empty avoids silently granting the highest-authority role, and the
  // "Pick at least one role" guard still forces an explicit choice.
  const [addRoles, setAddRoles] = useState<StaffRole[]>([])
  const [creating, setCreating] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // ⋯ menu (fixed, anchored to the kebab)
  const [menu, setMenu] = useState<{ userId: string; top: number; left: number; anchorTop: number } | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuFirstRef = useRef<HTMLButtonElement | null>(null)

  // Edit-roles drawer (phase drives the enter/exit slide)
  const [drawer, setDrawer] = useState<{ userId: string; phase: 'in' | 'out' } | null>(null)
  const [drawerRoles, setDrawerRoles] = useState<StaffRole[]>([])
  const [drawerPhone, setDrawerPhone] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const drawerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Remove confirm dialog
  const [dialog, setDialog] = useState<{ userId: string; phase: 'in' | 'out' } | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const dialogTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dlgConfirmRef = useRef<HTMLButtonElement | null>(null)

  // Transient toast
  const [toast, setToast] = useState<{ msg: string; kind: ToastKind } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string, kind: ToastKind = 'ok') => {
    setToast({ msg, kind })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])

  // Restore the last-used view; clean up any pending timers on unmount.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY)
      if (stored === 'list' || stored === 'cards') setView(stored)
    } catch {
      /* localStorage unavailable — keep the default */
    }
  }, [])

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
      if (drawerTimer.current) clearTimeout(drawerTimer.current)
      if (dialogTimer.current) clearTimeout(dialogTimer.current)
    },
    []
  )

  const changeView = (next: ViewMode) => {
    setView(next)
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      /* best effort */
    }
  }

  // ── Derived roster data ──
  const roleCounts = useMemo(() => {
    const counts = new Map<StaffRole, number>()
    staff.forEach(m => memberRoles(m).forEach(r => counts.set(r, (counts.get(r) ?? 0) + 1)))
    return counts
  }, [staff])

  const presentRoles = useMemo(() => ROLE_ORDER.filter(r => (roleCounts.get(r) ?? 0) > 0), [roleCounts])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return staff.filter(m => {
      if (filter.size > 0) {
        const roles = memberRoles(m)
        if (!roles.some(r => filter.has(r))) return false
      }
      if (q) {
        const hay = `${m.display_name} ${m.email}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [staff, search, filter])

  const filterActive = filter.size > 0 || search.trim().length > 0
  const countNote = filterActive
    ? `· showing ${filtered.length} of ${staff.length}`
    : `· ${staff.length} ${staff.length === 1 ? 'person' : 'people'}`

  // ── Toggles ──
  const toggleAddRole = (r: StaffRole) =>
    setAddRoles(prev => (prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]))
  const toggleDrawerRole = (r: StaffRole) =>
    setDrawerRoles(prev => (prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]))
  const toggleFilter = (r: StaffRole) =>
    setFilter(prev => {
      const next = new Set(prev)
      if (next.has(r)) next.delete(r)
      else next.add(r)
      return next
    })

  // ── ⋯ menu open/close + positioning ──
  const toggleMenu = (userId: string, e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (menu?.userId === userId) {
      setMenu(null)
      return
    }
    const r = e.currentTarget.getBoundingClientRect()
    const menuWidth = 210
    let left = r.right - menuWidth
    if (left < 8) left = 8
    setMenu({ userId, top: r.bottom + 6, left, anchorTop: r.top })
  }

  // Flip the menu above its anchor if it would overflow the viewport bottom.
  useEffect(() => {
    if (!menu || !menuRef.current) return
    const mh = menuRef.current.offsetHeight
    if (menu.top + mh > window.innerHeight - 8) {
      const nextTop = menu.anchorTop - mh - 6
      if (nextTop !== menu.top) setMenu(m => (m ? { ...m, top: nextTop } : m))
    }
  }, [menu])

  // Close the menu on outside click, scroll, or resize.
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      const t = e.target
      if (t instanceof Node && menuRef.current?.contains(t)) return
      if (t instanceof Element && t.closest('[data-kebab="true"]')) return
      setMenu(null)
    }
    const onScroll = () => setMenu(null)
    document.addEventListener('click', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('click', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [menu])

  const menuUserId = menu?.userId
  useEffect(() => {
    if (menuUserId) menuFirstRef.current?.focus()
  }, [menuUserId])

  // ── Drawer open/close (animated) ──
  const openDrawer = useCallback(
    (userId: string) => {
      const m = staff.find(x => x.user_id === userId)
      if (!m) return
      setDrawerRoles(memberRoles(m))
      setDrawerPhone(m.phone ?? '')
      setEditError(null)
      if (drawerTimer.current) clearTimeout(drawerTimer.current)
      setDrawer({ userId, phase: 'out' })
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setDrawer(d => (d ? { ...d, phase: 'in' } : d)))
      )
    },
    [staff]
  )

  const closeDrawer = useCallback(() => {
    setDrawer(d => (d ? { ...d, phase: 'out' } : d))
    if (drawerTimer.current) clearTimeout(drawerTimer.current)
    drawerTimer.current = setTimeout(() => setDrawer(null), 280)
  }, [])

  // ── Dialog open/close (animated) ──
  const openDialog = useCallback((userId: string) => {
    setRemoveError(null)
    if (dialogTimer.current) clearTimeout(dialogTimer.current)
    setDialog({ userId, phase: 'out' })
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setDialog(d => (d ? { ...d, phase: 'in' } : d)))
    )
  }, [])

  const closeDialog = useCallback(() => {
    setDialog(d => (d ? { ...d, phase: 'out' } : d))
    if (dialogTimer.current) clearTimeout(dialogTimer.current)
    dialogTimer.current = setTimeout(() => setDialog(null), 200)
  }, [])

  const dialogUserId = dialog?.userId
  useEffect(() => {
    if (dialogUserId) dlgConfirmRef.current?.focus()
  }, [dialogUserId])

  // Escape closes, most-transient first (menu → dialog → drawer).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (menu) setMenu(null)
      else if (dialog) closeDialog()
      else if (drawer) closeDrawer()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menu, dialog, drawer, closeDialog, closeDrawer])

  // ── Server actions ──
  const handleCreate = async () => {
    const email = addEmail.trim()
    const name = addName.trim()
    const phone = addPhone.trim()
    if (!email || !name) {
      setAddError('Add an email and a display name.')
      return
    }
    if (addRoles.length === 0) {
      setAddError('Pick at least one role.')
      return
    }
    setCreating(true)
    setAddError(null)
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, display_name: name, staff_roles: addRoles, ...(phone ? { phone } : {}) }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        data?: Partial<StaffRow>
        error?: string
        emailSent?: boolean
      }
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong — please try again.')
      const d = json.data
      if (d) {
        const created: StaffRow = {
          id: d.id ?? d.user_id ?? email,
          user_id: d.user_id ?? d.id ?? '',
          staff_role: (d.staff_role as StaffRole) ?? primaryStaffRole(addRoles) ?? addRoles[0],
          staff_roles: (d.staff_roles as StaffRole[] | undefined) ?? addRoles,
          display_name: d.display_name ?? name,
          title: d.title ?? null,
          phone: d.phone ?? (phone || null),
          avatar_url: d.avatar_url ?? null,
          created_at: d.created_at ?? new Date().toISOString(),
          email: d.email ?? email,
          status: 'pending',
        }
        setStaff(prev => [created, ...prev])
      }
      setAddEmail('')
      setAddName('')
      setAddPhone('')
      setAddRoles([])
      setShowAdd(false)
      if (json.emailSent === false) {
        showToast(`Added, but the invite email to ${email} could not be delivered.`, 'warn')
      } else {
        showToast(`Invite sent to ${email}.`, 'ok')
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    } finally {
      setCreating(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!drawer) return
    const userId = drawer.userId
    const roles = drawerRoles
    const phone = drawerPhone.trim()
    if (roles.length === 0) {
      setEditError('Keep at least one role.')
      return
    }
    setSavingEdit(true)
    setEditError(null)
    try {
      const res = await fetch(`/api/admin/staff/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_roles: roles, phone }),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: Partial<StaffRow>; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Could not save changes.')
      const primary = primaryStaffRole(roles) ?? roles[0]
      const name = staff.find(m => m.user_id === userId)?.display_name ?? 'Member'
      setStaff(prev =>
        prev.map(m =>
          m.user_id === userId ? { ...m, staff_roles: roles, staff_role: primary, phone: phone || null } : m
        )
      )
      closeDrawer()
      showToast(`${name} updated.`, 'ok')
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleRemove = async () => {
    if (!dialog) return
    const userId = dialog.userId
    setRemoving(true)
    setRemoveError(null)
    try {
      const res = await fetch(`/api/admin/staff/${encodeURIComponent(userId)}`, { method: 'DELETE' })
      const json = (await res.json().catch(() => ({}))) as { data?: { removed?: boolean }; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Could not remove this member.')
      const name = staff.find(m => m.user_id === userId)?.display_name ?? 'Member'
      setStaff(prev => prev.filter(m => m.user_id !== userId))
      closeDialog()
      showToast(`${name} removed from the team.`, 'bad')
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Could not remove this member.')
    } finally {
      setRemoving(false)
    }
  }

  const handleResend = async (userId: string) => {
    const member = staff.find(m => m.user_id === userId)
    const who = member?.email ?? 'this member'
    try {
      const res = await fetch(`/api/admin/staff/${encodeURIComponent(userId)}/resend`, { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as { data?: { emailSent?: boolean }; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Could not resend the invite.')
      if (json.data?.emailSent === false) showToast(`Couldn’t deliver the invite to ${who}.`, 'warn')
      else showToast(`Invite re-sent to ${who}.`, 'ok')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not resend the invite.', 'bad')
    }
  }

  const onMenuAction = (act: 'edit' | 'resend' | 'remove', userId: string) => {
    setMenu(null)
    if (act === 'edit') openDrawer(userId)
    else if (act === 'resend') handleResend(userId)
    else openDialog(userId)
  }

  // ── Render helpers that close over state ──
  const renderKebab = (m: StaffRow) => {
    const open = menu?.userId === m.user_id
    return (
      <button
        type="button"
        data-kebab="true"
        aria-label={`Manage ${m.display_name || m.email}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={e => toggleMenu(m.user_id, e)}
        className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] border transition motion-reduce:transition-none ${FOCUS_RING} ${
          open
            ? 'border-[color:var(--border)] bg-[color:var(--panel-2)] text-[color:var(--ink)] opacity-100'
            : 'border-transparent text-[color:var(--ink-3)] opacity-60 hover:border-[color:var(--border)] hover:bg-[color:var(--panel-2)] hover:text-[color:var(--ink)] group-hover:opacity-100 focus-visible:opacity-100'
        }`}
      >
        <Icon size={17}>
          <circle cx="12" cy="5" r="1.3" />
          <circle cx="12" cy="12" r="1.3" />
          <circle cx="12" cy="19" r="1.3" />
        </Icon>
      </button>
    )
  }

  const renderContactMeta = (m: StaffRow) => (
    <>
      <a
        href={`mailto:${m.email}`}
        onClick={e => e.stopPropagation()}
        className="font-semibold text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:underline"
      >
        {m.email}
      </a>
      {m.phone && (
        <>
          {' · '}
          <a
            href={telHref(m.phone)}
            onClick={e => e.stopPropagation()}
            className="font-semibold text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:underline"
          >
            {m.phone}
          </a>
        </>
      )}
      {' · '}
      {m.status === 'pending' ? `Invited ${formatDate(m.created_at)} · awaiting` : `Joined ${formatDate(m.created_at)}`}
    </>
  )

  const drawerMember = drawer ? staff.find(m => m.user_id === drawer.userId) : undefined
  const dialogMember = dialog ? staff.find(m => m.user_id === dialog.userId) : undefined
  const menuMember = menu ? staff.find(m => m.user_id === menu.userId) : undefined

  return (
    <>
      <div className="max-w-[1140px]">
        {/* Header */}
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-start">
          <div>
            <h1 className="text-[27px] font-extrabold tracking-[-0.02em] text-[color:var(--ink)]">Team Members</h1>
            <p className="mt-1.5 max-w-[48ch] text-[13.5px] leading-relaxed text-[color:var(--ink-2)]">
              The people who run Funūn. Add a teammate, give them one or more roles, and they’re invited by email to
              join.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowAdd(true)
              setAddError(null)
            }}
            className={`inline-flex flex-none items-center gap-2 rounded-[11px] px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:opacity-90 motion-reduce:transition-none ${FOCUS_RING}`}
            style={{ background: 'var(--grad)' }}
          >
            <Icon>
              <path d="M12 5v14M5 12h14" />
            </Icon>
            Add team member
          </button>
        </div>

        {/* Add panel */}
        {showAdd && (
          <section
            aria-label="Add a team member"
            className="mt-6 rounded-[18px] border border-[color:var(--border-2)] bg-[color:var(--panel)] p-[22px]"
          >
            <h2 className="text-[16px] font-extrabold text-[color:var(--ink)]">Add a team member</h2>
            <p className="mb-4 mt-1.5 max-w-[46ch] text-[12.5px] leading-relaxed text-[color:var(--ink-3)]">
              They’ll get an email invite to set a password and join the team.
            </p>
            {addError && <p className="mb-3 text-[13px] font-semibold text-[color:var(--rose-fg)]">{addError}</p>}
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Email" htmlFor="staff-email" required>
                <input
                  id="staff-email"
                  type="email"
                  autoComplete="off"
                  value={addEmail}
                  onChange={e => setAddEmail(e.target.value)}
                  placeholder="name@funun.studio"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Display name" htmlFor="staff-name" required>
                <input
                  id="staff-name"
                  type="text"
                  autoComplete="off"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  placeholder="e.g. Jordan Ellis"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Phone" htmlFor="staff-phone" hint="optional">
                <input
                  id="staff-phone"
                  type="tel"
                  autoComplete="off"
                  value={addPhone}
                  onChange={e => setAddPhone(e.target.value)}
                  placeholder="(313) 555-0142"
                  className={INPUT_CLASS}
                />
              </Field>
            </div>
            <div className="mt-4">
              <p className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.05em] text-[color:var(--ink-2)]">
                Roles<span style={{ color: 'var(--fuchsia)' }}> *</span>
                <span className="ml-2 font-medium normal-case tracking-normal text-[color:var(--ink-3)]">
                  Select one or more — teammates often wear several hats.
                </span>
              </p>
              <RoleCards selected={addRoles} onToggle={toggleAddRole} columns={3} />
            </div>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className={`inline-flex items-center justify-center rounded-[11px] px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:opacity-90 disabled:opacity-50 motion-reduce:transition-none ${FOCUS_RING}`}
                style={{ background: 'var(--grad)' }}
              >
                {creating ? 'Creating…' : 'Create + invite'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false)
                  setAddError(null)
                }}
                className={`rounded-[11px] border border-[color:var(--border-2)] px-4 py-2.5 text-[13.5px] font-bold text-[color:var(--ink-2)] transition hover:border-[color:var(--ink-3)] hover:text-[color:var(--ink)] motion-reduce:transition-none ${FOCUS_RING}`}
              >
                Cancel
              </button>
            </div>
          </section>
        )}

        {/* Roster bar: search + view toggle */}
        <div className="mb-3.5 mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="relative min-w-[210px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ink-3)]">
              <Icon>
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4-4" />
              </Icon>
            </span>
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search teammates"
              placeholder="Search teammates by name or email…"
              className="w-full rounded-[11px] border border-[color:var(--border)] bg-[color:var(--panel-2)] py-2.5 pl-9 pr-3 text-[13.5px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] transition focus:border-[color:var(--indigo)] focus:outline-none motion-reduce:transition-none"
            />
          </div>
          <div
            role="group"
            aria-label="View"
            className="flex flex-none gap-0.5 rounded-[10px] border border-[color:var(--border)] bg-[color:var(--panel-2)] p-[3px]"
          >
            {(['list', 'cards'] as ViewMode[]).map(mode => {
              const on = view === mode
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={on}
                  onClick={() => changeView(mode)}
                  className={`inline-flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12px] font-bold transition motion-reduce:transition-none ${FOCUS_RING} ${
                    on ? 'text-[color:var(--ink)]' : 'text-[color:var(--ink-3)] hover:text-[color:var(--ink-2)]'
                  }`}
                  style={on ? { backgroundColor: 'color-mix(in srgb, var(--indigo) 22%, transparent)' } : undefined}
                >
                  {mode === 'list' ? (
                    <Icon size={14}>
                      <path d="M4 6h16M4 12h16M4 18h16" />
                    </Icon>
                  ) : (
                    <Icon size={14}>
                      <rect x="3" y="3" width="8" height="8" rx="1.5" />
                      <rect x="13" y="3" width="8" height="8" rx="1.5" />
                      <rect x="3" y="13" width="8" height="8" rx="1.5" />
                      <rect x="13" y="13" width="8" height="8" rx="1.5" />
                    </Icon>
                  )}
                  {mode === 'list' ? 'List' : 'Cards'}
                </button>
              )
            })}
          </div>
        </div>

        {/* Filter by role */}
        <div className="mb-[18px] flex flex-wrap items-center gap-2 border-b border-[color:var(--border)] pb-4">
          <span className="mr-0.5 inline-flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.04em] text-[color:var(--ink-3)]">
            <Icon size={14}>
              <path d="M4 5h16l-6 8v5l-4 2v-7z" />
            </Icon>
            Filter by role
          </span>
          {presentRoles.length === 0 ? (
            <span className="text-[12.5px] text-[color:var(--ink-3)]">No roles yet</span>
          ) : (
            presentRoles.map(role => {
              const on = filter.has(role)
              const hue = roleHue(role)
              return (
                <button
                  key={role}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleFilter(role)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition motion-reduce:transition-none ${FOCUS_RING} ${
                    on
                      ? ''
                      : 'border-[color:var(--border)] bg-[color:var(--panel-2)] text-[color:var(--ink-2)] hover:border-[color:var(--border-2)] hover:text-[color:var(--ink)]'
                  }`}
                  style={
                    on
                      ? {
                          color: hue,
                          backgroundColor: `color-mix(in srgb, ${hue} 14%, transparent)`,
                          borderColor: `color-mix(in srgb, ${hue} 42%, transparent)`,
                        }
                      : undefined
                  }
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: hue }} />
                  {ROLE_META[role].label}
                  <span
                    className={`text-[11px] font-bold ${on ? 'opacity-75' : 'text-[color:var(--ink-3)]'}`}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {roleCounts.get(role)}
                  </span>
                </button>
              )
            })
          )}
          {filter.size > 0 && (
            <button
              type="button"
              onClick={() => setFilter(new Set())}
              className={`rounded-[8px] px-1.5 py-1.5 text-[12px] font-bold text-[color:var(--ink-3)] transition hover:text-[color:var(--ink)] hover:underline motion-reduce:transition-none ${FOCUS_RING}`}
            >
              Clear
            </button>
          )}
        </div>

        {/* List label */}
        <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
          Team
          <span className="text-[11px] font-semibold normal-case tracking-normal text-[color:var(--ink-2)]">
            {countNote}
          </span>
        </p>

        {/* Roster */}
        {staff.length === 0 ? (
          <div className="rounded-[15px] border border-dashed border-[color:var(--border-2)] px-5 py-9 text-center text-[13.5px] text-[color:var(--ink-3)]">
            No team members yet. Add the first one with “Add team member”.
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[15px] border border-dashed border-[color:var(--border-2)] px-5 py-9 text-center text-[13.5px] text-[color:var(--ink-3)]">
            No teammates match.{' '}
            <button
              type="button"
              onClick={() => {
                setFilter(new Set())
                setSearch('')
              }}
              className="font-bold text-[color:var(--indigo)] hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : view === 'list' ? (
          <div className="flex flex-col gap-2.5">
            {filtered.map(m => (
              <div
                key={m.user_id}
                className="group flex items-center gap-4 rounded-[15px] border border-[color:var(--border)] bg-[color:var(--panel)] px-4 py-4 transition hover:border-[color:var(--border-2)] motion-reduce:transition-none"
              >
                <Avatar member={m} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[15px] font-bold text-[color:var(--ink)]">
                    <span className="truncate">{m.display_name || m.email}</span>
                    {m.user_id === currentUserId && <YouTag />}
                    {m.status === 'pending' && <PendingTag />}
                  </div>
                  <div className="mt-0.5 truncate text-[12.5px] text-[color:var(--ink-3)]">{renderContactMeta(m)}</div>
                </div>
                <RolePills roles={memberRoles(m)} className="max-w-[50%] justify-end" />
                {renderKebab(m)}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
            {filtered.map(m => (
              <div
                key={m.user_id}
                className="group flex flex-col gap-3 rounded-[16px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4 transition hover:border-[color:var(--border-2)] motion-reduce:transition-none"
              >
                <div className="flex items-start justify-between gap-2.5">
                  <Avatar member={m} size="lg" />
                  {renderKebab(m)}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-[color:var(--ink)]">
                    <span>{m.display_name || m.email}</span>
                    {m.user_id === currentUserId && <YouTag />}
                    {m.status === 'pending' && <PendingTag />}
                  </div>
                  <div className="mt-0.5 text-[12px] text-[color:var(--ink-3)]">
                    {m.status === 'pending'
                      ? `Invited ${formatDate(m.created_at)} · awaiting`
                      : `Joined ${formatDate(m.created_at)}`}
                  </div>
                </div>
                <RolePills roles={memberRoles(m)} />
                <div className="flex flex-wrap gap-2">
                  <a href={`mailto:${m.email}`} className={CONTACT_BTN}>
                    <Icon size={14}>
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="M4 7l8 6 8-6" />
                    </Icon>
                    Email
                  </a>
                  {m.phone && (
                    <a href={telHref(m.phone)} className={CONTACT_BTN}>
                      <Icon size={14}>
                        <path d="M4 4h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 2 6a2 2 0 0 1 2-2z" />
                      </Icon>
                      Call
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ⋯ menu */}
      {menu && menuMember && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${menuMember.display_name || menuMember.email}`}
          className="fixed z-[60] min-w-[196px] rounded-[12px] border border-[color:var(--border-2)] bg-[color:var(--panel)] p-1.5"
          style={{ top: menu.top, left: menu.left, boxShadow: '0 22px 55px -22px rgba(0,0,0,.65)' }}
        >
          <button
            ref={menuFirstRef}
            type="button"
            role="menuitem"
            onClick={() => onMenuAction('edit', menuMember.user_id)}
            className={MENU_ITEM}
          >
            <Icon>
              <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17z" />
            </Icon>
            Edit roles
          </button>
          {menuMember.status === 'pending' && (
            <button type="button" role="menuitem" onClick={() => onMenuAction('resend', menuMember.user_id)} className={MENU_ITEM}>
              <Icon>
                <path d="M4 4l16 8-16 8 4-8z" />
              </Icon>
              Resend invite
            </button>
          )}
          <div className="mx-1.5 my-1 h-px bg-[color:var(--border)]" />
          <button
            type="button"
            role="menuitem"
            disabled={menuMember.user_id === currentUserId}
            onClick={() => onMenuAction('remove', menuMember.user_id)}
            className={MENU_ITEM_DANGER}
            style={{ color: 'var(--rose-fg)' }}
          >
            <Icon>
              <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
            </Icon>
            Remove from team
          </button>
          {menuMember.user_id === currentUserId && (
            <p className="px-2.5 pb-1.5 text-[10.5px] text-[color:var(--ink-3)]">You can’t remove yourself.</p>
          )}
        </div>
      )}

      {/* Edit-roles drawer */}
      {drawer && drawerMember && (
        <>
          <div
            aria-hidden="true"
            onClick={closeDrawer}
            className={`fixed inset-0 z-[50] bg-[rgba(6,5,16,0.62)] backdrop-blur-[3px] transition-opacity duration-200 motion-reduce:transition-none ${
              drawer.phase === 'in' ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`Manage ${drawerMember.display_name || drawerMember.email}`}
            className={`fixed right-0 top-0 z-[55] flex h-screen w-[min(444px,94vw)] flex-col border-l border-[color:var(--border-2)] bg-[color:var(--panel)] transition-transform duration-[260ms] ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none ${
              drawer.phase === 'in' ? 'translate-x-0' : 'translate-x-full'
            }`}
            style={{ boxShadow: '-30px 0 70px -34px rgba(0,0,0,.7)' }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[color:var(--border)] px-5 pb-4 pt-[18px]">
              <div className="min-w-0">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
                  Manage member
                </div>
                <div className="flex items-center gap-3">
                  <Avatar member={drawerMember} size="lg" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[16px] font-extrabold text-[color:var(--ink)]">
                      <span className="truncate">{drawerMember.display_name || drawerMember.email}</span>
                      {drawerMember.user_id === currentUserId && <YouTag />}
                      {drawerMember.status === 'pending' && <PendingTag />}
                    </div>
                    <div className="mt-0.5 truncate text-[12.5px] text-[color:var(--ink-3)]">{drawerMember.email}</div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Close"
                className={`flex h-8 w-8 flex-none items-center justify-center rounded-[8px] border border-[color:var(--border)] text-[color:var(--ink-3)] transition hover:border-[color:var(--ink-3)] hover:text-[color:var(--ink)] motion-reduce:transition-none ${FOCUS_RING}`}
              >
                <Icon>
                  <path d="M6 6l12 12M18 6L6 18" />
                </Icon>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-[18px]">
              <p className="mb-1 text-[11.5px] font-bold uppercase tracking-[0.05em] text-[color:var(--ink-2)]">Roles</p>
              <p className="mb-3 text-[12px] text-[color:var(--ink-3)]">
                Toggle the hats this person wears. At least one is required.
              </p>
              <RoleCards selected={drawerRoles} onToggle={toggleDrawerRole} columns={2} />

              <div className="mt-5">
                <p className="mb-1 text-[11.5px] font-bold uppercase tracking-[0.05em] text-[color:var(--ink-2)]">
                  Contact
                </p>
                <p className="mb-3 text-[12px] text-[color:var(--ink-3)]">How teammates reach them.</p>
                <div className="mb-3">
                  <label htmlFor="dw-email" className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-[0.05em] text-[color:var(--ink-2)]">
                    Email
                  </label>
                  <input
                    id="dw-email"
                    type="email"
                    value={drawerMember.email}
                    disabled
                    className={`${INPUT_CLASS} disabled:cursor-not-allowed disabled:opacity-55`}
                  />
                </div>
                <div>
                  <label htmlFor="dw-phone" className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-[0.05em] text-[color:var(--ink-2)]">
                    Phone
                  </label>
                  <input
                    id="dw-phone"
                    type="tel"
                    value={drawerPhone}
                    onChange={e => setDrawerPhone(e.target.value)}
                    placeholder="(313) 555-0142"
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              {editError && <p className="mt-4 text-[13px] font-semibold text-[color:var(--rose-fg)]">{editError}</p>}

              {drawerMember.user_id !== currentUserId && (
                <div className="mt-5 border-t border-[color:var(--border)] pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      const id = drawer.userId
                      closeDrawer()
                      window.setTimeout(() => openDialog(id), 150)
                    }}
                    className={`inline-flex items-center gap-2 text-[12.5px] font-bold text-[color:var(--rose-fg)] transition hover:underline motion-reduce:transition-none ${FOCUS_RING}`}
                  >
                    <Icon size={15}>
                      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
                    </Icon>
                    Remove from team
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-2.5 border-t border-[color:var(--border)] px-5 py-3.5">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className={`flex-1 rounded-[11px] px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:opacity-90 disabled:opacity-50 motion-reduce:transition-none ${FOCUS_RING}`}
                style={{ background: 'var(--grad)' }}
              >
                {savingEdit ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={closeDrawer}
                className={`flex-1 rounded-[11px] border border-[color:var(--border-2)] px-4 py-2.5 text-[13.5px] font-bold text-[color:var(--ink-2)] transition hover:border-[color:var(--ink-3)] hover:text-[color:var(--ink)] motion-reduce:transition-none ${FOCUS_RING}`}
              >
                Cancel
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Remove confirm dialog */}
      {dialog && dialogMember && (
        <>
          <div
            aria-hidden="true"
            onClick={closeDialog}
            className={`fixed inset-0 z-[50] bg-[rgba(6,5,16,0.62)] backdrop-blur-[3px] transition-opacity duration-200 motion-reduce:transition-none ${
              dialog.phase === 'in' ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="staff-remove-title"
            className={`fixed left-1/2 top-1/2 z-[56] w-[min(410px,92vw)] rounded-[16px] border border-[color:var(--border-2)] bg-[color:var(--panel)] p-[22px] transition-all duration-200 motion-reduce:transition-none ${
              dialog.phase === 'in' ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              transform: dialog.phase === 'in' ? 'translate(-50%,-50%)' : 'translate(-50%,-48%)',
              boxShadow: '0 34px 80px -28px rgba(0,0,0,.75)',
            }}
          >
            <div
              className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-[11px]"
              style={{ color: 'var(--rose-fg)', background: 'var(--rose-bg)', border: '1px solid var(--rose-line)' }}
            >
              <Icon size={20}>
                <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" />
              </Icon>
            </div>
            <h3 id="staff-remove-title" className="mb-1.5 text-[17px] font-extrabold text-[color:var(--ink)]">
              Remove {dialogMember.display_name || dialogMember.email}?
            </h3>
            <p className="mb-5 text-[13px] leading-relaxed text-[color:var(--ink-2)]">
              <b className="font-bold text-[color:var(--ink)]">{dialogMember.display_name || dialogMember.email}</b> will
              lose access to the Team Console immediately, and any invite link stops working. This can’t be undone.
            </p>
            {removeError && <p className="mb-3 text-[13px] font-semibold text-[color:var(--rose-fg)]">{removeError}</p>}
            <div className="flex gap-2.5">
              <button
                ref={dlgConfirmRef}
                type="button"
                onClick={handleRemove}
                disabled={removing}
                className={`flex-1 rounded-[11px] px-4 py-2.5 text-[13.5px] font-bold transition hover:opacity-90 disabled:opacity-50 motion-reduce:transition-none ${FOCUS_RING}`}
                style={{ background: 'var(--rose-fg)', color: 'var(--ground)' }}
              >
                {removing ? 'Removing…' : 'Remove'}
              </button>
              <button
                type="button"
                onClick={closeDialog}
                className={`flex-1 rounded-[11px] border border-[color:var(--border-2)] px-4 py-2.5 text-[13.5px] font-bold text-[color:var(--ink-2)] transition hover:border-[color:var(--ink-3)] hover:text-[color:var(--ink)] motion-reduce:transition-none ${FOCUS_RING}`}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2.5 rounded-[12px] border border-[color:var(--border-2)] bg-[color:var(--panel)] px-4 py-3 text-[13px] font-semibold text-[color:var(--ink)]"
          style={{ boxShadow: '0 18px 44px -18px rgba(0,0,0,.6)' }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor:
                toast.kind === 'bad' ? 'var(--rose-fg)' : toast.kind === 'warn' ? 'var(--amber-fg)' : 'var(--green-fg)',
            }}
          />
          {toast.msg}
        </div>
      )}
    </>
  )
}
