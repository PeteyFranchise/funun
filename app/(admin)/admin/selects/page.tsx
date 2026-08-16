export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/lib/admin/gate'
import { SELECTS_STATUS_VALUES, type Selects, type SelectsStatus } from '@/lib/selects/types'
import { NewSelectsForm } from '@/components/admin/NewSelectsForm'

// ─── Selects list (31-10, Task 2) ───────────────────────────────────────────
// Own-book-scoped (leadership sees all — the SAME scoping GET
// /api/admin/selects applies, Pitfall 4: the read path here mirrors that
// route's own-book filter rather than calling it, matching
// app/(admin)/admin/my-client-partners/page.tsx's direct-service-client SSR
// convention). Status-filterable via a lightweight funnel strip (?status=)
// — NOT the full cross-client pipeline ROOM (List/Board toggle,
// event-derived stages, next-best-action coaching, "Questions to ask") the
// 31-UI-SPEC describes; that room is Slice 2 / Phase 31.1 (scope note,
// 31-10 PLAN.md). The Board segment below is a marked, disabled slot for it.

const ORG_COLUMNS = 'id, name'
const SELECTS_COLUMNS =
  'id, buyer_org_id, created_by, brief_id, name, cover_note, share_token, status, download_enabled, download_max_seconds, created_at, updated_at, sent_at'

const STATUS_LABELS: Record<SelectsStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  approved: 'Approved',
  changes_requested: 'Changes requested',
}

function formatDate(dateString: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(dateString))
  } catch {
    return dateString
  }
}

export default async function AdminSelectsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const role = getStaffRole(user)
  if (!role) redirect('/')

  const service = createServiceClient()

  let orgQuery = service.from('buyer_orgs').select(ORG_COLUMNS).order('name', { ascending: true })
  if (role !== 'leadership') orgQuery = orgQuery.eq('ae_user_id', user.id)
  const { data: orgRows } = await orgQuery
  const orgs = ((orgRows ?? []) as { id: string; name: string }[])
  const orgNameById = new Map(orgs.map(o => [o.id, o.name]))

  let allSelects: Selects[] = []
  if (role === 'leadership' || orgs.length > 0) {
    let query = service.from('selects').select(SELECTS_COLUMNS).order('updated_at', { ascending: false })
    if (role !== 'leadership') query = query.in('buyer_org_id', orgs.map(o => o.id))
    const { data: rows } = await query
    allSelects = (rows ?? []) as Selects[]
  }

  const activeStatus: SelectsStatus | null =
    status && (SELECTS_STATUS_VALUES as readonly string[]).includes(status) ? (status as SelectsStatus) : null
  const filtered = activeStatus ? allSelects.filter(s => s.status === activeStatus) : allSelects

  const counts = SELECTS_STATUS_VALUES.reduce<Record<SelectsStatus, number>>(
    (acc, s) => {
      acc[s] = allSelects.filter(row => row.status === s).length
      return acc
    },
    { draft: 0, sent: 0, approved: 0, changes_requested: 0 }
  )

  return (
    <div className="flex-1 px-9 py-[30px]">
      <div className="mb-1 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-[color:var(--ink)]">Selects</h1>
        <span className="text-[12.5px] text-[color:var(--ink-3)]">
          {allSelects.length} in flight · {counts.sent} awaiting client
        </span>
        {/* 31.1 slot — the List/Board pipeline-hub toggle (event-derived
            stages, next-best-action coaching, "Questions to ask") is Slice
            2 / Phase 31.1. Left as a marked, disabled control rather than
            omitted so the future room has a fixed UI anchor point. */}
        <div className="ml-auto flex items-center gap-1 rounded-full border border-[color:var(--border)] p-1">
          <span className="rounded-full bg-[color:var(--panel-2)] px-3 py-1 text-[11.5px] font-semibold text-[color:var(--ink)]">
            ☰ List
          </span>
          <span
            title="Board pipeline view — coming in Phase 31.1"
            className="cursor-not-allowed rounded-full px-3 py-1 text-[11.5px] text-[color:var(--ink-3)] opacity-50"
          >
            ▦ Board
          </span>
        </div>
      </div>
      <p className="mb-4 max-w-2xl text-[12.5px] text-[color:var(--ink-3)]">
        Every Selects across your clients. The full pipeline funnel (Lead → Build → Move → Close, with
        next-best-action coaching) lands in Phase 31.1 — this is the status-filtered list slice.
      </p>

      <Suspense fallback={null}>
        <NewSelectsForm orgs={orgs} />
      </Suspense>

      {/* Funnel strip — simple status filter chips */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href="/admin/selects"
          className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
            !activeStatus
              ? 'border-[color:var(--indigo)] text-[color:var(--ink)]'
              : 'border-[color:var(--border)] text-[color:var(--ink-3)] hover:text-[color:var(--ink)]'
          }`}
        >
          All ({allSelects.length})
        </Link>
        {SELECTS_STATUS_VALUES.map(s => (
          <Link
            key={s}
            href={`/admin/selects?status=${s}`}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
              activeStatus === s
                ? 'border-[color:var(--indigo)] text-[color:var(--ink)]'
                : 'border-[color:var(--border)] text-[color:var(--ink-3)] hover:text-[color:var(--ink)]'
            }`}
          >
            {STATUS_LABELS[s]} ({counts[s]})
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 text-[14px] text-[color:var(--ink-3)]">
          {allSelects.length === 0
            ? 'No Selects yet. Pull tracks from The Crate and send a client a first Selects.'
            : 'No Selects match this status.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(row => (
            <Link
              key={row.id}
              href={`/admin/selects/${row.id}`}
              className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] p-4 transition hover:border-[color:var(--border-2)]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-[color:var(--ink)]">{row.name}</p>
                <p className="mt-0.5 text-[12px] text-[color:var(--ink-3)]">
                  {orgNameById.get(row.buyer_org_id) ?? 'Unknown client'} · updated {formatDate(row.updated_at)}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-[color:var(--border)] px-3 py-1 text-[11.5px] font-semibold text-[color:var(--ink-2)]">
                {STATUS_LABELS[row.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
