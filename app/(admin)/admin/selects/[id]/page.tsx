export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/lib/admin/gate'
import { loadSelectsInScope } from '@/lib/selects/persistence'
import { resolveTracksWithRightsReady } from '@/lib/selects/tracks-query'
import { SelectsBuilder, type SelectsBuilderTrackRow } from '@/components/admin/SelectsBuilder'

// ─── Selects builder detail page (31-10, Task 2) ──────────────────────────
// Staff-gated + own-book (loadSelectsInScope — the SAME scope authority
// every /api/admin/selects/* route uses, T-31-23): a Selects belonging to
// an org outside the caller's book resolves to notFound(), identical to a
// genuine 404 (no existence leak). Fetches the Selects row + its tracks
// (both active and soft-removed, for the Removed tray) SERVER-SIDE via
// resolveTracksWithRightsReady — the same lib function
// GET /api/admin/selects/[id]/tracks calls — then hands them to the
// client-side SelectsBuilder, which does all further writes through the
// 31-04/31-05 API routes (never a direct client DB write).

export default async function AdminSelectsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const role = getStaffRole(user)
  // CR-01 hardening: 'it' is read-only Playbook-IT-room staff and must not
  // reach a Selects builder — excluded alongside no-role.
  if (!role || role === 'it') redirect('/')

  const service = createServiceClient()
  const selects = await loadSelectsInScope(service, id, role, user.id)
  if (!selects) notFound()

  const { data: orgRow } = await service
    .from('buyer_orgs')
    .select('id, name')
    .eq('id', selects.buyer_org_id)
    .maybeSingle()
  const orgName = (orgRow as { name: string } | null)?.name ?? 'Unknown client'

  const trackRows = await resolveTracksWithRightsReady(service, id, true)
  const builderTracks: SelectsBuilderTrackRow[] = trackRows.map(r => ({
    id: r.id,
    track_id: r.track_id,
    note: r.note,
    position: r.position,
    added_by: r.added_by,
    source: r.source,
    removed_at: r.removed_at,
    rights_ready: r.rights_ready,
    title: r.track?.title || 'Untitled track',
  }))
  const initialTracks = builderTracks.filter(t => !t.removed_at)
  const initialRemoved = builderTracks.filter(t => t.removed_at)

  return (
    <div className="flex-1 px-9 py-[30px]">
      <div className="mb-4 flex items-center gap-2 text-[12px] text-[color:var(--ink-3)]">
        <Link href="/admin/selects" className="hover:text-[color:var(--ink)]">
          Selects
        </Link>
        <span>/</span>
        <span className="text-[color:var(--ink-2)]">{orgName}</span>
      </div>
      <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[.13em] text-[color:var(--ink-3)]">
        For {orgName}
        {selects.brief_id ? ' · off a linked brief' : ''}
      </p>
      <SelectsBuilder
        selects={{
          id: selects.id,
          name: selects.name,
          cover_note: selects.cover_note,
          status: selects.status,
          share_token: selects.share_token,
          brief_id: selects.brief_id,
        }}
        initialTracks={initialTracks}
        initialRemoved={initialRemoved}
      />
    </div>
  )
}
