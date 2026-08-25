import { requireStaffPage } from '@/lib/admin/gate'
import { createServiceClient } from '@/lib/supabase/server'
import { loadActivePlay } from '@/lib/playbook/plays'
import { PlayComposer, type CurrentActivePlay } from '@/components/playbook/PlayComposer'

// ─── /admin/playbook/plays — leadership Play composer (D-31.2-08/09/10/11) ──
// Leadership-only (requireStaffPage(['leadership'])) — the one place a team
// play is authored/published (this plan's Task 1 mounting point, "the
// leadership Playbook chrome"). Added here rather than in this plan's
// declared files_modified list because PlayComposer would otherwise be an
// unreachable component (Rule 2, auto-add missing critical functionality —
// see SUMMARY "Deviations"). Not yet wired into Rail2's nav — the Playbook
// chrome's nav/access-area structure belongs to plan 07's file scope
// (components/playbook/Rail2.tsx, app/(admin)/admin/playbook/access/page.tsx);
// this page is reachable by direct URL for leadership today, and nav wiring
// is additive follow-up outside this plan's scope.
export default async function PlaybookPlaysPage() {
  await requireStaffPage(['leadership'])

  const service = createServiceClient()
  const active = await loadActivePlay(service)

  const currentActive: CurrentActivePlay | null = active
    ? {
        id: active.play.id,
        title: active.play.title,
        note: active.play.note,
        publishedAt: active.play.publishedAt,
        assignments: active.assignments.map(a => ({ id: a.id, kind: a.kind, title: a.title })),
      }
    : null

  return (
    <div className="mx-auto w-full max-w-[900px] px-[28px] py-[22px] pb-[60px]">
      <h1 className="text-[24px] font-extrabold tracking-[-.02em] text-[color:var(--ink)]">Plays</h1>
      <p className="mt-2 max-w-[64ch] text-[14px] text-[color:var(--ink-2)]">
        Publish the one active team-wide play — client-targeted segments and general directives every AE sees on their My
        Client Partners banner.
      </p>
      <div className="mt-5">
        <PlayComposer currentActive={currentActive} />
      </div>
    </div>
  )
}
