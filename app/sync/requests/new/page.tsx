import Link from 'next/link'
import { isReadWithheld, LICENCE_REQUEST_WITHHELD_HEADING, LICENCE_REQUEST_WITHHELD_BODY } from '@/lib/deals/buyer-song-unit-read-withholding'
import { syncContactHref } from '@/lib/sync-library/contact'
import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { authorizeRequestTarget } from '@/lib/deals/request-target'
import { RequestComposer } from '@/components/buyer/RequestComposer'

export const dynamic = 'force-dynamic'

// ─── New request page (D-07/D-02) ──────────────────────────────────────────
// 23-02: moved from app/(buyer-portal)/buyers/requests/new/page.tsx to
// app/sync/requests/new/page.tsx as part of the /buyers/* → /sync/*
// unification. Self-gates to /sync/access (the non-gating /sync layout no
// longer backstops this).
//
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
  if (!user) redirect('/sync/access')

  let target: Awaited<ReturnType<typeof authorizeRequestTarget>> | null = null
  if (projectId) {
    const service = createServiceClient()
    target = await authorizeRequestTarget(service, user.id, projectId)
  }
  const targetProject = target && target.ok ? target.project : null

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/sync/requests" className="text-sm text-[color:var(--ink-3)] transition hover:text-[color:var(--ink)]">
        ← Requests
      </Link>
      <div className="mt-4">
        <p className="text-xs uppercase tracking-wide text-[color:var(--ink-3)]">New request</p>
        <h1 className="mt-1 text-2xl font-semibold text-[color:var(--ink)]">Request a license</h1>
      </div>

      <div className="mt-8">
        {/* 50.5 Task 2 — WITHHELD. This is the alternate multi-song path. The
            composer is reached with ?project= and then offers every track on
            that project, so one request could name several recordings. The
            catalogue modal was already withheld; withholding only that one
            left this door open. */}
        {isReadWithheld('request_composer') ? (
          <div className="rounded-xl border border-[color:var(--line)] bg-[var(--wash)] p-8 text-center">
            <p className="text-sm font-semibold text-[color:var(--ink-2)]">{LICENCE_REQUEST_WITHHELD_HEADING}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-[color:var(--ink-3)]">{LICENCE_REQUEST_WITHHELD_BODY}</p>
            <a
              className="mt-4 inline-block rounded-lg border border-[color:var(--line)] bg-[var(--wash-2)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--indigo)]"
              href={syncContactHref('Licensing enquiry')}
            >
              Email us
            </a>
          </div>
        ) : targetProject ? (
          <RequestComposer project={targetProject} />
        ) : (
          <div className="rounded-xl border border-[color:var(--line)] bg-[var(--wash)] p-8 text-center">
            <p className="text-sm font-semibold text-[color:var(--ink-2)]">No project selected</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-[color:var(--ink-3)]">
              Start a request from a project in the catalog or a shortlist — this page needs a
              rights-ready project to build a request against.
            </p>
            <Link
              href="/sync/catalog"
              className="mt-4 inline-block text-xs font-medium text-[color:var(--indigo)] transition hover:text-[color:var(--fuchsia)]"
            >
              Browse catalog →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
