'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  filterWorkspaceActivityRows,
  workspaceActivityCsv,
  WORKSPACE_ACTIVITY_CATEGORY_LABELS,
  WORKSPACE_ACTIVITY_CATEGORY_VALUES,
  workspaceActivityCategory,
  workspaceActivityTargetHref,
  workspaceActivityTargetLabel,
  type WorkspaceActivityCategory,
  type WorkspaceActivityDateWindow,
  type WorkspaceActivityDetailFilter,
} from '@/lib/workspaces/activity-presentation'
import type { WorkspaceActivityRecord } from '@/lib/workspaces/room-data'

function formatActivityTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(new Date(value))
}

function activityPageHref(workspaceId: string, offset: number, pageSize: number): string {
  const params = new URLSearchParams()
  if (offset > 0) params.set('offset', String(offset))
  if (pageSize !== 50) params.set('limit', String(pageSize))
  const query = params.toString()
  return `/w/${encodeURIComponent(workspaceId)}/activity${query ? `?${query}` : ''}`
}

export function WorkspaceActivityExplorer({
  workspaceId,
  rows,
  offset,
  pageSize,
}: {
  workspaceId: string
  rows: readonly WorkspaceActivityRecord[]
  offset: number
  pageSize: number
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<WorkspaceActivityCategory>('all')
  const [person, setPerson] = useState('')
  const [dateWindow, setDateWindow] = useState<WorkspaceActivityDateWindow>('all')
  const [detail, setDetail] = useState<WorkspaceActivityDetailFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null)

  const people = useMemo(() => {
    const values = new Map<string, string>()
    for (const row of rows) {
      values.set(row.actorUserId, row.actorDisplayName)
      if (row.subjectMemberId && row.subjectDisplayName) values.set(row.subjectMemberId, row.subjectDisplayName)
    }
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const filtered = useMemo(
    () => filterWorkspaceActivityRows(rows, { query, category, person, dateWindow, detail }),
    [rows, query, category, person, dateWindow, detail]
  )
  const selected = filtered.find(row => row.id === selectedId) ?? filtered[0] ?? null
  const selectedTargetHref = selected
    ? workspaceActivityTargetHref({ workspaceId, targetType: selected.targetType, targetId: selected.targetId })
    : null
  const filtersActive = Boolean(query || person || category !== 'all' || dateWindow !== 'all' || detail !== 'all')

  function clearFilters() {
    setQuery('')
    setCategory('all')
    setPerson('')
    setDateWindow('all')
    setDetail('all')
  }

  function exportCurrentResults() {
    const blob = new Blob([workspaceActivityCsv(filtered)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `funun-workspace-activity-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mt-8">
      <section aria-label="Activity filters" className="rounded-[18px] border border-hairstrong bg-card p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1.4fr)_repeat(3,minmax(145px,.65fr))]">
          <label className="block">
            <span className="sr-only">Search this activity page</span>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search this page…"
              className="h-11 w-full rounded-[11px] border border-hairstrong bg-card2 px-4 text-sm text-white outline-none placeholder:text-lavdim focus:border-brandindigo"
            />
          </label>
          <label className="block">
            <span className="sr-only">Filter by category</span>
            <select value={category} onChange={event => setCategory(event.target.value as WorkspaceActivityCategory)} className="h-11 w-full rounded-[11px] border border-hairstrong bg-card2 px-3 text-sm text-white outline-none focus:border-brandindigo">
              {WORKSPACE_ACTIVITY_CATEGORY_VALUES.map(value => <option key={value} value={value}>{WORKSPACE_ACTIVITY_CATEGORY_LABELS[value]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Filter by person</span>
            <select value={person} onChange={event => setPerson(event.target.value)} className="h-11 w-full rounded-[11px] border border-hairstrong bg-card2 px-3 text-sm text-white outline-none focus:border-brandindigo">
              <option value="">Everyone</option>
              {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Filter by date</span>
            <select value={dateWindow} onChange={event => setDateWindow(event.target.value as WorkspaceActivityDateWindow)} className="h-11 w-full rounded-[11px] border border-hairstrong bg-card2 px-3 text-sm text-white outline-none focus:border-brandindigo">
              <option value="all">Any time</option>
              <option value="7d">Past 7 days</option>
              <option value="30d">Past 30 days</option>
              <option value="90d">Past 90 days</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Detail visibility">
            {([['all', 'All details'], ['visible', 'Summary available'], ['protected', 'Details protected']] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setDetail(value)} aria-pressed={detail === value} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${detail === value ? 'border-brandindigo bg-brandindigo/15 text-white' : 'border-hairstrong text-lavdim hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-lavdim">
            <span>{filtered.length} of {rows.length} on this page</span>
            {filtersActive ? <button type="button" onClick={clearFilters} className="font-semibold text-brandindigo hover:text-white">Clear filters</button> : null}
            <button type="button" onClick={exportCurrentResults} disabled={filtered.length === 0} className="font-semibold text-brandindigo hover:text-white disabled:cursor-not-allowed disabled:opacity-40">Export CSV</button>
          </div>
        </div>
      </section>

      <p className="mt-3 text-xs text-lavdim">Filters search this bounded page of workspace history. Use Older and Newer to move through additional records.</p>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.75fr)]">
        <section aria-label="Workspace activity" className="overflow-hidden rounded-[18px] border border-hairstrong bg-card">
          {filtered.length === 0 ? (
            <div className="p-10 text-center">
              <h3 className="font-bold text-white">No activity matches these filters</h3>
              <button type="button" onClick={clearFilters} className="mt-3 text-sm font-semibold text-brandindigo hover:text-white">Clear filters</button>
            </div>
          ) : filtered.map((row, index) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelectedId(row.id)}
              aria-pressed={selected?.id === row.id}
              className={`flex w-full gap-4 p-5 text-left transition ${index > 0 ? 'border-t border-hair' : ''} ${selected?.id === row.id ? 'bg-brandindigo/[.08]' : 'hover:bg-white/[.025]'}`}
            >
              <span className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full bg-brandindigo shadow-[0_0_12px_rgba(129,116,255,.55)]" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-bold text-white">{row.actionLabel}</span>
                  <time dateTime={row.createdAt} className="text-xs text-lavdim">{formatActivityTime(row.createdAt)}</time>
                </span>
                <span className="mt-1 block text-sm text-lav">{row.actorDisplayName}{row.subjectDisplayName ? ` · ${row.subjectDisplayName}` : ''}</span>
                <span className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[.08em] text-lavdim">
                  <span className="rounded-full border border-hair px-2.5 py-1">{WORKSPACE_ACTIVITY_CATEGORY_LABELS[workspaceActivityCategory(row.action)]}</span>
                  {row.changesRedacted ? <span className="rounded-full border border-hair px-2.5 py-1">Details protected</span> : null}
                </span>
              </span>
            </button>
          ))}
        </section>

        <aside aria-label="Selected activity details" className="rounded-[18px] border border-hairstrong bg-card p-5 xl:sticky xl:top-28">
          {selected ? (
            <>
              <div className="text-[10px] font-bold uppercase tracking-[.16em] text-brandindigo">Activity detail</div>
              <h3 className="mt-3 text-xl font-bold text-white">{selected.actionLabel}</h3>
              <dl className="mt-5 space-y-4 text-sm">
                <div><dt className="text-xs font-bold uppercase tracking-[.08em] text-lavdim">Performed by</dt><dd className="mt-1 text-white">{selected.actorDisplayName}</dd></div>
                {selected.subjectDisplayName ? <div><dt className="text-xs font-bold uppercase tracking-[.08em] text-lavdim">Affected member</dt><dd className="mt-1 text-white">{selected.subjectDisplayName}</dd></div> : null}
                <div><dt className="text-xs font-bold uppercase tracking-[.08em] text-lavdim">When</dt><dd className="mt-1 text-white">{formatActivityTime(selected.createdAt)}</dd></div>
                <div><dt className="text-xs font-bold uppercase tracking-[.08em] text-lavdim">Record type</dt><dd className="mt-1 text-white">{workspaceActivityTargetLabel(selected.targetType)}</dd></div>
                {selected.permissionReliedOn ? <div><dt className="text-xs font-bold uppercase tracking-[.08em] text-lavdim">Permission used</dt><dd className="mt-1 text-white">{selected.permissionReliedOn}</dd></div> : null}
              </dl>
              <div className={`mt-5 rounded-[12px] border p-3 text-xs leading-5 ${selected.changesRedacted ? 'border-[#826b2b] bg-[#2a2111] text-[#f0ca58]' : 'border-hair bg-white/[.025] text-lavdim'}`}>
                {selected.changesRedacted
                  ? 'Additional detail is protected for your role. The action, people, time, and record type remain visible.'
                  : 'This approved summary intentionally omits raw change fields and private account information.'}
              </div>
              {selectedTargetHref ? <Link href={selectedTargetHref} className="mt-5 inline-flex rounded-[10px] border border-hairstrong px-3 py-2 text-sm font-semibold text-brandindigo transition hover:border-brandindigo hover:text-white">Open roster relationship →</Link> : null}
            </>
          ) : <p className="text-sm text-lavdim">Select an activity entry to inspect its approved summary.</p>}
        </aside>
      </div>

      <nav aria-label="Activity pagination" className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="text-xs text-lavdim">Showing records {rows.length === 0 ? 0 : offset + 1}–{offset + rows.length}</div>
        <div className="flex items-center gap-2">
          {offset > 0 ? <Link href={activityPageHref(workspaceId, Math.max(0, offset - pageSize), pageSize)} className="rounded-[10px] border border-hairstrong px-3 py-2 text-sm font-semibold text-lav hover:text-white">← Newer</Link> : null}
          {rows.length === pageSize ? <Link href={activityPageHref(workspaceId, offset + pageSize, pageSize)} className="rounded-[10px] border border-hairstrong px-3 py-2 text-sm font-semibold text-lav hover:text-white">Older →</Link> : null}
        </div>
      </nav>
    </div>
  )
}
