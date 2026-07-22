import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { computeStage3 } from '@/lib/vault/stage3'
import { getDemoProject } from '@/lib/vault/demo-store'
import { DocumentStage } from '@/components/vault/DocumentStage'
import { LinkSplitSheet, type AvailableSheet, type AttachedSheetRow } from '@/components/vault/LinkSplitSheet'
import { suggestTrackMatches, detectTrackConflicts } from '@/lib/split-sheets/attachment'

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
  let availableSheets: AvailableSheet[] = []
  let attachedSheets: AttachedSheetRow[] = []

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

    // ─── Split sheets covering this release (design section 5) ──────────
    // Reached via split_sheet_attachments, NOT vault_documents alone — a
    // sheet attached to a second project surfaces here too even though its
    // document row's project_id points at the first (design section 2c).
    if (project && user) {
      const projectTracks = (project.tracks ?? []).map(t => ({ id: t.id, title: t.title ?? 'Untitled track' }))

      const { data: attachmentRows } = await supabase
        .from('split_sheet_attachments')
        .select('split_sheet_id, track_id, split_sheets (song_name, status, source), tracks (title)')
        .eq('vault_project_id', projectId)

      type AttachmentRow = {
        split_sheet_id: string
        track_id: string | null
        split_sheets: { song_name: string; status: string; source: string } | null
        tracks: { title: string | null } | null
      }
      const rows = (attachmentRows ?? []) as unknown as AttachmentRow[]

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

      attachedSheets = rows
        .filter(r => r.split_sheets)
        .map(r => {
          const songName = r.split_sheets!.song_name
          const possiblyTrackRemoved =
            r.track_id === null && suggestTrackMatches(songName, projectTracks).some(m => m.suggested)
          return {
            sheetId: r.split_sheet_id,
            songName,
            status: r.split_sheets!.status,
            source: (r.split_sheets!.source as 'funun' | 'uploaded') ?? 'funun',
            trackId: r.track_id,
            trackTitle: r.tracks?.title ?? null,
            possiblyTrackRemoved,
            conflict: r.track_id ? conflictTrackIds.has(r.track_id) : false,
          }
        })

      // The caller's own sheets not yet attached to THIS project (a sheet
      // already attached elsewhere may still be offered — the
      // single-and-album case).
      const { data: mySheets } = await supabase
        .from('split_sheets')
        .select('id, song_name, status, source')
        .eq('initiator_user_id', user.id)

      const alreadyHere = new Set(rows.map(r => r.split_sheet_id))
      availableSheets = ((mySheets ?? []) as { id: string; song_name: string; status: string; source: string }[])
        .filter(s => !alreadyHere.has(s.id))
        .map(s => ({
          id: s.id,
          songName: s.song_name,
          status: s.status,
          source: (s.source as 'funun' | 'uploaded') ?? 'funun',
        }))
    }
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
      <div className="mt-6 space-y-6">
        <DocumentStage
          projectId={projectId}
          stage3={stage3}
          tracks={stageTracks}
          readinessScore={project.vault_readiness_score}
        />
        {!DEMO && (
          <LinkSplitSheet
            projectId={projectId}
            tracks={stageTracks.map(t => ({ id: t.id, title: t.title }))}
            availableSheets={availableSheets}
            attachedSheets={attachedSheets}
          />
        )}
      </div>
    </div>
  )
}
