import { createServerClient } from '@/lib/supabase/server'
import type { Track, VaultDocument, VaultProject } from '@/types'
import { buildEligibilityInput, evaluateDirectOverlayEligibility } from '@/lib/eligibility/direct-overlay'
import { readPerformers, readRecordingInfo } from '@/lib/metadata/schema'
import { assessRdrReadiness, type RdrTrackInput } from '@/lib/metadata/rdr'
import { getDemoProjects } from '@/lib/vault/demo-store'
import { Topbar } from '@/components/layout/Topbar'
import { RightsCoach, type CoachRelease } from '@/components/coach/RightsCoach'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

type LoadedProject = VaultProject & { tracks?: Track[]; vault_documents?: VaultDocument[] }

export default async function CoachPage() {
  let projects: LoadedProject[] = []
  let artist: string | null = null

  if (DEMO) {
    projects = (await getDemoProjects()) as unknown as LoadedProject[]
    artist = 'Maya Reyes'
  } else {
    const supabase = createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const [{ data: profile }, { data }] = await Promise.all([
      supabase.from('artist_profiles').select('artist_name').eq('id', user?.id ?? '').maybeSingle(),
      supabase
        .from('vault_projects')
        .select(
          `id, title, p_line, label,
           tracks (id, title, isrc, has_sample, audio_file_url, language, metadata),
           vault_documents (id, type, status, project_id, track_id, signed_at)`
        )
        .eq('user_id', user?.id ?? '')
        .order('created_at', { ascending: false }),
    ])
    artist = profile?.artist_name ?? null
    projects = (data ?? []) as unknown as LoadedProject[]
  }

  const releases: CoachRelease[] = projects.map(p => {
    const input = buildEligibilityInput(
      p as VaultProject,
      (p.tracks ?? []) as Track[],
      (p.vault_documents ?? []) as VaultDocument[]
    )
    const rightsOwner = (p as { p_line?: string | null }).p_line || (p as { label?: string | null }).label || artist
    const rdrInputs: RdrTrackInput[] = (p.tracks ?? []).map(t => ({
      title: t.title ?? 'Untitled',
      isrc: t.isrc ?? null,
      mainArtist: artist,
      rightsOwner,
      performers: readPerformers(t.metadata),
      recording: readRecordingInfo(t.metadata),
    }))
    const rdr = assessRdrReadiness(rdrInputs)
    return {
      projectId: p.id,
      title: p.title,
      result: evaluateDirectOverlayEligibility(input),
      rdr: { coreCount: rdr.coreCount, recommendedCount: rdr.recommendedCount, total: rdr.tracks.length },
    }
  })

  const tier1 = releases.filter(r => r.result.tier1Eligible).length

  return (
    <>
      <Topbar
        title="Rights Coach"
        subtitle={`${tier1} of ${releases.length} release${releases.length === 1 ? '' : 's'} deal-ready — how to qualify for direct sync & library deals`}
      />
      <div className="flex-1 px-9 py-[30px]">
        {releases.length === 0 ? (
          <p className="text-[14px] text-lavdim">Add a release to your vault to see its direct-deal eligibility.</p>
        ) : (
          <RightsCoach releases={releases} />
        )}
      </div>
    </>
  )
}
