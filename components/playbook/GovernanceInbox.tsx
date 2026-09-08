'use client'

import Link from 'next/link'
import { useDeferredValue, useMemo, useState } from 'react'
import {
  governanceIssueCounts,
  type GovernanceEntry,
  type GovernanceIssue,
  type GovernanceIssueKind,
} from '@/lib/playbook/governance'
import type { StaffRole } from '@/lib/admin/staff-role'
import { ReadingAssignmentForm } from '@/components/playbook/ReadingAssignmentForm'

export type GovernanceInboxItem = GovernanceEntry & {
  roomKey: string
  roomLabel: string
  subgroupLabel: string | null
  ownerLabel: string | null
  gamePlanLinkCount: number
  issues: GovernanceIssue[]
  readingAssigned: number
  readingComplete: number
  readingOverdue: number
  activeAssignmentCount: number
  reviewState: 'awaiting_review' | 'changes_requested' | 'ready_for_rereview' | null
  openRequestedChangeCount: number
  readingRoster: Array<{
    userId: string
    label: string
    state: 'complete' | 'overdue' | 'due' | 'optional' | 'retired'
    sourceLabels: string[]
    requiredRevision: number
    acknowledgedRevision: number | null
    acknowledgedAt: string | null
    dueAt: string | null
  }>
  readingAssignments: Array<{
    id: string
    audienceLabel: string
    dueAt: string | null
    required: boolean
    requiredRevision: number
  }>
  assignableRoles: StaffRole[]
  assignableStaff: Array<{ userId: string; label: string }>
}

type IssueFilter = 'actionable' | 'all' | 'healthy' | 'awaiting_review' | 'changes_requested' | 'ready_for_rereview' | GovernanceIssueKind

const ISSUE_FILTERS: Array<{ value: IssueFilter; label: string }> = [
  { value: 'actionable', label: 'Needs attention' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'awaiting_review', label: 'Awaiting review' },
  { value: 'changes_requested', label: 'Changes requested' },
  { value: 'ready_for_rereview', label: 'Ready for re-review' },
  { value: 'review_overdue', label: 'Review overdue' },
  { value: 'owner_missing', label: 'Owner missing' },
  { value: 'review_unscheduled', label: 'Review not scheduled' },
  { value: 'source_update_pending', label: 'Source update pending' },
  { value: 'gameplan_unlinked', label: 'No connected Gameplan' },
  { value: 'reading_overdue', label: 'Reading overdue' },
  { value: 'healthy', label: 'Healthy' },
  { value: 'retired', label: 'Retired' },
  { value: 'all', label: 'All entries' },
]

const PRIORITY_RANK: Record<GovernanceIssue['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
}

function formatDate(value: string | null): string {
  if (!value) return 'Not scheduled'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid date'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function issueClass(priority: GovernanceIssue['priority']): string {
  if (priority === 'high') {
    return 'border-[rgba(248,113,113,.34)] bg-[rgba(248,113,113,.09)] text-[#fca5a5]'
  }
  if (priority === 'medium') {
    return 'border-[rgba(251,191,36,.30)] bg-[rgba(251,191,36,.08)] text-[#fcd34d]'
  }
  return 'border-[color:var(--border)] bg-[color:var(--panel-2)] text-[color:var(--ink-3)]'
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: 'danger' | 'warning' }) {
  const valueClass = tone === 'danger'
    ? 'text-[#fca5a5]'
    : tone === 'warning'
      ? 'text-[#fcd34d]'
      : 'text-[color:var(--ink)]'

  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[color:var(--ink-3)]">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${valueClass}`}>{value}</p>
    </div>
  )
}

export function GovernanceInbox({
  items,
  rooms,
}: {
  items: GovernanceInboxItem[]
  rooms: Array<{ id: string; label: string }>
}) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const [roomId, setRoomId] = useState('all')
  const [issueFilter, setIssueFilter] = useState<IssueFilter>('actionable')
  const [assigningId, setAssigningId] = useState<string | null>(null)

  const counts = governanceIssueCounts(items)
  const pendingApproval = items.filter(item => item.issues.some(issue => issue.kind === 'pending_approval')).length
  const overdue = items.filter(item => item.issues.some(issue => issue.kind === 'review_overdue')).length
  const healthy = items.filter(item => item.issues.length === 0).length
  const changesRequested = items.filter(item => item.reviewState === 'changes_requested').length
  const readyForRereview = items.filter(item => item.reviewState === 'ready_for_rereview').length

  const filteredItems = useMemo(() => {
    return items
      .filter(item => roomId === 'all' || item.room_id === roomId)
      .filter(item => {
        if (!deferredQuery) return true
        return [item.title, item.roomLabel, item.subgroupLabel, item.ownerLabel]
          .filter(Boolean)
          .some(value => value!.toLowerCase().includes(deferredQuery))
      })
      .filter(item => {
        if (issueFilter === 'all') return true
        if (issueFilter === 'healthy') return item.issues.length === 0
        if (issueFilter === 'actionable') return item.issues.some(issue => issue.kind !== 'retired')
        if (['awaiting_review', 'changes_requested', 'ready_for_rereview'].includes(issueFilter)) return item.reviewState === issueFilter
        return item.issues.some(issue => issue.kind === issueFilter)
      })
      .sort((a, b) => {
        const aRank = Math.min(...a.issues.map(issue => PRIORITY_RANK[issue.priority]), 3)
        const bRank = Math.min(...b.issues.map(issue => PRIORITY_RANK[issue.priority]), 3)
        return aRank - bRank || Date.parse(b.updated_at) - Date.parse(a.updated_at)
      })
  }, [deferredQuery, issueFilter, items, roomId])

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <SummaryCard label="High priority" value={counts.high} tone="danger" />
        <SummaryCard label="Pending approval" value={pendingApproval} tone="warning" />
        <SummaryCard label="Overdue reviews" value={overdue} tone="warning" />
        <SummaryCard label="Changes requested" value={changesRequested} tone="warning" />
        <SummaryCard label="Ready for re-review" value={readyForRereview} />
        <SummaryCard label="Healthy entries" value={healthy} />
      </div>

      <div className="mt-5 grid gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-3 md:grid-cols-[minmax(220px,1fr)_200px_220px]">
        <label className="sr-only" htmlFor="governance-search">Search governance entries</label>
        <input
          id="governance-search"
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search title, room, subgroup, or owner…"
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--indigo)]"
        />
        <label className="sr-only" htmlFor="governance-room">Filter by room</label>
        <select
          id="governance-room"
          value={roomId}
          onChange={event => setRoomId(event.target.value)}
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)]"
        >
          <option value="all">All governed rooms</option>
          {rooms.map(room => <option key={room.id} value={room.id}>{room.label}</option>)}
        </select>
        <label className="sr-only" htmlFor="governance-issue">Filter by governance issue</label>
        <select
          id="governance-issue"
          value={issueFilter}
          onChange={event => setIssueFilter(event.target.value as IssueFilter)}
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-2)] px-3 py-2 text-[13px] text-[color:var(--ink)]"
        >
          {ISSUE_FILTERS.map(filter => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
        </select>
      </div>

      <div className="mt-3 space-y-3" aria-live="polite">
        {filteredItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[color:var(--border)] px-6 py-12 text-center">
            <p className="font-bold text-[color:var(--ink)]">Nothing in this view</p>
            <p className="mt-1 text-[13px] text-[color:var(--ink-3)]">Try another room, status, or search.</p>
          </div>
        ) : filteredItems.map(item => {
          const roomHref = `/admin/playbook/${item.roomKey}`
          const articleHref = item.status === 'published' && item.entry_type === 'document' && item.slug
            ? `${roomHref}/${item.slug}`
            : null

          return (
            <article key={item.id} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[.11em] text-[color:var(--ink-3)]">
                    <span>{item.roomLabel}</span>
                    {item.subgroupLabel && <><span aria-hidden>·</span><span>{item.subgroupLabel}</span></>}
                    <span aria-hidden>·</span>
                    <span>{item.entry_type}</span>
                  </div>
                  <h2 className="mt-1 text-[16px] font-extrabold text-[color:var(--ink)]">{item.title}</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.reviewState === 'changes_requested' && (
                      <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold text-amber-300">{item.openRequestedChangeCount} open changes requested</span>
                    )}
                    {item.reviewState === 'ready_for_rereview' && (
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-300">Ready for re-review</span>
                    )}
                    {item.issues.length === 0 ? (
                      <span className="rounded-full border border-[rgba(52,211,153,.30)] bg-[rgba(52,211,153,.08)] px-2.5 py-1 text-[10px] font-bold text-[#6ee7b7]">Healthy</span>
                    ) : item.issues.map(issue => (
                      <span key={issue.kind} className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${issueClass(issue.priority)}`}>
                        {issue.label}
                      </span>
                    ))}
                  </div>
                  <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[color:var(--ink-3)]">
                    <div><dt className="inline font-bold">Owner: </dt><dd className="inline">{item.ownerLabel ?? 'Unassigned'}</dd></div>
                    <div><dt className="inline font-bold">Review: </dt><dd className="inline">{formatDate(item.review_due_at)}</dd></div>
                    <div><dt className="inline font-bold">Gameplans: </dt><dd className="inline">{item.gamePlanLinkCount}</dd></div>
                    <div><dt className="inline font-bold">Reading: </dt><dd className="inline">{item.readingComplete}/{item.readingAssigned} complete{item.readingOverdue > 0 ? ` · ${item.readingOverdue} overdue` : ''}</dd></div>
                    <div><dt className="inline font-bold">Updated: </dt><dd className="inline">{formatDate(item.updated_at)}</dd></div>
                  </dl>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {articleHref && (
                    <Link href={articleHref} className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-[11px] font-bold text-[color:var(--ink-2)] transition hover:text-[color:var(--ink)]">
                      View article
                    </Link>
                  )}
                  <Link href={roomHref} className="rounded-lg px-3 py-2 text-[11px] font-extrabold text-white" style={{ background: 'var(--grad)' }}>
                    Open room workflow
                  </Link>
                  <button
                    type="button"
                    onClick={() => setAssigningId(current => current === item.id ? null : item.id)}
                    className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-[11px] font-bold text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
                  >
                    Assign reading
                  </button>
                </div>
              </div>
              {assigningId === item.id && (
                <ReadingAssignmentForm
                  entryId={item.id}
                  roomKey={item.roomKey}
                  roomHref={roomHref}
                  staff={item.assignableStaff}
                  roles={item.assignableRoles}
                  hasAssignments={item.activeAssignmentCount > 0}
                  assignments={item.readingAssignments}
                  roster={item.readingRoster}
                  onClose={() => setAssigningId(null)}
                />
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}
