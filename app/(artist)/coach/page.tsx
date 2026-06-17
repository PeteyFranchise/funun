import { createServerClient } from '@/lib/supabase/server'
import type { Track, VaultDocument, VaultProject } from '@/types'
import { buildEligibilityInput, evaluateDirectOverlayEligibility } from '@/lib/eligibility/direct-overlay'
import { getDemoProjects } from '@/lib/vault/demo-store'
import { Topbar } from '@/components/layout/Topbar'
import { RightsCoach, type CoachRelease } from '@/components/coach/RightsCoach'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

type LoadedProject = VaultProject & { tracks?: Track[]; vault_documents?: VaultDocument[] }

export default async function CoachPage() {
  let projects: LoadedProject[] = []

  if (DEMO) {
    projects = (await getDemoProjects()) as unknown as LoadedProject[]
  } else {
    const supabase = createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('vault_projects')
      .select(
        `id, title,
         tracks (id, title, has_sample, audio_file_url, language, metadata),
         vault_documents (id, type, status, project_id, track_id, signed_at)`
      )
      .eq('user_id', user?.id ?? '')
      .order('created_at', { ascending: false })
    projects = (data ?? []) as unknown as LoadedProject[]
  }

  const releases: CoachRelease[] = projects.map(p => {
    const input = buildEligibilityInput(
      p as VaultProject,
      (p.tracks ?? []) as Track[],
      (p.vault_documents ?? []) as VaultDocument[]
    )
    return { projectId: p.id, title: p.title, result: evaluateDirectOverlayEligibility(input) }
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
