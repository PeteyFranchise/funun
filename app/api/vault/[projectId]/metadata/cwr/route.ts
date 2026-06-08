import { createApiClient } from '@/lib/supabase/server'
import { buildBundle, type ProjectRow, type TrackRow } from '@/lib/metadata/bundle'
import { buildCwrFile, cwrFilename, defaultSelfSubmitSender } from '@/lib/metadata/cwr'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const PROJECT_COLS =
  'title, type, genre, sub_genre, release_date, upc, cover_art_url, label, publisher, c_line, p_line, copyright_year, primary_language, contact_name, contact_email, contact_phone'
const TRACK_COLS =
  'id, title, track_number, isrc, iswc, duration_seconds, bpm, key_signature, explicit, language, featuring_artists, audio_file_url, metadata'

// GET /api/vault/[projectId]/metadata/cwr
// Downloads a CWR 2.1 draft file for the writer-controlled works in this
// release (see docs/cwr-plan.md, Path A). Returns 422 with a reason when no
// work is ready, so the UI can point the artist at what's missing.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  if (DEMO) return new Response('Not available in demo mode', { status: 400 })

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

  const sender = defaultSelfSubmitSender(bundle)
  const file = buildCwrFile(bundle, sender)
  if (!file) {
    return new Response(
      'No works are CWR-ready yet. Open the CWR page to see what each work is missing.',
      { status: 422 }
    )
  }

  return new Response(file, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${cwrFilename(sender)}"`,
    },
  })
}
