export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/lib/admin/gate'
import { coerceBrief, isBriefStatus, BRIEF_STATUS_LABELS, type Brief, type BriefStatus } from '@/lib/buyer/brief'

// ─── /admin/lead-engine — the AE Lead Engine (Brief Builder v2, §4) ────────
// Every staff role reaches this page (AE/BD/leadership); coverage scopes the
// data: an AE sees briefs for the Client Partner orgs assigned to them
// (buyer_orgs.ae_user_id = them), leadership sees all — the exact read-side
// twin of /admin/my-client-partners. Reads run through the service-role
// client (buyer_briefs has no staff RLS policy by design; the staff gate here
// is the authority). Tolerant of the table lagging behind a fresh migration
// (schema-cache reload) — a query error renders the empty state, never a 500.
//
// This slice is the read feed (the explicit "AE views all client briefs" ask).
// Status transitions + intent-ranked sort + the Selects curation console are
// the next micro-steps; today it's newest-first per the spec's v1.

type FeedBrief = {
  id: string
  orgName: string
  status: BriefStatus
  title: string
  prose: string | null
  brief: Brief
  created_at: string
}

const STATUS_CHIP: Record<BriefStatus, string> = {
  new: 'text-[color:var(--ink)] border-[color:var(--border)] bg-[color:var(--border)]/40',
  ae_reviewing: 'text-indigo-300 border-indigo-400/30 bg-indigo-400/10',
  selects_sent: 'text-indigo-300 border-indigo-400/30 bg-indigo-400/10',
  in_deal: 'text-amber-300 border-amber-400/30 bg-amber-400/10',
  licensed: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10',
  closed: 'text-[color:var(--ink-3)] border-[color:var(--border)]',
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function creativeLine(b: Brief): string {
  const parts = [
    ...b.creative.mood,
    ...b.creative.genre,
    ...b.creative.energy,
    b.creative.vocals && b.creative.vocals !== 'Either' ? b.creative.vocals : '',
  ].filter(Boolean)
  return parts.join(' · ')
}

function dealLine(b: Brief): string {
  const parts = [
    b.deal.use,
    b.deal.territory,
    b.deal.term,
    b.deal.exclusivity && b.deal.exclusivity !== 'None' ? `${b.deal.exclusivity} exclusivity` : '',
    b.deal.budget,
  ].filter(Boolean)
  return parts.join(' · ')
}

export default async function LeadEnginePage() {
  // Explicit per-page staff check — the layout redirect is not the sole
  // authority (project convention; lib/admin/gate.ts). Any staff role is
  // admitted; coverage below narrows the data.
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const role = getStaffRole(user)
  if (!role) redirect('/')

  const service = createServiceClient()

  // Covered Client Partner orgs → id + name map. AE/BD see only their
  // assigned orgs; leadership sees all (read-side twin of the scoped
  // GET /api/admin/buyer-orgs).
  let orgQuery = service.from('buyer_orgs').select('id, name')
  if (role !== 'leadership') orgQuery = orgQuery.eq('ae_user_id', user.id)
  const { data: orgs } = await orgQuery
  const orgName = new Map<string, string>((orgs ?? []).map(o => [o.id as string, (o.name as string) ?? 'Client']))
  const orgIds = Array.from(orgName.keys())

  // Briefs for those orgs, newest first. Tolerant of the table not being in
  // the PostgREST schema cache yet after a fresh migration.
  let feed: FeedBrief[] = []
  if (orgIds.length > 0) {
    const { data, error } = await service
      .from('buyer_briefs')
      .select('id, buyer_org_id, status, title, prose, brief, created_at')
      .in('buyer_org_id', orgIds)
      .order('created_at', { ascending: false })
      .limit(200)
    if (!error && data) {
      feed = data.map(r => ({
        id: r.id as string,
        orgName: orgName.get(r.buyer_org_id as string) ?? 'Client',
        status: isBriefStatus(r.status) ? r.status : 'new',
        title: (r.title as string | null) || 'Untitled brief',
        prose: (r.prose as string | null) ?? null,
        brief: coerceBrief(r.brief),
        created_at: r.created_at as string,
      }))
    }
  }

  const scopeLabel = role === 'leadership' ? 'All Client Partners' : 'Your Client Partners'

  return (
    <div className="flex-1 px-9 py-[30px]">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[color:var(--ink)]">Lead Engine</h1>
          <p className="mt-1 text-[13px] text-[color:var(--ink-3)]">
            {scopeLabel} · {feed.length} brief{feed.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {feed.length === 0 ? (
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] px-6 py-10 text-center">
          <p className="text-[15px] font-semibold text-[color:var(--ink)]">No briefs yet</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-[color:var(--ink-3)]">
            When your Client Partners send a brief from the Brief Builder, it lands here — newest first — for you to review and turn into Selects.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {feed.map(b => {
            const creative = creativeLine(b.brief)
            const deal = dealLine(b.brief)
            return (
              <li
                key={b.id}
                className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] px-5 py-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--ink-3)]">
                      {b.orgName}
                    </p>
                    <p className="mt-1 text-[16px] font-semibold text-[color:var(--ink)]">{b.title}</p>
                  </div>
                  <div className="flex flex-none items-center gap-3">
                    <span className="text-[12px] text-[color:var(--ink-3)]">{fmtDate(b.created_at)}</span>
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] font-bold ${STATUS_CHIP[b.status]}`}
                    >
                      {BRIEF_STATUS_LABELS[b.status]}
                    </span>
                  </div>
                </div>

                {creative && <p className="mt-3 text-[13.5px] text-[color:var(--ink-2)]">{creative}</p>}
                {deal && <p className="mt-1 text-[13px] text-[color:var(--ink-3)]">{deal}</p>}
                {b.brief.notes && (
                  <p className="mt-2 text-[13px] italic text-[color:var(--ink-2)]">{b.brief.notes}</p>
                )}
                {b.prose && (
                  <p className="mt-3 border-l-2 border-[color:var(--border)] pl-3 text-[13px] leading-relaxed text-[color:var(--ink-3)]">
                    &ldquo;{b.prose}&rdquo;
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
