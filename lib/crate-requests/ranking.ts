// ─── Crate Requests — pure intent ranker (R10) ─────────────────────────────
// The Crate Requests demand inbox (app/api/admin/crate-requests/route.ts,
// Task 2) absorbs the read-only Lead Engine into an intent-ranked, own-
// book-scoped, guest-aware feed. This module is the pure ranking core: it
// takes an already-fetched, already-normalized activity list and returns a
// deterministically ordered, de-duped list. No I/O, no @/lib/supabase
// import — mirrors lib/deals/stage-machine.ts's pure-function convention so
// the SAME ranking logic can be unit-tested in isolation and trusted by the
// route that feeds it real data.
//
// Rank order (crate-lead-engine-BUILD-SPEC.md §4): briefs > repeat searches
// > Selects re-opens > tag browsing; a deadline/budget boost; unactioned-
// first; newer-first; and — because equal-key ties are otherwise
// undefined — a STABLE final tiebreak on item id. That last rule is the
// R10 backstop: the same input set always yields the same output order,
// proven by a held-out shuffle-invariant test (ranking.test.ts).

export type CrateRequestKind = 'brief' | 'repeat_search' | 'selects_reopen' | 'tag_browse'

// One already-fetched, already-normalized activity signal. The caller
// (Task 2's route) is responsible for turning buyer_briefs rows, search
// activity, Selects re-opens, and tag-browsing events into this shape —
// including resolving isGuest / clientOrgId from whatever source table each
// signal came from.
export type CrateRequestItem = {
  id: string
  kind: CrateRequestKind
  clientOrgId: string | null
  clientName?: string | null
  isGuest: boolean
  createdAt: string // ISO timestamp
  actionedAt: string | null // ISO timestamp, or null if not yet actioned
  deadline?: string | null // ISO date — presence boosts the row
  budget?: string | null // free-text budget — presence boosts the row
}

// A ranked, de-duped output row. `weight` is the raw intent weight (higher
// = more important) — exposed so the UI (31-11) can derive its own
// Hot/Warm/New-lead chip thresholds without a second ranking implementation
// (per the plan: "the exact Hot/Warm cutoffs are Claude's discretion... and
// belong in the UI").
export type RankedCrateRequest = {
  id: string
  kind: CrateRequestKind
  clientOrgId: string | null
  clientName: string | null
  isGuest: boolean
  isNewLead: boolean
  createdAt: string
  actionedAt: string | null
  deadline: string | null
  budget: string | null
  weight: number
  count: number
}

// Repeat signals of the same kind+client collapse into one row when they
// land within this window of each other (walking chronologically — see
// groupByDedupeWindow). 24h keeps same-day repeat browsing/searching as one
// actionable row without merging genuinely separate visits days apart.
export const CRATE_REQUEST_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000

const KIND_WEIGHT: Record<CrateRequestKind, number> = {
  brief: 4,
  repeat_search: 3,
  selects_reopen: 2,
  tag_browse: 1,
}

function toMs(iso: string): number {
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : 0
}

function hasBoost(item: Pick<CrateRequestItem, 'deadline' | 'budget'>): boolean {
  return Boolean(item.deadline) || Boolean(item.budget && item.budget.trim())
}

// De-dup key: same kind + same known client. A guest/null-client item never
// merges with anything else (each gets its own key keyed off its own id) —
// keeps every guest signal visible per the "never dropped" requirement.
function dedupeKey(item: CrateRequestItem): string {
  return item.clientOrgId ? `${item.kind}::${item.clientOrgId}` : `${item.kind}::__solo__${item.id}`
}

// Deterministic ordering used ONLY to walk a same-key group chronologically
// before windowing — not the final output order (that's compareRows below).
// Sorted by createdAt then id so grouping never depends on input array
// order.
function compareChronological(a: CrateRequestItem, b: CrateRequestItem): number {
  const diff = toMs(a.createdAt) - toMs(b.createdAt)
  if (diff !== 0) return diff
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

// Walks a same-dedupeKey group in chronological order, starting a new
// window group whenever the gap to the previous item exceeds the dedupe
// window. Order-independent: the group is sorted first, so feeding the same
// set of items in any order produces the same window groups.
function groupByDedupeWindow(items: CrateRequestItem[]): CrateRequestItem[][] {
  const sorted = [...items].sort(compareChronological)
  const groups: CrateRequestItem[][] = []
  let current: CrateRequestItem[] = []
  for (const item of sorted) {
    const prev = current[current.length - 1]
    if (prev && toMs(item.createdAt) - toMs(prev.createdAt) > CRATE_REQUEST_DEDUPE_WINDOW_MS) {
      groups.push(current)
      current = []
    }
    current.push(item)
  }
  if (current.length > 0) groups.push(current)
  return groups
}

// Collapses one window group into a single ranked row. The row's identity
// (id/createdAt) comes from the most recent item in the group — that's the
// activity an AE should see first. If ANY item in the group is still
// unactioned, the whole collapsed row counts as unactioned (a repeat signal
// still needs a response even if an earlier instance of it was actioned).
function collapseGroup(group: CrateRequestItem[]): RankedCrateRequest {
  const mostRecent = group[group.length - 1]
  const anyUnactioned = group.some(i => i.actionedAt === null)
  const latestActionedAt = anyUnactioned
    ? null
    : group.reduce<string | null>((latest, i) => {
        if (!i.actionedAt) return latest
        if (!latest || toMs(i.actionedAt) > toMs(latest)) return i.actionedAt
        return latest
      }, null)
  const deadline = group.map(i => i.deadline ?? null).find(Boolean) ?? null
  const budget = group.map(i => i.budget ?? null).find(Boolean) ?? null
  const isNewLead = mostRecent.isGuest || mostRecent.clientOrgId === null

  return {
    id: mostRecent.id,
    kind: mostRecent.kind,
    clientOrgId: mostRecent.clientOrgId,
    clientName: mostRecent.clientName ?? null,
    isGuest: mostRecent.isGuest,
    isNewLead,
    createdAt: mostRecent.createdAt,
    actionedAt: latestActionedAt,
    deadline,
    budget,
    weight: KIND_WEIGHT[mostRecent.kind],
    count: group.length,
  }
}

function dedupe(items: CrateRequestItem[]): RankedCrateRequest[] {
  const byKey = new Map<string, CrateRequestItem[]>()
  for (const item of items) {
    const key = dedupeKey(item)
    const bucket = byKey.get(key)
    if (bucket) {
      bucket.push(item)
    } else {
      byKey.set(key, [item])
    }
  }

  const rows: RankedCrateRequest[] = []
  for (const bucket of byKey.values()) {
    for (const windowGroup of groupByDedupeWindow(bucket)) {
      rows.push(collapseGroup(windowGroup))
    }
  }
  return rows
}

// Final output ordering. Every tiebreak is total and derived only from the
// row's own fields — never from input array position — so the result is
// identical regardless of how `items` was ordered when passed in.
function compareRows(a: RankedCrateRequest, b: RankedCrateRequest): number {
  // 1. Intent weight, descending — brief > repeat_search > selects_reopen >
  //    tag_browse.
  if (a.weight !== b.weight) return b.weight - a.weight

  // 2. Deadline/budget boost — a row with either present ranks ahead of an
  //    otherwise-equal row without one.
  const boostA = hasBoost(a) ? 1 : 0
  const boostB = hasBoost(b) ? 1 : 0
  if (boostA !== boostB) return boostB - boostA

  // 3. Unactioned-first.
  const actionedA = a.actionedAt === null ? 0 : 1
  const actionedB = b.actionedAt === null ? 0 : 1
  if (actionedA !== actionedB) return actionedA - actionedB

  // 4. Newer-first.
  const createdDiff = toMs(b.createdAt) - toMs(a.createdAt)
  if (createdDiff !== 0) return createdDiff

  // 5. STABLE final tiebreak — item id, ascending. This is the ONLY thing
  // that decides order once every ranking key above is equal, which is the
  // R10 backstop: the same input set always yields the same output order,
  // run-to-run, regardless of the order items were fetched/passed in.
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

/**
 * Pure intent ranker for the Crate Requests demand inbox (R10). Takes an
 * already-fetched, already-normalized activity list and returns a
 * deterministically ordered, de-duped list — same input, same output,
 * always. No I/O.
 */
export function rankCrateRequests(items: CrateRequestItem[]): RankedCrateRequest[] {
  const rows = dedupe(items)
  return rows.sort(compareRows)
}
