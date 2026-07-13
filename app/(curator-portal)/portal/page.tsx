import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { CuratorProfileForm } from '@/components/curators/CuratorProfileForm'
import { PitchHistoryList, type PitchHistoryRow } from '@/components/curators/PitchHistoryList'
import type { Curator, PitchStatus } from '@/types'

export const dynamic = 'force-dynamic'

// ─── /portal ──────────────────────────────────────────────────────────
// Claimed-curator self-serve home (D-19, 06-05). Re-verifies session +
// curator role here too, even though (curator-portal)/layout.tsx already
// gates this — defense in depth, matching the admin pages' per-page
// re-check convention (this route group is deliberately absent from
// middleware.ts, RESEARCH.md Pitfall 3).
export default async function CuratorPortalPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/curators/claim')

  const isCurator = (user.app_metadata as { role?: string })?.role === 'curator'
  if (!isCurator) redirect('/')

  const service = createServiceClient()

  // The curator reads their OWN row + received pitches server-side via the
  // service client, explicitly scoped to claimed_by = caller. pitch_history
  // has no curator-facing RLS SELECT policy (migration 030 — artist-only
  // RLS); curator reads are service-role + explicit scoping, per plan.
  const { data: curator } = await service
    .from('curators')
    .select('*')
    .eq('claimed_by', user.id)
    .maybeSingle()

  if (!curator) redirect('/')

  const { data: pitchRows } = await service
    .from('pitch_history')
    .select('id, project_id, track_id, status, sent_at, decline_reason')
    .eq('curator_id', curator.id)
    .order('sent_at', { ascending: false })

  const rows = pitchRows ?? []
  const projectIds = [...new Set(rows.map(r => r.project_id))]
  const trackIds = [...new Set(rows.map(r => r.track_id))]

  const [{ data: projects }, { data: tracks }] = await Promise.all([
    projectIds.length > 0
      ? service.from('vault_projects').select('id, title').in('id', projectIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    trackIds.length > 0
      ? service.from('tracks').select('id, title').in('id', trackIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ])

  const projectTitleById = new Map((projects ?? []).map(p => [p.id, p.title]))
  const trackTitleById = new Map((tracks ?? []).map(t => [t.id, t.title]))

  // Reuses PitchHistoryList's row shape — the bold top line shows the
  // project that pitched them (not a "curator name", since this is the
  // curator's own read-only view of pitches they received).
  const pitches: PitchHistoryRow[] = rows.map(row => ({
    id: row.id,
    curatorName: projectTitleById.get(row.project_id) ?? 'A project',
    trackTitle: trackTitleById.get(row.track_id) ?? 'Track',
    status: row.status as PitchStatus,
    sent_at: row.sent_at,
    decline_reason: row.decline_reason,
  }))

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-[27px] font-extrabold text-white">Your curator profile</h1>
      <div className="mt-6 space-y-9">
        <CuratorProfileForm curator={curator as Curator} />
        <div>
          <h2 className="mb-4 text-[15px] font-bold text-white">Pitches you&apos;ve received</h2>
          <PitchHistoryList
            pitches={pitches}
            emptyState={{
              heading: 'No pitches yet',
              body: "When artists pitch your playlist, you'll see them here.",
            }}
          />
        </div>
      </div>
    </div>
  )
}
