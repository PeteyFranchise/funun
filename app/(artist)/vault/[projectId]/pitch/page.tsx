import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getDemoProject } from '@/lib/vault/demo-store'
import { PitchPlugForm, type PitchProjectOption } from '@/components/tools/PitchPlugForm'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

export default async function VaultPitchPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  let project: PitchProjectOption | null = null

  if (DEMO) {
    const p = await getDemoProject(projectId)
    if (p) project = { id: p.id, title: p.title, type: p.type }
  } else {
    const supabase = createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('vault_projects')
      .select('id, title, type')
      .eq('id', projectId)
      .eq('user_id', user?.id ?? '')
      .maybeSingle()
    if (data) project = data as PitchProjectOption
  }

  if (!project) notFound()

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link
        href={`/vault/${project.id}`}
        className="text-sm text-white/50 transition hover:text-white"
      >
        ← Back to {project.title}
      </Link>

      <header className="mt-4 border-b border-white/10 pb-6">
        <p className="text-xs uppercase tracking-wide text-[#818CF8]">PitchPlug</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Pitch {project.title}</h1>
        <div className="mt-3 rounded-lg border border-[#818CF8]/30 bg-[#818CF8]/10 px-4 py-2.5 text-sm text-[#C7CBF7]">
          Pitching <span className="font-medium text-white">{project.title}</span> — all fields
          pre-filled from your vault. Just pick who you&rsquo;re pitching.
        </div>
      </header>

      <div className="mt-8">
        <PitchPlugForm
          projects={[project]}
          initialProjectId={project.id}
          locked
          demo={DEMO}
        />
      </div>
    </div>
  )
}
