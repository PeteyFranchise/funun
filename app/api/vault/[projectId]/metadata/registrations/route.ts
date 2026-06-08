import { createApiClient } from '@/lib/supabase/server'
import { buildBundle, type ProjectRow, type TrackRow } from '@/lib/metadata/bundle'
import { buildRegistrationPackages, buildRegistrationText } from '@/lib/metadata/registration'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const PROJECT_COLS =
  'title, type, genre, sub_genre, release_date, upc, cover_art_url, label, publisher, c_line, p_line, copyright_year, primary_language, contact_name, contact_email, contact_phone'
const TRACK_COLS =
  'id, title, track_number, isrc, iswc, duration_seconds, bpm, key_signature, explicit, language, featuring_artists, audio_file_url, metadata'

// GET /api/vault/[projectId]/metadata/registrations
// Downloads a .txt with pre-filled registration packages for the US rights
// bodies (ASCAP/BMI/SESAC, The MLC, SoundExchange).
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
  const text = buildRegistrationText(buildRegistrationPackages(bundle))
  const slug =
    bundle.releaseTitle.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'release'

  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-registrations.txt"`,
    },
  })
}
