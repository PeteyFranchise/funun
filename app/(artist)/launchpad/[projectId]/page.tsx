import { notFound, redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/Topbar'
import { LaunchpadRoom } from '@/components/launchpad/LaunchpadRoom'
import type { MergedChecklistItem } from '@/types'

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

  // Fetch project — owner-scoped; includes release_date for before-release collapse logic
  const { data: project } = await supabase
    .from('vault_projects')
    .select('id, title, release_date')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single()

  if (!project) notFound()

  // Parallel fetch: checklist item definitions + this user's progress for this project.
  // Items are read via the service client because launchpad_checklist_items RLS is now
  // USING(false) (migration 029, CR-03) — direct user-scoped reads return nothing. This
  // read is safe here: project ownership is already verified above, and tip gating +
  // admin-column stripping happen in the merge below. Progress stays on the user-scoped
  // client (RLS: auth.uid() = user_id).
  const service = createServiceClient()
  const [{ data: items }, { data: progress }] = await Promise.all([
    service
      .from('launchpad_checklist_items')
      .select('*')
      .order('sort_order'),
    supabase
      .from('launchpad_progress')
      .select('item_key, completed, completed_at')
      .eq('project_id', projectId)
      .eq('user_id', user.id),
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

  return (
    <>
      <Topbar
        title={`${project.title} — Launchpad`}
        subtitle="Your post-release action plan — week by week"
      />
      <div className="flex-1 px-9 py-[30px]">
        <LaunchpadRoom project={project} items={merged} />
      </div>
    </>
  )
}
