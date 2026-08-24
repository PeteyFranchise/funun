// ─── Client Partners — column model (R1/R2) ────────────────────────────────
// The shared column contract for components/admin/ClientPartnersList.tsx
// (My Client Partners today; the 31.1 leadership tower reuses it
// unfiltered). Pure data/sort layer — no rendering, no I/O — so the same
// contract can be unit-tested in isolation (columns.test.ts) and trusted by
// whatever screen renders it, mirroring lib/crate-requests/ranking.ts's
// pure-module convention.
//
// Column identity: the FIRST entry in both COMPANIES_COLUMNS and
// CLIENTS_COLUMNS is isIdentity=true (Company / Client respectively) — the
// UI-SPEC's "pinned identity" rule: no hide checkbox, no drag handle, always
// rendered first, so the table can never reach zero columns.

export type SortDir = 'asc' | 'desc'

export type ColumnDef = {
  /** Row-data key this column reads from and sorts by. */
  key: string
  label: string
  sortable: boolean
  /** Pinned identity columns are unhideable, un-reorderable, always first. */
  isIdentity: boolean
  align?: 'num'
}

export type SortState = {
  key: string
  dir: SortDir
}

// A relationship-health value. 'unknown' is the R3 no-data guardrail — a
// signal with no computed value must never render as (or sort like) green.
// 'cold' and 'prospect' are the two 31.1 additions to the 5-state health
// vocabulary computed by lib/client-partners/health.ts's computeHealth()
// (D-06/D-31.1-02): 'prospect' is a client with no executed license at all
// — off the recency axis, rendered as the configurable image marker, never
// a color (D-31.1-08) — and 'cold' is licensed once but long gone quiet
// (distinct from 'at_risk'). 'unknown' stays the dashed no-data slot for a
// row where health hasn't been computed yet.
export type HealthValue = 'good' | 'warning' | 'at_risk' | 'cold' | 'prospect' | 'unknown'

// Render-tone hint per health value — 'prospect' documents that its slot
// renders the leadership-configurable image marker (D-31.1-08), not a CSS
// color/tone, and 'unknown' documents the dashed no-data slot. Consumed by
// ClientPartnersList's HealthChip (plan 04), not used for sorting.
export const HEALTH_TONE: Record<HealthValue, 'color' | 'image' | 'dashed'> = {
  good: 'color',
  warning: 'color',
  at_risk: 'color',
  cold: 'color',
  prospect: 'image',
  unknown: 'dashed',
}

// List-source-agnostic row shape. Both the Companies and Clients tabs (and
// the 31.1 leadership tower, unfiltered) feed rows through this same type —
// a Companies row only populates the company-shaped fields, a Clients row
// only the client-shaped fields; everything is optional so a caller with no
// data source yet for a given signal (Slice 1: health/days-in-stage/open
// deal/lifetime value/client-level briefs-seen-deals — none of those have a
// live source until 31.1's health engine + deals room) can omit it and the
// column renders its defined "no data" state rather than a fabricated
// value.
export type ClientPartnerRow = {
  id: string
  name: string
  initials?: string | null

  // Companies-only
  industry?: string | null
  website?: string | null

  // Clients-only
  companyName?: string | null
  role?: string | null

  // Shared
  status?: string | null
  health?: HealthValue
  stageDays?: number | null
  openBriefs?: number | null
  activeSelects?: number | null
  openDealValue?: number | null
  lifetimeValue?: number | null
  lastBriefAt?: string | null
  lastTouchAt?: string | null
  contactsCount?: number | null
  selectsSeenCount?: number | null
  dealsCount?: number | null

  // 31.1 leadership tower — the All tab's Assigned-AE column. assignedAeId
  // is the coverage-aggregation key (lib/client-partners/coverage.ts); a
  // row with no assignedAeId is unassigned regardless of assignedAeName.
  assignedAeId?: string | null
  assignedAeName?: string | null

  // Next action (R1 default sort key)
  nextAction?: string | null
  nextActionState?: 'overdue' | 'today' | 'soon' | null
}

// ─── Column defs ────────────────────────────────────────────────────────
// Companies (13): Company · Next action · Assigned AE · Status · Health ·
// Days in stage · Open briefs · Active Selects · Open deal · Lifetime value
// · Last brief · Last touch · Contacts.
export const COMPANIES_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Company', sortable: true, isIdentity: true },
  { key: 'nextAction', label: 'Next action', sortable: true, isIdentity: false },
  // 31.1 leadership tower (D-31.1-04) — the All tab's flat book table shows
  // who owns each account. Populated on All-tab rows only; My-tab rows
  // (a single AE's own book) can leave this unset.
  { key: 'assignedAe', label: 'Assigned AE', sortable: true, isIdentity: false },
  { key: 'status', label: 'Status', sortable: true, isIdentity: false },
  // R3 placeholder render slot in Slice 1 — computed health is 31.1. Never
  // renders 'good'/green with no signal; see HealthValue + HealthChip.
  { key: 'health', label: 'Health', sortable: true, isIdentity: false },
  // A1: "Days in stage" reads the seeded-default pipeline stage constants
  // today. The leadership-editable stage-config surface is D-10, deferred
  // to Phase 31.1 — this column does not change behavior when that lands,
  // it just gains a configurable source.
  { key: 'daysInStage', label: 'Days in stage', sortable: true, isIdentity: false, align: 'num' },
  { key: 'openBriefs', label: 'Open briefs', sortable: true, isIdentity: false, align: 'num' },
  { key: 'activeSelects', label: 'Active Selects', sortable: true, isIdentity: false, align: 'num' },
  { key: 'openDeal', label: 'Open deal', sortable: true, isIdentity: false, align: 'num' },
  { key: 'lifetimeValue', label: 'Lifetime value', sortable: true, isIdentity: false, align: 'num' },
  { key: 'lastBrief', label: 'Last brief', sortable: true, isIdentity: false },
  { key: 'lastTouch', label: 'Last touch', sortable: true, isIdentity: false },
  { key: 'contacts', label: 'Contacts', sortable: true, isIdentity: false, align: 'num' },
]

// Clients (10): Client · Next action · Company · Role · Status · Last touch
// · Last brief · Briefs · Selects seen · Deals.
export const CLIENTS_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Client', sortable: true, isIdentity: true },
  { key: 'nextAction', label: 'Next action', sortable: true, isIdentity: false },
  { key: 'company', label: 'Company', sortable: true, isIdentity: false },
  { key: 'role', label: 'Role', sortable: true, isIdentity: false },
  { key: 'status', label: 'Status', sortable: true, isIdentity: false },
  { key: 'lastTouch', label: 'Last touch', sortable: true, isIdentity: false },
  { key: 'lastBrief', label: 'Last brief', sortable: true, isIdentity: false },
  { key: 'briefs', label: 'Briefs', sortable: true, isIdentity: false, align: 'num' },
  { key: 'selectsSeen', label: 'Selects seen', sortable: true, isIdentity: false, align: 'num' },
  { key: 'deals', label: 'Deals', sortable: true, isIdentity: false, align: 'num' },
]

// ─── Sort ────────────────────────────────────────────────────────────────
// R1: the list opens sorted by Next action, overdue-first — deterministic.
export const DEFAULT_SORT: SortState = { key: 'nextAction', dir: 'asc' }

const NEXT_ACTION_RANK: Record<string, number> = { overdue: 0, today: 1, soon: 2 }
// Deterministic sort order across all 6 health values (RESEARCH §
// "Health Compute-on-Read Approach"): at_risk < cold < warning < prospect <
// unknown < good. 'prospect' sorts between the actionable states and the
// no-data slot — a never-licensed lead isn't as urgent as a
// slipping/at-risk existing client, but isn't "no data" either.
export const HEALTH_RANK: Record<HealthValue, number> = {
  at_risk: 0,
  cold: 1,
  warning: 2,
  prospect: 3,
  unknown: 4,
  good: 5,
}

/** Resolves a row's health, defaulting to 'unknown' — never inferred as 'good'. */
export function resolveHealth(row: Pick<ClientPartnerRow, 'health'>): HealthValue {
  return row.health ?? 'unknown'
}

function toMs(iso: string | null | undefined): number {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : 0
}

function sortValueFor(row: ClientPartnerRow, key: string): number | string {
  switch (key) {
    case 'name':
      return (row.name ?? '').toLowerCase()
    case 'company':
      return (row.companyName ?? '').toLowerCase()
    case 'role':
      return (row.role ?? '').toLowerCase()
    case 'status':
      return (row.status ?? '').toLowerCase()
    case 'health':
      return HEALTH_RANK[resolveHealth(row)]
    case 'assignedAe':
      return (row.assignedAeName ?? '').toLowerCase()
    case 'nextAction':
      return row.nextActionState ? (NEXT_ACTION_RANK[row.nextActionState] ?? 9) : 9
    case 'daysInStage':
      return row.stageDays ?? -1
    case 'openBriefs':
    case 'briefs':
      return row.openBriefs ?? 0
    case 'activeSelects':
      return row.activeSelects ?? 0
    case 'openDeal':
      return row.openDealValue ?? 0
    case 'lifetimeValue':
      return row.lifetimeValue ?? 0
    case 'lastBrief':
      return toMs(row.lastBriefAt)
    case 'lastTouch':
      return toMs(row.lastTouchAt)
    case 'contacts':
      return row.contactsCount ?? 0
    case 'selectsSeen':
      return row.selectsSeenCount ?? 0
    case 'deals':
      return row.dealsCount ?? 0
    default:
      return 0
  }
}

/**
 * Pure sort — one active key + direction (multi-column sort is out of
 * scope, per SPEC). Always falls back to a stable identity tiebreak (name,
 * then id) so equal-key rows never reorder run-to-run, regardless of the
 * input array's order — the R2 backstop, proven by columns.test.ts's
 * shuffle-invariant case.
 */
export function sortRows(rows: ClientPartnerRow[], sortKey: string, dir: SortDir): ClientPartnerRow[] {
  const mult = dir === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const av = sortValueFor(a, sortKey)
    const bv = sortValueFor(b, sortKey)
    if (av < bv) return -1 * mult
    if (av > bv) return 1 * mult

    // Stable identity tiebreak — independent of input array order.
    const an = (a.name ?? '').toLowerCase()
    const bn = (b.name ?? '').toLowerCase()
    if (an < bn) return -1
    if (an > bn) return 1
    if (a.id < b.id) return -1
    if (a.id > b.id) return 1
    return 0
  })
}
