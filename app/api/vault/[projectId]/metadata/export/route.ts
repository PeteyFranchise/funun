import { createApiClient } from '@/lib/supabase/server'
import { buildBundle, type ProjectRow, type TrackRow } from '@/lib/metadata/bundle'
import { buildCsv, buildDdexErn } from '@/lib/metadata/export'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const PROJECT_COLS =
  'title, type, genre, sub_genre, release_date, upc, cover_art_url, label, publisher, c_line, p_line, copyright_year, primary_language, contact_name, contact_email, contact_phone'
const TRACK_COLS =
  'id, title, track_number, isrc, iswc, duration_seconds, bpm, key_signature, explicit, language, featuring_artists, audio_file_url, metadata'

// GET /api/vault/[projectId]/metadata/export?format=csv|ddex
// Returns the release metadata as a downloadable CSV (distributor-ready)
// or a DDEX-aligned XML export.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const format = new URL(request.url).searchParams.get('format') ?? 'csv'

  if (DEMO) {
    return new Response('Export is not available in demo mode', { status: 400 })
  }

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: project } = await supabase
    .from('vault_projects')
    .select(PROJECT_COLS)
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return new Response('Project not found', { status: 404 })

  const { data: tracks } = await supabase
    .from('tracks')
    .select(TRACK_COLS)
    .eq('project_id', projectId)
    .eq('user_id', user.id)

  const { data: profile } = await supabase
    .from('artist_profiles')
    .select('artist_name')
    .eq('id', user.id)
    .maybeSingle()

  const bundle = buildBundle(
    project as unknown as ProjectRow,
    (tracks ?? []) as unknown as TrackRow[],
    profile?.artist_name ?? ''
  )

  const slug = bundle.releaseTitle.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'release'

  if (format === 'ddex') {
    return new Response(buildDdexErn(bundle), {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${slug}-ddex.xml"`,
      },
    })
  }

  return new Response(buildCsv(bundle), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-metadata.csv"`,
    },
  })
}
