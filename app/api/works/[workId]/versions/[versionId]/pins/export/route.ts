import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { classifyPinExport, exportFilename } from '@/lib/catalogue/take-export'
import { renderAudacityLabels, renderMarkerCsv } from '@/lib/catalogue/take-export-formats'
import { renderAuditionMarkers } from '@/lib/catalogue/take-export-audition'
import { versionDisplayMap, type VersionOrderRow } from '@/lib/catalogue/version-comments'
import type { WorkVersionPin, WorkVersionPinView } from '@/types/catalogue'

// ─── The private half of E-02/E-03 — an author's own pins, and nothing else ─
// A pin is private by decision (39-CONTEXT D-10, D-11): wordless, visible to
// nobody but whoever dropped it. E-02 lets an author take those pins into a
// DAW. E-03 is the entire containment for that decision, and the
// containment is structural, not a flag: this file has no shared query with
// the comments export, no import of the comment view type, and no parameter
// that could select a comment. A flag ("mode=pins" on the comments route)
// would be the exact change that eventually leaks a private pin into a
// shareable file, so there is no flag to add — there are two route files.
//
// This path also emits nothing at all, per D-11. No row is written, no
// notification is created, no realtime event fires, nothing is logged. A
// trace on this path — even a successful one — would tell the room that
// someone has pins, which is precisely the disclosure D-11 forbids. That is
// why this file exports GET only, and only GET.

type RouteContext = { params: Promise<{ workId: string; versionId: string }> }

const PIN_COLUMNS = 'id, timestamp_ms, created_at'
const MAX_EXPORT_PINS = 200

type PinRow = Pick<WorkVersionPin, 'id' | 'timestamp_ms' | 'created_at'>

const FORMAT_VALUES = ['csv', 'audacity', 'audition'] as const
const FormatSchema = z.enum(FORMAT_VALUES)

function presentPin(row: PinRow): WorkVersionPinView {
  return { id: row.id, timestampMs: row.timestamp_ms, createdAt: row.created_at }
}

async function loadVersions(supabase: Awaited<ReturnType<typeof createApiClient>>, workId: string) {
  const { data, error } = await supabase
    .from('work_versions')
    .select('id, created_at')
    .eq('work_id', workId)
  if (error) throw new Error(error.message)
  return (data ?? []) as VersionOrderRow[]
}

export async function GET(request: Request, { params }: RouteContext) {
  const { workId, versionId } = await params

  const rawFormat = new URL(request.url).searchParams.get('format') ?? 'csv'
  const formatResult = FormatSchema.safeParse(rawFormat)
  if (!formatResult.success) {
    return NextResponse.json({ error: 'Unrecognized export format.' }, { status: 400 })
  }
  const format = formatResult.data

  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // A separate key namespaced to THIS route, not shared with the comments
  // export's `work-version-comments-export:` bucket. Sharing a bucket would
  // let the rate of one export reveal activity on the other, which is a
  // smaller version of the same disclosure D-11 exists to prevent. The
  // allowance (200 over 15 minutes) matches the comments export's own
  // generous, low-cost-read allowance; this limiter fails open like every
  // other read path in this subsystem.
  if (await checkRateLimit(`work-version-pins-export:${user.id}`, { maxAttempts: 200, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many exports. Please slow down.' }, { status: 429 })
  }

  // Room membership decides whether the caller may be here at all;
  // authorship (below) decides what they see once they are.
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  try {
    const versions = await loadVersions(supabase, workId)
    if (!versions.some(version => version.id === versionId)) {
      return NextResponse.json({ error: 'Recording version not found.' }, { status: 404 })
    }
    const versionDisplay = versionDisplayMap(versions).get(versionId) ?? 'this version'

    const { data: work, error: workError } = await supabase
      .from('works')
      .select('title')
      .eq('id', workId)
      .maybeSingle()
    if (workError) throw new Error(workError.message)
    if (!work) return NextResponse.json({ error: 'Work not found.' }, { status: 404 })

    const { data, error } = await supabase
      .from('work_version_pins')
      .select(PIN_COLUMNS)
      .eq('work_id', workId)
      .eq('version_id', versionId)
      // This equality is one of TWO independent gates, not the only one.
      // Migration 224's `work_version_pins_author_only` row policy is the
      // other. The phase constraint requires this API to filter explicitly
      // rather than lean on the policy alone — unlike the collection route's
      // GET, where the comment above the same filter says the policy is the
      // sole enforcement point, here the filter is a genuine second line of
      // defence: D-11's cross-account invisibility has never been verified
      // behaviourally (Jest cannot impersonate two authenticated Postgres
      // roles), so this route does not get to assume the policy alone holds.
      .eq('author_user_id', user.id)
      .order('timestamp_ms', { ascending: true })
      .limit(MAX_EXPORT_PINS)
    if (error) throw new Error(error.message)

    const pins = (data ?? []) as PinRow[]
    const classification = classifyPinExport(pins.map(presentPin))

    if (classification.refusalReason !== 'none') {
      // 409, not 200 — a 200 carrying a JSON refusal body is indistinguishable
      // from a successful download to anything not inspecting the payload,
      // and would save a file full of JSON onto someone's desktop.
      return NextResponse.json(
        { error: classification.refusalReason, message: classification.refusalMessage },
        { status: 409 }
      )
    }

    const filenameInput = { workTitle: work.title as string, versionDisplay, kind: 'my-pins' as const }
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
    const filename = exportFilename({ ...filenameInput, ext })

    // Note: no skipped-count header on this route. A pin cannot be flagged
    // for repositioning — that concept belongs to comments alone (E-09) —
    // and a header that always reads zero here is a header a later change
    // will eventually wire to something that isn't zero.
    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: 'Could not export pins' }, { status: 500 })
  }
}
