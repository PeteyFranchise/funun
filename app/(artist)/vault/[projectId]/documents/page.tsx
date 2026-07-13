import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { computeStage3 } from '@/lib/vault/stage3'
import { getDemoProject } from '@/lib/vault/demo-store'
import { DocumentStage } from '@/components/vault/DocumentStage'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

type StageProject = {
  id: string
  title: string
  type: string
  vault_readiness_score: number
  content_id_registered: boolean | null
  content_id_dismissed_until: string | null
  tracks: {
    id: string
    title: string | null
    writers: string[] | null
    producers: string[] | null
    mixing_engineer: string | null
    mastering_engineer: string | null
    has_sample: boolean | null
    sample_details: string | null
  }[]
  vault_documents: {
    id: string
    type: string
    status: string
    track_id: string | null
    document_data: Record<string, unknown> | null
  }[]
}

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  let project: StageProject | null = null

  if (DEMO) {
    project = (await getDemoProject(projectId)) as StageProject | null
  } else {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data } = await supabase
      .from('vault_projects')
      .select(
        `
        id, title, type, vault_readiness_score,
        content_id_registered, content_id_dismissed_until,
        tracks (id, title, writers, producers, mixing_engineer, mastering_engineer, has_sample, sample_details),
        vault_documents (id, type, status, track_id, document_data)
      `
      )
      .eq('id', projectId)
      .eq('user_id', user?.id ?? '')
      .maybeSingle()

    project = (data as StageProject | null) ?? null
  }

  if (!project) notFound()

  const stage3 = computeStage3(
    project,
    project.tracks ?? [],
    project.vault_documents ?? [],
    project.vault_readiness_score
  )

  const stageTracks = (project.tracks ?? []).map(t => ({
    id: t.id,
    title: t.title ?? 'Untitled track',
    has_sample: t.has_sample ?? false,
    sample_details: t.sample_details,
  }))

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link href={`/vault/${projectId}`} className="text-sm text-white/50 transition hover:text-white">
        ← {project.title}
      </Link>
      <div className="mt-6">
        <DocumentStage
          projectId={projectId}
          stage3={stage3}
          tracks={stageTracks}
          readinessScore={project.vault_readiness_score}
        />
      </div>
    </div>
  )
}
