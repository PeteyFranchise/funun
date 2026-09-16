import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { loadCommentProfiles } from '@/lib/catalogue/comment-participants.server'
import {
  presentVersionComments,
  versionDisplayMap,
  type VersionOrderRow,
} from '@/lib/catalogue/version-comments'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { classifyCommentExport, exportFilename } from '@/lib/catalogue/take-export'
import { renderAudacityLabels, renderMarkerCsv } from '@/lib/catalogue/take-export-formats'
import { renderAuditionMarkers } from '@/lib/catalogue/take-export-audition'
import type { WorkVersionComment } from '@/types/catalogue'

// ─── The shareable half of a deliberately split pair ───────────────────────
// Two facts about this file that are not visible from the code below:
//
// 1. Export is a pure READ. Nothing in this handler creates a row, changes a
//    row, deletes a row, calls a stored procedure, or emits a notification or
//    a realtime event. Nothing about a download is recorded anywhere (E-10).
//
// 2. This is the SHAREABLE export. A person's own private markers live
//    behind their own route, with their own query, gated to their own
//    authorship — and the two never share a data path. There is no flag, no
//    default and no parameter anywhere in this file that could widen this
//    query to reach that other, private data. If a future change ever needs
//    to merge the two behind one option, that change is exactly the one this
//    split exists to prevent.

type RouteContext = { params: Promise<{ workId: string; versionId: string }> }

const COMMENT_COLUMNS = 'id, work_id, version_id, parent_comment_id, author_user_id, body, timestamp_ms, mentioned_user_ids, resolved_at, resolved_by_user_id, carried_from_version_id, carried_from_comment_id, created_at, end_timestamp_ms, needs_reposition'

// The three named options a writer picks from (E-13) — a DAW choice, not a
// serialization choice. Audition's renderer is written and byte-pinned even
// though plan 40-07 only surfaces two of these three in the interface; the
// asymmetry is deliberate (see the dispatch below).
const ExportFormatSchema = z.enum(['csv', 'audacity', 'audition'])
type ExportFormat = z.infer<typeof ExportFormatSchema>

async function loadWorkVersions(supabase: Awaited<ReturnType<typeof createApiClient>>, workId: string) {
  const { data, error } = await supabase
    .from('work_versions')
    .select('id, created_at')
    .eq('work_id', workId)
  if (error) throw new Error(error.message)
  return (data ?? []) as VersionOrderRow[]
}

function authorIds(comments: WorkVersionComment[]): string[] {
  return Array.from(new Set(
    comments
      .map(comment => comment.author_user_id)
      .filter((id): id is string => Boolean(id))
  ))
}

export async function GET(request: Request, { params }: RouteContext) {
  const { workId, versionId } = await params

  const formatParsed = ExportFormatSchema.safeParse(
    new URL(request.url).searchParams.get('format') ?? 'csv'
  )
  if (!formatParsed.success) {
    return NextResponse.json(
      { error: 'format must be one of: csv, audacity, audition.' },
      { status: 400 }
    )
  }
  const format: ExportFormat = formatParsed.data

  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // A low-cost read, not a fan-out write: a generous allowance in the low
  // hundreds over the shared fifteen-minute window, left fail-open like the
  // other read paths in this subsystem. A writer exporting a take a few
  // times while comparing DAW imports should never notice this limit.
  if (await checkRateLimit(`work-version-comments-export:${user.id}`, { maxAttempts: 200, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many exports. Please slow down.' }, { status: 429 })
  }

  // The same gate the comments GET route uses, at the same tier — this
  // route must never become an easier way to reach comments a caller
  // could not already read, nor an existence oracle for a work id they
  // cannot reach.
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  try {
    const versions = await loadWorkVersions(supabase, workId)
    if (!versions.some(version => version.id === versionId)) {
      return NextResponse.json({ error: 'Recording version not found.' }, { status: 404 })
    }
    const displays = versionDisplayMap(versions)

    const { data: work, error: workError } = await supabase
      .from('works')
      .select('title')
      .eq('id', workId)
      .maybeSingle()
    if (workError || !work) {
      return NextResponse.json({ error: 'Work not found.' }, { status: 404 })
    }

    // A DAW marker file is imported against ONE audio file, so both filters
    // below are load-bearing, not redundant with the access check above —
    // without them a version id from a different work could be paired with
    // a work id the caller can reach. The null filter on the thread-parent
    // column is explicit for the same reason: migration 225's constraint
    // already prevents a reply from carrying a span, but this export must
    // not lean on that guarantee implicitly, and the pure classifier below
    // filters the same column again as a second, independent gate.
    const { data, error } = await supabase
      .from('work_version_comments')
      .select(COMMENT_COLUMNS)
      .eq('work_id', workId)
      .eq('version_id', versionId)
      .is('parent_comment_id', null)
      .order('timestamp_ms', { ascending: true })
      .limit(300)
    if (error) throw new Error(error.message)

    const comments = (data ?? []) as WorkVersionComment[]
    const profiles = await loadCommentProfiles(authorIds(comments))
    const presented = presentVersionComments({
      comments,
      profiles,
      versionDisplays: displays,
      viewerUserId: user.id,
      viewerIsOwner: access.isOwner,
      viewerCanAdminister: access.tier === 'administer',
    })

    const classification = classifyCommentExport(presented)
    if (classification.refusalReason !== 'none') {
      // 409, never 200: a JSON body on a 200 is indistinguishable from a
      // successful download to anything that is not carefully checking the
      // response, and would save a file full of JSON text onto someone's
      // desktop instead of the marker file they asked for.
      return NextResponse.json(
        { reason: classification.refusalReason, message: classification.refusalMessage },
        { status: 409 }
      )
    }

    const versionDisplay = displays.get(versionId) ?? 'v1'
    const workTitle = (work as { title: string | null }).title ?? 'Untitled'

    let body: string
    let contentType: string
    let ext: string
    if (format === 'audacity') {
      body = renderAudacityLabels(classification.exportable)
      contentType = 'text/plain; charset=utf-8'
      ext = 'txt'
    } else if (format === 'audition') {
      body = renderAuditionMarkers(classification.exportable)
      contentType = 'text/csv; charset=utf-8'
      ext = 'csv'
    } else {
      body = renderMarkerCsv(classification.exportable)
      contentType = 'text/csv; charset=utf-8'
      ext = 'csv'
    }

    const filename = exportFilename({ workTitle, versionDisplay, kind: 'comments', ext })

    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        // The E-09 skipped-repositioning count on the SUCCESS path too, not
        // only in a refusal body — a header is the only place it fits
        // alongside a file response.
        'X-Funun-Skipped-Reposition': String(classification.skippedRepositionCount),
        // Per-user content: nothing about this response belongs in a
        // shared cache or an intermediary.
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Could not export comments' },
      { status: 500 }
    )
  }
}
