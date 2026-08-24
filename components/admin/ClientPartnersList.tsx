'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  COMPANIES_COLUMNS,
  CLIENTS_COLUMNS,
  DEFAULT_SORT,
  sortRows,
  resolveHealth,
  HEALTH_TONE as HEALTH_RENDER_MODE,
  type ColumnDef,
  type ClientPartnerRow,
  type SortDir,
  type SortState,
} from '@/lib/client-partners/columns'

// ─── ClientPartnersList (R1/R2) ─────────────────────────────────────────────
// The shared list+tabs+insight-columns surface. List-source-agnostic —
// takes row data + a drill-in href builder in, so the 31.1 leadership tower
// reuses this exact component unfiltered (only the rows passed in differ).
//
// Column visibility/order + active sort key persist per-AE via the same
// client-set cookie mechanism as the console theme
// (components/admin/AdminThemeToggle.tsx's document.cookie pattern) —
// presentation-only state, never a data-authority source (T-31-20).

export type ClientPartnersListMode = 'clients' | 'companies'

export type ClientPartnersListProps = {
  companyRows: ClientPartnerRow[]
  clientRows: ClientPartnerRow[]
  // Base paths (NOT function builders): a Server Component parent cannot pass a
  // function across the RSC boundary to this Client Component — in production it
  // throws "Functions cannot be passed directly to Client Components" at render
  // time (dev tolerates it). The row href is built here as `${base}/${id}`.
  companyHrefBase: string
  clientHrefBase: string
  /** Which pill tab is selected on first render. Defaults to 'clients'. */
  initialTab?: ClientPartnersListMode
  // 31.1 leadership tower (D-31.1-05) — a data/string-only row-action slot
  // for the Assigned-AE column: when set, a row with no assignedAeId
  // renders a "+ Assign AE"-style button with this label instead of the
  // usual dash. Deliberately NOT a function prop (Pitfall 1 — this
  // component may be handed props assembled from an RSC page); the button
  // is inert until plan 06 wires its click behavior directly here.
  rowActionLabel?: string
}

const CP_COLUMNS_COOKIE = 'fnadmin_cp_columns'

type PersistedTabState = {
  order: string[]
  hidden: string[]
  sortKey: string
  sortDir: SortDir
}

type PersistedState = Partial<Record<ClientPartnersListMode, PersistedTabState>>

function readPersistedState(): PersistedState {
  if (typeof document === 'undefined') return {}
  const match = document.cookie.match(new RegExp('(?:^|; )' + CP_COLUMNS_COOKIE + '=([^;]*)'))
  if (!match) return {}
  try {
    return JSON.parse(decodeURIComponent(match[1])) as PersistedState
  } catch {
    return {}
  }
}

function writePersistedState(state: PersistedState) {
  if (typeof document === 'undefined') return
  document.cookie = `${CP_COLUMNS_COOKIE}=${encodeURIComponent(JSON.stringify(state))}; path=/; max-age=31536000`
}

const TAB_COLUMNS: Record<ClientPartnersListMode, ColumnDef[]> = {
  clients: CLIENTS_COLUMNS,
  companies: COMPANIES_COLUMNS,
}

function nonIdentityKeys(cols: ColumnDef[]): string[] {
  return cols.filter(c => !c.isIdentity).map(c => c.key)
}

// Reconciles a persisted order against the current column set: keeps only
// known non-identity keys (drops stale ones from an older cookie), appends
// any new columns not yet in the cookie so a shipped column is never
// silently missing.
function sanitizeOrder(order: string[] | undefined, cols: ColumnDef[]): string[] {
  const validKeys = new Set(nonIdentityKeys(cols))
  const fromCookie = (order ?? []).filter(k => validKeys.has(k))
  const seen = new Set(fromCookie)
  const appended = nonIdentityKeys(cols).filter(k => !seen.has(k))
  return [...fromCookie, ...appended]
}

function sanitizeHidden(hidden: string[] | undefined, cols: ColumnDef[]): Set<string> {
  const validKeys = new Set(nonIdentityKeys(cols))
  return new Set((hidden ?? []).filter(k => validKeys.has(k)))
}

function sanitizeSort(persisted: PersistedTabState | undefined, cols: ColumnDef[]): SortState {
  if (!persisted) return DEFAULT_SORT
  const known = cols.some(c => c.key === persisted.sortKey)
  if (!known) return DEFAULT_SORT
  return { key: persisted.sortKey, dir: persisted.sortDir === 'desc' ? 'desc' : 'asc' }
}

// ─── Cell rendering ─────────────────────────────────────────────────────

function initialsFor(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2)
  const initials = parts.map(w => w[0]?.toUpperCase() ?? '').join('')
  return initials || '—'
}

function ZeroDash() {
  return <span className="text-[color:var(--ink-3)]">—</span>
}

function formatMoney(value: number | null | undefined) {
  if (!value) return <ZeroDash />
  return <span className="text-money2">${value.toLocaleString()}</span>
}

function formatCount(value: number | null | undefined) {
  if (!value) return <span className="text-[color:var(--ink-3)]">0</span>
  return <span>{value}</span>
}

function formatDash(value: string | null | undefined) {
  if (!value) return <ZeroDash />
  return <span>{value}</span>
}

function formatRelative(iso: string | null | undefined): string | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return null
  const days = Math.floor((Date.now() - then) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return '1d ago'
  if (days < 14) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

// R3/D-31.1-02 real health render (plan 04) — replaces plan 02's Rule-3
// placeholder stub (which widened this map with neutral cold/prospect
// tones just to keep tsc green after columns.ts's HealthValue grew to 6
// states). Colors are the four real buying-recency bands; 'prospect' is
// deliberately NOT a color — columns.ts's HEALTH_TONE documents it as
// 'image' (D-31.1-08: a leadership-configurable marker, off the color
// axis entirely), rendered as its own branch in HealthChip below rather
// than a color swatch.
const HEALTH_COLOR: Record<
  'good' | 'warning' | 'at_risk' | 'cold',
  { fg: string; bg: string; line: string; label: string }
> = {
  good: { fg: 'var(--green-fg)', bg: 'var(--green-bg)', line: 'var(--green-line)', label: 'Good' },
  warning: { fg: 'var(--amber-fg)', bg: 'var(--amber-bg)', line: 'var(--amber-line)', label: 'Warning' },
  at_risk: { fg: 'var(--rose-fg)', bg: 'var(--rose-bg)', line: 'var(--rose-line)', label: 'At risk' },
  cold: {
    fg: 'var(--indigo)',
    bg: 'color-mix(in srgb, var(--indigo) 12%, transparent)',
    line: 'color-mix(in srgb, var(--indigo) 32%, transparent)',
    label: 'Cold',
  },
}

// R3 Color contract: 'unknown' is a dashed, muted chip with a dash glyph —
// never a filled dot, never a duplicate of the green "good" state (a row
// whose health hasn't been computed, distinct from every computed band).
function HealthChip({ health }: { health: ClientPartnerRow['health'] }) {
  const value = resolveHealth({ health })

  if (value === 'unknown') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[color:var(--border-2)] bg-[color:var(--panel-2)] px-2.5 py-0.5 text-[11.5px] text-[color:var(--ink-3)]">
        <span aria-hidden>–</span> Unknown
      </span>
    )
  }

  if (HEALTH_RENDER_MODE[value] === 'image') {
    // D-31.1-08 prospect marker (never-licensed org) — a neutral
    // placeholder glyph until the owner uploads the real image asset from
    // the Health Rules screen (config value swap, no code change needed).
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border-2)] bg-[color:var(--panel-2)] px-2.5 py-0.5 text-[11.5px] text-[color:var(--ink-2)]">
        <span
          aria-hidden
          className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px]"
          style={{ background: 'var(--border-2)' }}
        >
          ★
        </span>
        Prospect
      </span>
    )
  }

  const tone = HEALTH_COLOR[value as 'good' | 'warning' | 'at_risk' | 'cold']
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px]"
      style={{ background: tone.bg, color: tone.fg, borderColor: tone.line }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.fg }} />
      {tone.label}
    </span>
  )
}

function NextActionCell({ row }: { row: ClientPartnerRow }) {
  if (!row.nextAction) return <ZeroDash />
  const state = row.nextActionState
  const dotColor =
    state === 'overdue' ? 'var(--rose-fg)' : state === 'today' ? 'var(--amber-fg)' : 'var(--ink-3)'
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dotColor }} />
      {row.nextAction}
      {state === 'overdue' && <span className="text-[11px]" style={{ color: 'var(--rose-fg)' }}>· overdue</span>}
      {state === 'today' && <span className="text-[11px]" style={{ color: 'var(--amber-fg)' }}>· today</span>}
    </span>
  )
}

// 31.1 leadership tower (D-31.1-04) — the All tab's Assigned-AE column.
// Renders the AE's avatar+name when assigned; otherwise, when a
// rowActionLabel is supplied, renders an inert "+ Assign AE" affordance
// (plan 06 wires the click) — never a function prop, per the component's
// documented RSC-boundary contract.
function AssignedAeCell({ row, rowActionLabel }: { row: ClientPartnerRow; rowActionLabel?: string }) {
  if (row.assignedAeId && row.assignedAeName) {
    return (
      <span className="inline-flex items-center gap-2 text-[12.5px] text-[color:var(--ink-2)]">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ background: 'var(--indigo)' }}
        >
          {initialsFor(row.assignedAeName)}
        </span>
        <span className="truncate">{row.assignedAeName}</span>
      </span>
    )
  }
  if (rowActionLabel) {
    return (
      <button
        type="button"
        onClick={e => e.stopPropagation()}
        className="whitespace-nowrap rounded-lg border border-dashed px-2.5 py-1 text-[11.5px] font-semibold"
        style={{ borderColor: 'var(--amber-line)', color: 'var(--amber-fg)' }}
      >
        {rowActionLabel}
      </button>
    )
  }
  return <ZeroDash />
}

function IdentityCell({ row, mode }: { row: ClientPartnerRow; mode: ClientPartnersListMode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center text-[11px] font-medium text-[color:var(--indigo)]"
        style={{
          background: 'var(--panel-2)',
          borderRadius: mode === 'clients' ? '50%' : '9px',
        }}
      >
        {row.initials ?? initialsFor(row.name)}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[13px] text-[color:var(--ink)]">{row.name}</div>
        {mode === 'companies' && row.website && (
          <div className="truncate text-[11.5px] text-[color:var(--ink-3)]">{row.website}</div>
        )}
        {mode === 'companies' && !row.website && row.industry && (
          <div className="truncate text-[11.5px] text-[color:var(--ink-3)]">{row.industry}</div>
        )}
      </div>
    </div>
  )
}

function renderCell(row: ClientPartnerRow, col: ColumnDef, mode: ClientPartnersListMode, rowActionLabel?: string) {
  switch (col.key) {
    case 'name':
      return <IdentityCell row={row} mode={mode} />
    case 'nextAction':
      return <NextActionCell row={row} />
    case 'status':
      return formatDash(row.status ?? null)
    case 'health':
      return <HealthChip health={row.health} />
    case 'assignedAe':
      return <AssignedAeCell row={row} rowActionLabel={rowActionLabel} />
    case 'daysInStage':
      return row.stageDays != null ? <span>{row.stageDays}d</span> : <ZeroDash />
    case 'openBriefs':
    case 'briefs':
      return formatCount(row.openBriefs)
    case 'activeSelects':
      return formatCount(row.activeSelects)
    case 'openDeal':
      return formatMoney(row.openDealValue)
    case 'lifetimeValue':
      return formatMoney(row.lifetimeValue)
    case 'lastBrief':
      return formatDash(formatRelative(row.lastBriefAt))
    case 'lastTouch':
      return formatDash(formatRelative(row.lastTouchAt))
    case 'contacts':
      return formatCount(row.contactsCount)
    case 'company':
      return formatDash(row.companyName ?? null)
    case 'role':
      return formatDash(row.role ?? null)
    case 'selectsSeen':
      return formatCount(row.selectsSeenCount)
    case 'deals':
      return formatCount(row.dealsCount)
    default:
      return <ZeroDash />
  }
}

// ─── Columns popover — show/hide + drag-reorder ─────────────────────────
// Mirrors ChecklistAdmin.tsx's drag-handle idiom exactly (6-dot grip icon +
// a dedicated activator ref so the handle — not the whole row — starts the
// drag). The identity column never appears in this list (UI-SPEC: "no
// checkbox, no drag handle").

function SortableColumnRow({
  col,
  checked,
  onToggle,
}: {
  col: ColumnDef
  checked: boolean
  onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, setActivatorNodeRef } =
    useSortable({ id: col.key })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] ${isDragging ? 'opacity-70' : ''}`}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        aria-label={`Drag to reorder ${col.label}`}
        className="flex h-5 w-5 shrink-0 cursor-grab items-center justify-center text-[color:var(--ink-3)] transition-colors hover:text-[color:var(--ink-2)] active:cursor-grabbing"
      >
        <svg width="10" height="14" viewBox="0 0 12 16" fill="currentColor">
          <circle cx="3" cy="2" r="1.5" />
          <circle cx="9" cy="2" r="1.5" />
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="9" cy="8" r="1.5" />
          <circle cx="3" cy="14" r="1.5" />
          <circle cx="9" cy="14" r="1.5" />
        </svg>
      </button>
      <label className="flex flex-1 cursor-pointer items-center gap-2 text-[color:var(--ink)]">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-3.5 w-3.5 accent-[color:var(--indigo)]"
        />
        {col.label}
      </label>
    </div>
  )
}

// ─── Empty states (UI-SPEC copy table) ──────────────────────────────────

function EmptyState({ mode }: { mode: ClientPartnersListMode }) {
  const heading = mode === 'clients' ? 'No Client Partners yet' : 'No companies yet'
  const body =
    mode === 'clients'
      ? "Once leadership assigns an account to you, it'll show up here."
      : 'Companies assigned to you will show up here.'
  return (
    <div className="flex flex-col items-center gap-1.5 py-16 text-center">
      <p className="text-[15px] font-medium text-[color:var(--ink)]">{heading}</p>
      <p className="max-w-sm text-[13px] text-[color:var(--ink-3)]">{body}</p>
    </div>
  )
}

// ─── ClientPartnersList ──────────────────────────────────────────────────

export function ClientPartnersList({
  companyRows,
  clientRows,
  companyHrefBase,
  clientHrefBase,
  initialTab = 'clients',
  rowActionLabel,
}: ClientPartnersListProps) {
  const router = useRouter()
  const [tab, setTab] = useState<ClientPartnersListMode>(initialTab)
  const [orderByTab, setOrderByTab] = useState<Record<ClientPartnersListMode, string[]>>({
    clients: nonIdentityKeys(CLIENTS_COLUMNS),
    companies: nonIdentityKeys(COMPANIES_COLUMNS),
  })
  const [hiddenByTab, setHiddenByTab] = useState<Record<ClientPartnersListMode, Set<string>>>({
    clients: new Set(),
    companies: new Set(),
  })
  const [sortByTab, setSortByTab] = useState<Record<ClientPartnersListMode, SortState>>({
    clients: DEFAULT_SORT,
    companies: DEFAULT_SORT,
  })
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Restore persisted per-AE state on mount (console cookie mechanism, R2).
  useEffect(() => {
    const persisted = readPersistedState()
    setOrderByTab({
      clients: sanitizeOrder(persisted.clients?.order, CLIENTS_COLUMNS),
      companies: sanitizeOrder(persisted.companies?.order, COMPANIES_COLUMNS),
    })
    setHiddenByTab({
      clients: sanitizeHidden(persisted.clients?.hidden, CLIENTS_COLUMNS),
      companies: sanitizeHidden(persisted.companies?.hidden, COMPANIES_COLUMNS),
    })
    setSortByTab({
      clients: sanitizeSort(persisted.clients, CLIENTS_COLUMNS),
      companies: sanitizeSort(persisted.companies, COMPANIES_COLUMNS),
    })
    setHydrated(true)
  }, [])

  // Persist on every change, post-hydration only — otherwise the mount-time
  // default state would overwrite a real cookie before the read above runs.
  useEffect(() => {
    if (!hydrated) return
    const next: PersistedState = {
      clients: {
        order: orderByTab.clients,
        hidden: Array.from(hiddenByTab.clients),
        sortKey: sortByTab.clients.key,
        sortDir: sortByTab.clients.dir,
      },
      companies: {
        order: orderByTab.companies,
        hidden: Array.from(hiddenByTab.companies),
        sortKey: sortByTab.companies.key,
        sortDir: sortByTab.companies.dir,
      },
    }
    writePersistedState(next)
  }, [hydrated, orderByTab, hiddenByTab, sortByTab])

  const allCols = TAB_COLUMNS[tab]
  const identityCol = allCols.find(c => c.isIdentity)!
  const orderedNonIdentity = orderByTab[tab]
    .map(key => allCols.find(c => c.key === key))
    .filter((c): c is ColumnDef => Boolean(c))
  const hidden = hiddenByTab[tab]
  const visibleCols = [identityCol, ...orderedNonIdentity.filter(c => !hidden.has(c.key))]
  const sort = sortByTab[tab]

  const rows = tab === 'clients' ? clientRows : companyRows
  const sorted = sortRows(rows, sort.key, sort.dir)

  function handleSort(col: ColumnDef) {
    if (!col.sortable) return
    setSortByTab(prev => {
      const cur = prev[tab]
      const dir: SortDir = cur.key === col.key ? (cur.dir === 'asc' ? 'desc' : 'asc') : 'asc'
      return { ...prev, [tab]: { key: col.key, dir } }
    })
  }

  function toggleColumn(key: string) {
    setHiddenByTab(prev => {
      const next = new Set(prev[tab])
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...prev, [tab]: next }
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrderByTab(prev => {
      const cur = prev[tab]
      const oldIndex = cur.indexOf(String(active.id))
      const newIndex = cur.indexOf(String(over.id))
      if (oldIndex === -1 || newIndex === -1) return prev
      return { ...prev, [tab]: arrayMove(cur, oldIndex, newIndex) }
    })
  }

  function handleRowClick(row: ClientPartnerRow) {
    router.push(`${tab === 'clients' ? clientHrefBase : companyHrefBase}/${row.id}`)
  }

  return (
    <div className="mt-4">
      {/* Pill tab switcher */}
      <div
        className="mb-3 inline-flex gap-[3px] rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-1"
        role="tablist"
      >
        {(['clients', 'companies'] as ClientPartnersListMode[]).map(t => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] transition ${
              tab === t
                ? 'bg-[color:var(--panel-2)] text-[color:var(--ink)]'
                : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)]'
            }`}
          >
            {t === 'clients' ? 'Clients' : 'Companies'}
            <span
              className={`rounded-full px-1.5 text-[11px] text-[color:var(--ink-3)] ${
                tab === t ? 'bg-[color:var(--ground)]' : 'bg-[color:var(--panel-2)]'
              }`}
            >
              {t === 'clients' ? clientRows.length : companyRows.length}
            </span>
          </button>
        ))}
      </div>

      {/* Columns control */}
      <div className="mb-2 flex items-center justify-end">
        <div className="relative">
          <button
            type="button"
            onClick={() => setColMenuOpen(o => !o)}
            aria-label="Columns"
            className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-1.5 text-[12.5px] text-[color:var(--ink-2)] transition hover:border-[color:var(--border-2)] hover:text-[color:var(--ink)]"
          >
            <svg className="icn h-3.5 w-3.5" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" />
              <path d="M4 12h4M16 12h4M12 4v4M12 16v4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5L15 9M9 15l-2.5 2.5" />
            </svg>
            Columns
          </button>
          {colMenuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setColMenuOpen(false)} />
              <div
                className="absolute right-0 top-10 z-30 min-w-[220px] rounded-xl border border-[color:var(--border-2)] bg-[color:var(--panel)] p-2 shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <p className="px-2 pb-2 text-[10.5px] uppercase tracking-[.12em] text-[color:var(--ink-3)]">
                  Show columns
                </p>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={orderByTab[tab]} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-0.5">
                      {orderedNonIdentity.map(col => (
                        <SortableColumnRow
                          key={col.key}
                          col={col}
                          checked={!hidden.has(col.key)}
                          onToggle={() => toggleColumn(col.key)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Table / empty state */}
      {sorted.length === 0 ? (
        <div className="rounded-[18px] border border-[color:var(--border)] bg-[color:var(--panel)]">
          <EmptyState mode={tab} />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[18px] border border-[color:var(--border)] bg-[color:var(--panel)]">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr>
                {visibleCols.map(col => {
                  const active = sort.key === col.key
                  return (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col)}
                      className={`whitespace-nowrap border-b border-[color:var(--border)] px-3.5 py-3 text-[11px] font-medium uppercase tracking-[.05em] ${
                        col.sortable ? 'cursor-pointer' : ''
                      } ${col.align === 'num' ? 'text-right' : 'text-left'} ${
                        active ? 'text-[color:var(--ink)]' : 'text-[color:var(--ink-3)]'
                      }`}
                    >
                      {col.label}
                      {col.sortable && (
                        <span className={`ml-1 text-[10px] ${active ? 'text-[color:var(--indigo)]' : 'text-[color:var(--ink-3)]'}`}>
                          {active ? (sort.dir === 'desc' ? '▼' : '▲') : '⇅'}
                        </span>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => (
                <tr
                  key={row.id}
                  onClick={() => handleRowClick(row)}
                  className="cursor-pointer border-b border-[color:var(--border)] last:border-0 hover:bg-[color:var(--panel-2)]"
                >
                  {visibleCols.map(col => (
                    <td
                      key={col.key}
                      className={`whitespace-nowrap px-3.5 py-3 align-middle ${
                        col.align === 'num' ? 'text-right tabular-nums' : ''
                      }`}
                    >
                      {renderCell(row, col, tab, rowActionLabel)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
