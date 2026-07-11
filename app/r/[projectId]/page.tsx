import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getDemoProject } from '@/lib/vault/demo-store'
import { readComposers, readLyrics, COMPOSER_ROLE_LABELS } from '@/lib/metadata/schema'
import { PublicPlayer, type PublicTrack } from '@/components/player/PublicPlayer'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

type TrackRow = {
  id: string
  title?: string | null
  track_number?: number | null
  duration_seconds?: number | null
  audio_file_url?: string | null
  metadata?: Record<string, unknown> | null
}

// Public, stream-only projection of a track. Deliberately excludes ISRC/ISWC/
// BPM and split percentages — none of that belongs on an open share link
// (Phase 9 D-01/D-11). Credits are names + roles only; lyrics are the plain
// text for the slide-up panel.
function toPublicTracks(tracks: TrackRow[]): PublicTrack[] {
  return [...tracks]
    .sort((a, b) => (a.track_number ?? 0) - (b.track_number ?? 0))
    .map((t, i) => {
      const composers = readComposers(t.metadata)
      const lyrics = readLyrics(t.metadata)
      return {
        id: t.id,
        number: t.track_number ?? i + 1,
        title: t.title || `Track ${i + 1}`,
        durationSeconds: t.duration_seconds ?? null,
        audioUrl: t.audio_file_url ?? null,
        credits: composers.map(c => ({ name: c.name, role: COMPOSER_ROLE_LABELS[c.role] })),
        lyrics: lyrics?.text ?? null,
      }
    })
}

export default async function NowPlayingPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params

  let project: { title: string; cover_art_url: string | null; tracks?: TrackRow[] } | null = null
  let artist: string | null = null
  let allowResharing = false
  let viewerIsOwner = false

  if (DEMO) {
    const p = await getDemoProject(projectId)
    if (!p) notFound()
    project = p as unknown as { title: string; cover_art_url: string | null; tracks?: TrackRow[] }
    artist = 'Maya Reyes'
    viewerIsOwner = true
  } else {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('vault_projects')
      .select(
        `title, cover_art_url, is_public, user_id,
         tracks (id, title, track_number, duration_seconds, audio_file_url, metadata)`
      )
      .eq('id', projectId)
      .maybeSingle()

    // App-level gate: only public releases stream on the open page.
    if (!data || !(data as { is_public?: boolean }).is_public) notFound()
    project = data as unknown as { title: string; cover_art_url: string | null; tracks?: TrackRow[] }
    const ownerId = (data as { user_id: string }).user_id

    const { data: prof } = await supabase
      .from('artist_profiles')
      .select('artist_name, allow_resharing')
      .eq('id', ownerId)
      .maybeSingle()
    artist = prof?.artist_name ?? null
    allowResharing = (prof as { allow_resharing?: boolean } | null)?.allow_resharing ?? false

    // The owner viewing their own public release always sees Share (D-04/D-07).
    const {
      data: { user },
    } = await supabase.auth.getUser()
    viewerIsOwner = Boolean(user && user.id === ownerId)
  }

  const tracks = toPublicTracks(project.tracks ?? [])

  return (
    <PublicPlayer
      releaseTitle={project.title}
      artist={artist}
      coverUrl={project.cover_art_url}
      tracks={tracks}
      allowResharing={allowResharing}
      viewerIsOwner={viewerIsOwner}
    />
  )
}
