import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { suggestTrackMatches, detectTrackConflicts } from '@/lib/split-sheets/attachment'
import { AttachSheetPanel, type CurrentAttachment, type ProjectOption } from '@/components/split-sheets/AttachSheetPanel'

export const dynamic = 'force-dynamic'

// ─── The Locker-side attach direction (17-DUAL-ENTRY-DESIGN section 3) ──
// A new route, reachable from anywhere (Contract Locker, a sheet's own
// detail view), so neither the Locker nor a sheet detail page has to own
// the attach flow itself. Loads exactly what AttachSheetPanel needs: the
// sheet's identity/provenance, the caller's own Vault projects (only a
// project owner can attach to it — the double check the route itself
// re-enforces), and this sheet's current attachments.
export default async function AttachSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  const { data: sheet } = await supabase
    .from('split_sheets')
    .select('id, song_name, status, source, split_sheet_parties(user_id), initiator_user_id')
    .eq('id', id)
    .maybeSingle()

  const parties = (sheet?.split_sheet_parties ?? []) as { user_id: string | null }[]
  const isParty = !!sheet && (sheet.initiator_user_id === user.id || parties.some(p => p.user_id === user.id))
  if (!sheet || !isParty) notFound()

  const { data: projectRows } = await supabase
    .from('vault_projects')
    .select('id, title, tracks (id, title)')
    .eq('user_id', user.id)

  const projects: ProjectOption[] = (projectRows ?? []).map(p => ({
    id: p.id as string,
    title: (p.title as string) ?? 'Untitled project',
    tracks: ((p.tracks ?? []) as { id: string; title: string | null }[]).map(t => ({
      id: t.id,
      title: t.title ?? 'Untitled track',
    })),
  }))

  const { data: attachmentRows } = await supabase
    .from('split_sheet_attachments')
    .select('vault_project_id, track_id, vault_projects (title), tracks (title)')
    .eq('split_sheet_id', id)

  type AttachmentRow = {
    vault_project_id: string
    track_id: string | null
    vault_projects: { title: string | null } | null
    tracks: { title: string | null } | null
  }
  const rows = (attachmentRows ?? []) as unknown as AttachmentRow[]

  // Same-track conflicts (design section 7): reachable via RLS because the
  // caller owns every project these attachments point at, which is exactly
  // the "project owner sees attachments to their release" policy migration
  // 067 adds.
  const trackIds = rows.map(r => r.track_id).filter((t): t is string => !!t)
  let conflictTrackIds = new Set<string>()
  if (trackIds.length > 0) {
    const { data: sameTrackRows } = await supabase
      .from('split_sheet_attachments')
      .select('split_sheet_id, track_id')
      .in('track_id', trackIds)
    const conflicts = detectTrackConflicts(
      ((sameTrackRows ?? []) as { split_sheet_id: string; track_id: string | null }[]).map(r => ({
        sheetId: r.split_sheet_id,
        trackId: r.track_id,
      }))
    )
    conflictTrackIds = new Set(conflicts.map(c => c.trackId))
  }

  const currentAttachments: CurrentAttachment[] = rows.map(r => {
    const project = projects.find(p => p.id === r.vault_project_id)
    // Best-effort "was this a deleted track?" signal (see AttachSheetPanel
    // doc comment): a high-confidence fuzzy match against the SAME
    // project's remaining tracks despite a null track_id.
    const possiblyTrackRemoved =
      r.track_id === null && !!project && suggestTrackMatches(sheet.song_name, project.tracks).some(m => m.suggested)
    return {
      projectId: r.vault_project_id,
      projectTitle: r.vault_projects?.title ?? project?.title ?? 'Untitled project',
      trackId: r.track_id,
      trackTitle: r.tracks?.title ?? null,
      possiblyTrackRemoved,
      conflict: r.track_id ? conflictTrackIds.has(r.track_id) : false,
    }
  })

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/contracts" className="text-sm text-white/50 transition hover:text-white">
        ← Contract Locker
      </Link>
      <p className="mb-1 mt-6 text-[11px] font-bold uppercase tracking-[.18em] text-lavdim">Attach a split sheet</p>
      <h1 className="text-[22px] font-extrabold text-white">&ldquo;{sheet.song_name}&rdquo;</h1>
      <p className="mt-1 text-sm text-white/50">
        Attaching links this sheet to a release — it never moves the document out of your Locker.
      </p>

      <div className="mt-6">
        <AttachSheetPanel
          sheetId={sheet.id}
          songName={sheet.song_name as string}
          source={(sheet.source as 'funun' | 'uploaded') ?? 'funun'}
          status={(sheet.status as string) ?? 'draft'}
          projects={projects}
          currentAttachments={currentAttachments}
        />
      </div>
    </div>
  )
}
