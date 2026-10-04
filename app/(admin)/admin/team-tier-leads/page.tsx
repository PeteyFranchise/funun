export const dynamic = 'force-dynamic'

import { requireStaffPage } from '@/lib/admin/gate'
import { createServiceClient } from '@/lib/supabase/server'
import {
  SEAT_ANSWER_LABELS,
  CATALOGUE_ANSWER_LABELS,
  PAIN_POINT_LABELS,
  type SeatAnswer,
  type CatalogueAnswer,
  type PainPoint,
} from '@/lib/team-tier/qualification'

// ─── /admin/team-tier-leads — staff-only visibility (261004-ttq Task 6) ──
// Deliberately narrower than OPERATIONAL_STAFF_ROLES — this is
// sales-sensitive prospect data, not something legal/accounting/
// marketing/anr/ae need by default. Plain, read-only list — no claim/
// assign/pipeline controls; that is explicitly Phase 34 territory and is
// not built here. No ownership/liaison column exists on team_tier_leads
// by design (see migration 229's header comment).

type TeamTierLeadRow = {
  id: string
  created_at: string
  seat_answer: SeatAnswer
  catalogue_answer: CatalogueAnswer
  pain_points: PainPoint[]
  pain_points_other: string | null
  routing_outcome: 'bd' | 'self_serve'
  contact_name: string | null
  contact_email: string | null
}

const LEAD_SELECT_COLUMNS =
  'id, created_at, seat_answer, catalogue_answer, pain_points, pain_points_other, routing_outcome, contact_name, contact_email'

export default async function TeamTierLeadsPage() {
  await requireStaffPage(['leadership', 'bd'])
  const service = createServiceClient()

  const { data: leads, error } = await service
    .from('team_tier_leads')
    .select(LEAD_SELECT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw new Error(`Failed to load Team-tier leads: ${error.message}`)

  const rows = (leads ?? []) as TeamTierLeadRow[]

  return (
    <main className="flex-1 px-6 py-[30px] lg:px-9">
      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--indigo)]">
        Member CRM
      </p>
      <h1 className="mt-1 text-2xl font-bold text-[color:var(--ink)]">Team-Tier Leads</h1>
      <p className="mt-1 text-[13px] text-[color:var(--ink-3)]">
        Every /team-fit submission, newest first.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {rows.length === 0 && (
          <p className="text-[13px] text-[color:var(--ink-3)]">No submissions yet.</p>
        )}
        {rows.map(row => (
          <div
            key={row.id}
            className="rounded-[12px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] text-[color:var(--ink-3)]">
                {new Date(row.created_at).toLocaleString()}
              </p>
              <span
                className={[
                  'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                  row.routing_outcome === 'bd'
                    ? 'bg-[rgba(217,70,239,.14)] text-[color:var(--ink)]'
                    : 'bg-[rgba(129,140,248,.14)] text-[color:var(--ink)]',
                ].join(' ')}
              >
                {row.routing_outcome === 'bd' ? 'Routed to BD' : 'Self-serve'}
              </span>
            </div>

            <div className="mt-2 grid gap-1 text-[13px] text-[color:var(--ink)]">
              <p>
                <span className="text-[color:var(--ink-3)]">Seats:</span>{' '}
                {SEAT_ANSWER_LABELS[row.seat_answer]}
              </p>
              <p>
                <span className="text-[color:var(--ink-3)]">Catalogue:</span>{' '}
                {CATALOGUE_ANSWER_LABELS[row.catalogue_answer]}
              </p>
              {row.pain_points.length > 0 && (
                <p>
                  <span className="text-[color:var(--ink-3)]">Pain points:</span>{' '}
                  {row.pain_points.map(point => PAIN_POINT_LABELS[point]).join(', ')}
                </p>
              )}
              {row.pain_points_other && (
                <p>
                  <span className="text-[color:var(--ink-3)]">Other:</span>{' '}
                  {row.pain_points_other}
                </p>
              )}
            </div>

            {/* Contact block omitted entirely for self-serve rows — there is
                nothing there by design, not a missing-data bug. */}
            {row.routing_outcome === 'bd' && (
              <div className="mt-2 border-t border-[color:var(--border)] pt-2 text-[13px] text-[color:var(--ink)]">
                <p>
                  <span className="text-[color:var(--ink-3)]">Contact:</span>{' '}
                  {row.contact_name} · {row.contact_email}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}
