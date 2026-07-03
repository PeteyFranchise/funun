import { notFound, redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { LaunchpadRoom } from '@/components/launchpad/LaunchpadRoom'
import { CampaignCalendar } from '@/components/launchpad/CampaignCalendar'
import { CampaignHistoryList } from '@/components/launchpad/CampaignHistoryList'
import { PitchComposer } from '@/components/curators/PitchComposer'
import { PitchHistoryList, type PitchHistoryRow } from '@/components/curators/PitchHistoryList'
import { computeResponseRates } from '@/lib/curators/response-rate'
import type { DirectoryCurator } from '@/lib/curators/response-rate'
import type { Curator, MergedChecklistItem, PitchStatus } from '@/types'
import { readPosts } from '@/lib/launchpad/campaigns'
import type { SocialCampaign } from '@/lib/launchpad/campaigns'

export const dynamic = 'force-dynamic'

// Same directory-safe column projection as app/api/curators/route.ts — never
// select('*'), never email/claim_token/raw claimed_by (T-06-08).
const DIRECTORY_COLUMNS =
  'id, name, playlist_name, playlist_url, platform, genre_focus, reach_signal, reach_fetched_at, drift_flagged, do_not_pitch, email_valid, claimed_by'

type DirectoryRow = Pick<
  Curator,
  | 'id'
  | 'name'
  | 'playlist_name'
  | 'playlist_url'
  | 'platform'
  | 'genre_focus'
  | 'reach_signal'
  | 'reach_fetched_at'
  | 'drift_flagged'
  | 'do_not_pitch'
  | 'email_valid'
  | 'claimed_by'
>

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function LaunchpadProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  // Fetch project — owner-scoped; includes release_date for before-release
  // collapse logic and every track in the project (D-09 — no lead-track
  // restriction on the pitch composer's track selector). genre added for
  // CampaignCalendar's platform nudge badges (SOCIAL-01, D-09).
  const { data: project } = await supabase
    .from('vault_projects')
    .select('id, title, release_date, genre, cover_art_url, tracks (id, title)')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single()

  if (!project) notFound()

  const tracks = ((project.tracks ?? []) as { id: string; title: string }[]).map(t => ({
    id: t.id,
    title: t.title,
  }))

  // Parallel fetch: checklist item definitions + this user's progress for this project.
  // Items are read via the service client because launchpad_checklist_items RLS is now
  // USING(false) (migration 029, CR-03) — direct user-scoped reads return nothing. This
  // read is safe here: project ownership is already verified above, and tip gating +
  // admin-column stripping happen in the merge below. Progress stays on the user-scoped
  // client (RLS: auth.uid() = user_id).
  const service = createServiceClient()
  const [
    { data: items },
    { data: progress },
    { data: curatorRows },
    { data: pitchRows },
    { data: profileRow },
    { data: activeCampaignRow },
    { data: campaignRows },
  ] = await Promise.all([
    service
      .from('launchpad_checklist_items')
      .select('*')
      .order('sort_order'),
    supabase
      .from('launchpad_progress')
      .select('item_key, completed, completed_at')
      .eq('project_id', projectId)
      .eq('user_id', user.id),
    // curators RLS SELECT policy is USING(true) — the artist-scoped client
    // can read the directory directly, same as app/api/curators/route.ts.
    supabase.from('curators').select(DIRECTORY_COLUMNS),
    // Artists read own pitch history only (RLS: auth.uid() = artist_id).
    supabase
      .from('pitch_history')
      .select('id, curator_id, track_id, status, sent_at, decline_reason')
      .eq('project_id', projectId)
      .eq('artist_id', user.id)
      .order('sent_at', { ascending: false }),
    // Artist profile genres for platform nudge badges (D-09 — user-scoped RLS read).
    supabase
      .from('artist_profiles')
      .select('genres')
      .eq('id', user.id)
      .maybeSingle(),
    // Active campaign — user-scoped RLS (T-07-19: never createServiceClient).
    supabase
      .from('social_campaigns')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle(),
    // All campaigns for the history list.
    supabase
      .from('social_campaigns')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  // Build progress lookup map for O(1) merge
  const progressMap = new Map(
    (progress ?? []).map(p => [p.item_key, p])
  )

  // Merge: gate tip_body to approved-only; strip admin-only columns before passing to client
  const merged: MergedChecklistItem[] = (items ?? []).map(item => {
    // Destructure to exclude admin-only fields (T-05-05: never surface to client component tree)
    const { tip_draft, tip_drafted_at, author, ...rest } = item as typeof item & {
      tip_draft: string | null
      tip_drafted_at: string | null
      author: string | null
    }
    void tip_draft
    void tip_drafted_at
    void author

    const prog = progressMap.get(item.key)
    return {
      ...rest,
      // Gate tip_body to approved tips only — unapproved items show no tip body
      tip_body: item.tip_approved ? (item.tip_body as string | null) : null,
      completed: prog?.completed ?? false,
      completed_at: prog?.completed_at ?? null,
    }
  })

  // ── Curator directory (project-scoped composer, no filters) ────────────
  const curatorDirectoryRows = (curatorRows ?? []) as unknown as DirectoryRow[]
  const rates = await computeResponseRates(
    service,
    curatorDirectoryRows.map(r => r.id)
  )
  const curators: DirectoryCurator[] = curatorDirectoryRows.map(row => {
    const { claimed_by, ...rest } = row
    return {
      ...rest,
      claimed: claimed_by !== null,
      response_rate: rates.get(row.id) ?? null,
    }
  })

  // ── Pitch history + already-pitched lookup (curator name / track title ──
  // resolved from the maps already fetched above — avoids embedded-join
  // shape ambiguity for a to-one FK relationship) ─────────────────────────
  const curatorNameById = new Map(curators.map(c => [c.id, c.name]))
  const trackTitleById = new Map(tracks.map(t => [t.id, t.title]))

  const alreadyPitchedByTrack: Record<string, Record<string, PitchStatus>> = {}
  const pitches: PitchHistoryRow[] = (pitchRows ?? []).map(row => {
    const byCurator = alreadyPitchedByTrack[row.track_id] ?? {}
    byCurator[row.curator_id] = row.status as PitchStatus
    alreadyPitchedByTrack[row.track_id] = byCurator

    return {
      id: row.id,
      curatorName: curatorNameById.get(row.curator_id) ?? 'Curator',
      trackTitle: trackTitleById.get(row.track_id) ?? 'Track',
      status: row.status as PitchStatus,
      sent_at: row.sent_at,
      decline_reason: row.decline_reason,
    }
  })

  // ── Social campaign (SOCIAL-03) ───────────────────────────────────────────
  // Shape active campaign via readPosts() — same defensive coercion used
  // by the API routes; null when no active campaign exists.
  const profileGenres = ((profileRow as { genres?: unknown } | null)?.genres ?? null) as string[] | null
  const projectGenre = (project as { genre?: string | null }).genre ?? null

  const activeCampaign: SocialCampaign | null = activeCampaignRow
    ? ({
        ...activeCampaignRow,
        posts: readPosts((activeCampaignRow as { posts?: unknown }).posts),
      } as SocialCampaign)
    : null

  const allCampaigns: SocialCampaign[] = (campaignRows ?? []).map(row => ({
    ...row,
    posts: readPosts((row as { posts?: unknown }).posts),
  })) as SocialCampaign[]

  return (
    <>
      <Topbar
        title={`${project.title} — Launchpad`}
        subtitle="Your post-release action plan — week by week"
      />
      <div className="flex-1 px-9 py-[30px]">
        <LaunchpadRoom project={project} items={merged} />

        <div className="mt-9 space-y-9">
          <PitchComposer
            project={{ id: project.id, title: project.title }}
            tracks={tracks}
            curators={curators}
            alreadyPitchedByTrack={alreadyPitchedByTrack}
          />

          <div>
            <h2 className="mb-4 text-[15px] font-bold text-white">Pitch history</h2>
            <PitchHistoryList pitches={pitches} />
          </div>
        </div>

        {/* ── Social campaign planner — third stacked block (SOCIAL-03) ── */}
        <div className="mt-9 space-y-9">
          <CampaignCalendar
            projectId={projectId}
            initialCampaign={activeCampaign}
            profileGenres={profileGenres}
            projectGenre={projectGenre}
          />

          {allCampaigns.length > 0 && (
            <div>
              <h2 className="mb-4 text-[15px] font-bold text-white">Campaign history</h2>
              <CampaignHistoryList
                projectId={projectId}
                campaigns={allCampaigns}
                onActiveChanged={() => {}}
                onDeleted={() => {}}
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
