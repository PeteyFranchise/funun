import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'

export const dynamic = 'force-dynamic'

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

  // Fetch project — owner-scoped; includes release_date for Plan 04 collapse logic
  const { data: project } = await supabase
    .from('vault_projects')
    .select('id, title, release_date')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single()

  if (!project) notFound()

  return (
    <>
      <Topbar
        title={`${project.title} — Launchpad`}
        subtitle="Your post-release action plan — week by week"
      />
      <div className="flex-1 px-9 py-[30px]">
        <p className="text-sm text-white/40">Checklist loading…</p>
      </div>
    </>
  )
}
