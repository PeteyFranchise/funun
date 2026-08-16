'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { CrateRequestKind, RankedCrateRequest } from '@/lib/crate-requests/ranking'
import type { RowAction } from '@/app/api/admin/crate-requests/route'

// ─── CrateRequestsFeed (R10) ────────────────────────────────────────────────
// The AE's demand-inbox — renders the own-book, intent-ranked feed the
// 31-07 route already computes (GET /api/admin/crate-requests: coverage
// scoping + rankCrateRequests ordering). This component owns ONLY
// presentation — client-side fetch, Hot/Warm/New-lead chip labeling over
// the ranker's raw `weight` (Claude's-discretion thresholds, UI-SPEC "Crate
// Requests — demand inbox"), and exactly one dominant action button per
// row. It never re-derives ordering, scoping, or the row's action — those
// are the route's authority (lib/crate-requests/ranking.ts).
//
// Reserved-accent discipline (UI-SPEC Color): the brand gradient CTA is
// reserved for the single most important action per screen, so only the
// TOP row (already the ranker's #1 priority item) gets the gradient
// treatment when it's still unactioned; every other row's action renders
// as a plain outlined button — mirrors the mockup (phase-31 mockup, Crate
// Requests screen: one `.btn.grad` row, the rest `.btn`).

export type CrateRequestFeedRow = RankedCrateRequest & {
  clientTag: string
  action: RowAction
}

type FetchState = 'loading' | 'ready' | 'error'
type Intent = 'hot' | 'warm' | 'new_lead'

// Hot vs Warm cutoff is UI-owned discretion over the ranker's raw intent
// weight (brief=4, repeat_search=3, selects_reopen=2, tag_browse=1): a
// brief or a repeat-search reads as Hot, a Selects re-open or tag-browse
// reads as Warm — a deadline/budget on the row bumps it to Hot regardless
// of kind. New-lead always overrides both (a guest signal, never scored).
function intentFor(row: CrateRequestFeedRow): Intent {
  if (row.isNewLead) return 'new_lead'
  const boosted = Boolean(row.deadline) || Boolean(row.budget && row.budget.trim())
  if (row.weight >= 3 || boosted) return 'hot'
  return 'warm'
}

function initialsFor(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2)
  const initials = parts.map(w => w[0]?.toUpperCase() ?? '').join('')
  return initials || '—'
}

function formatTimeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const diffMs = Date.now() - then
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 14) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function describeRow(row: CrateRequestFeedRow): string {
  if (row.isNewLead) {
    return row.kind === 'brief' ? 'Sent a brief — no account yet' : 'Reacted to a shared Selects — no account yet'
  }
  if (row.kind === 'brief') {
    const bits: string[] = ['Sent a brief']
    if (row.deadline) bits.push(`due ${formatShortDate(row.deadline)}`)
    if (row.budget && row.budget.trim()) bits.push(`${row.budget} budget`)
    return bits.join(' · ')
  }
  if (row.kind === 'selects_reopen') {
    return row.actionedAt ? 'Approved a Selects' : 'Requested changes on a Selects'
  }
  if (row.kind === 'repeat_search') return 'Ran the same search repeatedly'
  return 'Browsed The Crate'
}

function actionLabel(action: RowAction): string {
  if (action.type === 'build_selects') return 'Build Selects'
  if (action.type === 'follow_up') return 'Follow up'
  return 'See lead'
}

function actionHref(action: RowAction): string | null {
  if (action.type === 'build_selects') {
    return `/admin/selects?orgId=${encodeURIComponent(action.buyerOrgId)}&briefId=${encodeURIComponent(action.briefId)}`
  }
  if (action.type === 'follow_up' && action.buyerOrgId) {
    return `/admin/client-partners/${encodeURIComponent(action.buyerOrgId)}`
  }
  return null
}

// ─── Icons (hand-authored inline SVG, `.icn` — no icon package) ───────────

function BriefIcon() {
  return (
    <svg className="icn h-4 w-4" viewBox="0 0 24 24">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4.5" />
    </svg>
  )
}

function SelectsIcon() {
  return (
    <svg className="icn h-4 w-4" viewBox="0 0 24 24">
      <path d="M9 18V6l11-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </svg>
  )
}

function GuestGlyph() {
  return (
    <svg className="icn h-3 w-3" viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
    </svg>
  )
}

function ActivityIcon({ row }: { row: CrateRequestFeedRow }) {
  const icon: Record<CrateRequestKind, React.ReactNode> = {
    brief: <BriefIcon />,
    repeat_search: <BriefIcon />,
    selects_reopen: <SelectsIcon />,
    tag_browse: <SelectsIcon />,
  }
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
      style={{ background: 'var(--panel-2)', color: row.isNewLead ? 'var(--ink-3)' : 'var(--indigo)' }}
    >
      {row.isNewLead ? <GuestGlyph /> : icon[row.kind]}
    </span>
  )
}

function ClientAvatar({ row }: { row: CrateRequestFeedRow }) {
  if (row.isNewLead) {
    return (
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--border-2)] text-[color:var(--ink-3)]"
        style={{ background: 'var(--panel-2)' }}
        aria-hidden
      >
        <GuestGlyph />
      </span>
    )
  }
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-[color:var(--indigo)]"
      style={{ background: 'var(--panel-2)' }}
      aria-hidden
    >
      {initialsFor(row.clientTag)}
    </span>
  )
}

function IntentChip({ intent }: { intent: Intent }) {
  if (intent === 'new_lead') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[color:var(--border-2)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--ink-2)]">
        <GuestGlyph />
        New lead
      </span>
    )
  }
  if (intent === 'hot') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[color:var(--fuchsia)]/30 bg-[color:var(--fuchsia)]/10 px-2.5 py-1 text-[11px] font-medium text-[color:var(--fuchsia)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--fuchsia)]" />
        Hot
      </span>
    )
  }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium"
      style={{ background: 'var(--amber-bg)', color: 'var(--amber-fg)', borderColor: 'var(--amber-line)' }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--amber-fg)' }} />
      Warm
    </span>
  )
}

function ActionButton({
  row,
  isPrimary,
  onSeeLead,
}: {
  row: CrateRequestFeedRow
  isPrimary: boolean
  onSeeLead: () => void
}) {
  const label = actionLabel(row.action)
  const primaryClass =
    'fncon-cta shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-[12.5px] font-medium shadow-sm transition hover:opacity-90'
  const secondaryClass =
    'shrink-0 whitespace-nowrap rounded-lg border border-[color:var(--border-2)] px-3.5 py-2 text-[12.5px] font-medium text-[color:var(--ink-2)] transition hover:border-[color:var(--indigo)] hover:text-[color:var(--ink)]'
  const className = isPrimary ? primaryClass : secondaryClass

  if (row.action.type === 'see_lead') {
    return (
      <button type="button" onClick={onSeeLead} className={className}>
        {label}
      </button>
    )
  }
  const href = actionHref(row.action)
  if (!href) {
    return (
      <span className={`${secondaryClass} cursor-not-allowed opacity-50`} aria-disabled>
        {label}
      </span>
    )
  }
  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  )
}

// Consent-first "See lead" panel (T-31-26): what the guest signal was and
// when — never a guessed identity, never fingerprinting or bought data.
function SeeLeadPanel({ row }: { row: CrateRequestFeedRow }) {
  return (
    <div
      className="border-t border-[color:var(--border)] px-4 py-3.5 text-[12.5px] leading-relaxed text-[color:var(--ink-2)]"
      style={{ background: 'var(--panel-2)' }}
    >
      <p>
        A visitor with no Client Partner account {row.kind === 'brief' ? 'sent a brief' : 'reacted to a Selects you sent'}{' '}
        {formatTimeAgo(row.createdAt)}
        {row.count > 1 ? ` (${row.count}× recently)` : ''}. We don&rsquo;t know who they are — Funūn never fingerprints
        or buys data to identify anonymous visitors.
      </p>
      <p className="mt-2 text-[color:var(--ink-3)]">
        If this feels time-sensitive, check who you last shared this link with — they may have forwarded it.
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <div
      className="rounded-card border border-[color:var(--border)] px-6 py-10 text-center"
      style={{ background: 'var(--panel)' }}
    >
      <p className="text-[15px] font-medium text-[color:var(--ink)]">No new demand yet</p>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] text-[color:var(--ink-3)]">
        Briefs, repeat searches, and Selects re-opens from your clients will land here as they happen.
      </p>
    </div>
  )
}

export function CrateRequestsFeed() {
  const [state, setState] = useState<FetchState>('loading')
  const [rows, setRows] = useState<CrateRequestFeedRow[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/crate-requests')
      .then(res => res.json())
      .then((json: { data?: CrateRequestFeedRow[] }) => {
        if (cancelled) return
        setRows(json.data ?? [])
        setState('ready')
      })
      .catch(() => {
        if (!cancelled) setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state === 'loading') {
    return <p className="text-[13px] text-[color:var(--ink-3)]">Loading…</p>
  }
  if (state === 'error') {
    return (
      <p className="text-[13px] text-[color:var(--ink-3)]">
        Couldn&rsquo;t load Crate Requests right now — refresh to try again.
      </p>
    )
  }
  if (rows.length === 0) {
    return <EmptyState />
  }

  const needAction = rows.filter(r => r.actionedAt === null).length

  return (
    <div>
      <p className="mb-3 text-[12.5px] text-[color:var(--ink-3)]">
        {rows.length} signal{rows.length === 1 ? '' : 's'} · {needAction} need action
      </p>
      <div className="rounded-card border border-[color:var(--border)] p-1.5" style={{ background: 'var(--panel)' }}>
        {rows.map((row, index) => (
          <div key={row.id} className={index > 0 ? 'border-t border-[color:var(--border)]' : ''}>
            <div className="flex items-start gap-3.5 px-3.5 py-3.5 sm:items-center">
              <ActivityIcon row={row} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] text-[color:var(--ink)]">{describeRow(row)}</p>
                <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-[color:var(--ink-3)]">
                  <ClientAvatar row={row} />
                  <span className="truncate">{row.clientTag}</span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0 whitespace-nowrap">{formatTimeAgo(row.createdAt)}</span>
                </p>
              </div>
              <div className="flex flex-none flex-col items-end gap-2 sm:flex-row sm:items-center">
                <IntentChip intent={intentFor(row)} />
                <ActionButton
                  row={row}
                  isPrimary={index === 0 && row.actionedAt === null}
                  onSeeLead={() => setExpandedId(cur => (cur === row.id ? null : row.id))}
                />
              </div>
            </div>
            {expandedId === row.id && <SeeLeadPanel row={row} />}
          </div>
        ))}
      </div>
    </div>
  )
}
