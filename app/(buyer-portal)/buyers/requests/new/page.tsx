import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { authorizeRequestTarget } from '@/lib/deals/request-target'
import { RequestComposer } from '@/components/buyer/RequestComposer'

export const dynamic = 'force-dynamic'

// ─── New request page (D-07/D-02) ──────────────────────────────────────────
// The project is pre-selected via a `?project=` query param — arriving from
// a catalog card or shortlist entry (plan 16-05), never chosen here. This
// page owns no project browse UI of its own (out of this plan's scope).
// Authorization reuses authorizeRequestTarget — the SAME rights-ready +
// Phase 13 visibility + block gate the POST route re-runs on submit — so a
// buyer who hand-edits the query param never sees tracks for a project they
// could not legitimately request against.
export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const { project: projectId } = await searchParams
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/buyers/access')

  let target: Awaited<ReturnType<typeof authorizeRequestTarget>> | null = null
  if (projectId) {
    const service = createServiceClient()
    target = await authorizeRequestTarget(service, user.id, projectId)
  }
  const targetProject = target && target.ok ? target.project : null

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/buyers/requests" className="text-sm text-white/50 transition hover:text-white">
        ← Requests
      </Link>
      <div className="mt-4">
        <p className="text-xs uppercase tracking-wide text-white/40">New request</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Request a license</h1>
      </div>

      <div className="mt-8">
        {targetProject ? (
          <RequestComposer project={targetProject} />
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <p className="text-sm font-semibold text-white/70">No project selected</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-white/50">
              Start a request from a project in the catalog or a shortlist — this page needs a
              rights-ready project to build a request against.
            </p>
            <Link
              href="/buyers/catalog"
              className="mt-4 inline-block text-xs font-medium text-indigo-300 transition hover:text-indigo-200"
            >
              Browse catalog →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
