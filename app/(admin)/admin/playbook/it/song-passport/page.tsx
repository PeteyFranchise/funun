import { requireRoomAccessPage } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
import { IT_SUBPAGES } from '@/lib/playbook/nav'
import { ItRoomTopBar } from '@/components/playbook/ItRoomTopBar'

export const dynamic = 'force-dynamic'

const CRUMB = IT_SUBPAGES.find(page => page.slug === 'song-passport')!.label

export default async function SongPassportPilotPage() {
  await requireRoomAccessPage('it-team')
  const service = createServiceClient()
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const [eventsRes, incidentsRes, cohortRes] = await Promise.all([
    service.from('song_passport_operation_events').select('operation, outcome, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(5000),
    service.from('song_passport_pilot_incidents').select('id, severity, category, summary, status, detected_at').in('status', ['open', 'mitigating']).order('detected_at', { ascending: false }).limit(50),
    service.from('song_passport_cohorts').select('id, account_user_id, work_id, stage, enabled, starts_at, ends_at').eq('enabled', true).order('created_at', { ascending: false }).limit(100),
  ])
  const events = eventsRes.data ?? []
  const incidents = incidentsRes.data ?? []
  const cohorts = cohortRes.data ?? []
  const operations = Object.entries(events.reduce<Record<string, number>>((counts, event) => {
    counts[event.operation] = (counts[event.operation] ?? 0) + 1
    return counts
  }, {})).sort((left, right) => right[1] - left[1])
  const critical = incidents.filter(incident => incident.severity === 'critical' || incident.severity === 'high')

  return (
    <div>
      <ItRoomTopBar crumb={CRUMB} showLiveChip />
      <div className="mx-auto max-w-[960px] px-[28px] pb-[60px] pt-[22px]">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-extrabold tracking-[-.02em] text-[color:var(--ink)]">Song Passport pilot</h1>
            <p className="mt-1 max-w-[720px] text-[12px] leading-relaxed text-[color:var(--ink-3)]">Thirty-day, value-free operating evidence. This page shows actions and incidents, never lyrics, names, identifiers, shares, contracts or recipient details.</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${critical.length === 0 ? 'border-emerald-400/30 text-emerald-300' : 'border-red-400/30 text-red-300'}`}>{critical.length === 0 ? 'No stop-ship incidents' : `${critical.length} stop-ship incident${critical.length === 1 ? '' : 's'}`}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Pilot cohorts" value={cohorts.length} note="Active account or work gates" />
          <Metric label="Material actions" value={events.length} note="Last 30 days" />
          <Metric label="Open incidents" value={incidents.length} note="Open or mitigating" />
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <section className="rounded-[16px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
            <h2 className="text-[14px] font-bold text-[color:var(--ink)]">Operation evidence</h2>
            {operations.length === 0 ? <p className="mt-4 text-[12px] text-[color:var(--ink-3)]">No pilot operations recorded yet.</p> : (
              <div className="mt-3 space-y-2">
                {operations.map(([operation, count]) => <div key={operation} className="flex items-center justify-between rounded-[10px] border border-[color:var(--border)] px-3 py-2"><span className="text-[12px] text-[color:var(--ink-2)]">{operation.replaceAll('_', ' ')}</span><b className="text-[12px] text-[color:var(--indigo)]">{count}</b></div>)}
              </div>
            )}
          </section>

          <section className="rounded-[16px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
            <h2 className="text-[14px] font-bold text-[color:var(--ink)]">Open incidents</h2>
            {incidents.length === 0 ? <p className="mt-4 text-[12px] text-emerald-300">None. Cohort expansion still requires the acceptance checklist.</p> : (
              <div className="mt-3 space-y-2">
                {incidents.map(incident => <article key={incident.id} className="rounded-[10px] border border-[color:var(--border)] px-3 py-2"><div className="flex justify-between gap-3"><b className="text-[11px] uppercase text-amber-200">{incident.severity} · {incident.category}</b><span className="text-[10px] text-[color:var(--ink-3)]">{incident.status}</span></div><p className="mt-1 text-[12px] text-[color:var(--ink-2)]">{incident.summary}</p></article>)}
              </div>
            )}
          </section>
        </div>

        <section className="mt-5 rounded-[16px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
          <h2 className="text-[14px] font-bold text-[color:var(--ink)]">Pilot gates</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {['Solo, multi-writer and legacy/released works exercised', 'Three recording versions and one successor master', 'One conflict and one post-approval change recovered safely', 'One graduation with no approved-fact re-entry', 'JSON, sidecar and eligible MP3 artifacts resolve to snapshots', 'Zero authorization, privacy, source-mutation or silent-overwrite incidents'].map(item => <p key={item} className="rounded-[10px] border border-[color:var(--border)] px-3 py-2 text-[11px] text-[color:var(--ink-2)]">□ {item}</p>)}
          </div>
        </section>
      </div>
    </div>
  )
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return <div className="rounded-[14px] border border-[color:var(--border)] bg-[color:var(--panel)] p-4"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[color:var(--ink-3)]">{label}</p><p className="mt-2 text-[26px] font-extrabold text-[color:var(--ink)]">{value}</p><p className="mt-1 text-[11px] text-[color:var(--ink-3)]">{note}</p></div>
}
