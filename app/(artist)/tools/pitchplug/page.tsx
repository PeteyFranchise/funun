import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { getDemoProjects } from '@/lib/vault/demo-store'
import { PitchPlugForm, type PitchProjectOption } from '@/components/tools/PitchPlugForm'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

export default async function PitchPlugPage() {
  let projects: PitchProjectOption[] = []
  let artistHandle: string | null = null

  if (DEMO) {
    projects = (await getDemoProjects()).map(p => ({ id: p.id, title: p.title, type: p.type, isPublic: true }))
    artistHandle = 'maya-reyes'
  } else {
    const supabase = createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const [{ data: profile }, { data }] = await Promise.all([
      supabase.from('artist_profiles').select('handle, is_public').eq('id', user?.id ?? '').maybeSingle(),
      supabase
        .from('vault_projects')
        .select('id, title, type, is_public')
        .eq('user_id', user?.id ?? '')
        .order('created_at', { ascending: false }),
    ])
    artistHandle = profile?.is_public ? (profile.handle ?? null) : null
    projects = ((data ?? []) as { id: string; title: string; type: string; is_public: boolean }[]).map(p => ({
      id: p.id,
      title: p.title,
      type: p.type,
      isPublic: p.is_public,
    }))
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="border-b border-white/10 pb-6">
        <p className="text-xs uppercase tracking-wide text-[#818CF8]">PitchPlug</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Cold-pitch generator</h1>
        <p className="mt-1 text-sm text-white/50">
          Tailored outreach emails for curators, blogs, radio, sync and bookers — written from your
          vault, grounded in real details, ready to send.
        </p>
      </header>

      {projects.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <p className="text-lg font-medium text-white">No projects yet</p>
          <p className="mt-1 max-w-sm text-sm text-white/50">
            PitchPlug writes from a real release in your vault. Add a project first.
          </p>
          <Link
            href="/vault/new"
            className="mt-6 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Create a project
          </Link>
        </div>
      ) : (
        <div className="mt-8">
          <PitchPlugForm projects={projects} demo={DEMO} artistHandle={artistHandle} />
        </div>
      )}
    </div>
  )
}
