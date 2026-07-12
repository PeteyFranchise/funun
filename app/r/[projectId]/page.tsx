import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { getDemoProject } from '@/lib/vault/demo-store'
import { readComposers, readLyrics, COMPOSER_ROLE_LABELS } from '@/lib/metadata/schema'
import { PublicPlaybackView, type PublicTrackView } from '@/components/vault/PublicPlaybackView'

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

function toTrackViews(tracks: TrackRow[], signedByPath: Record<string, string>): PublicTrackView[] {
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
        // audio_file_url stores a storage PATH in a private bucket, not a URL —
        // only a server-minted signed URL is playable (mirrors the play page).
        audioUrl: t.audio_file_url ? signedByPath[t.audio_file_url] ?? null : null,
        // Public credits: names + role labels only, NO split (D-11).
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
  const signedByPath: Record<string, string> = {}

  if (DEMO) {
    const p = await getDemoProject(projectId)
    if (!p) notFound()
    project = p as unknown as { title: string; cover_art_url: string | null; tracks?: TrackRow[] }
    artist = 'Maya Reyes'
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

    const { data: prof } = await supabase
      .from('artist_profiles')
      .select('artist_name, allow_resharing')
      .eq('id', (data as { user_id: string }).user_id)
      .maybeSingle()
    artist = prof?.artist_name ?? null
    // Default to false when null/absent — the visitor Share affordance is
    // omitted unless the artist has explicitly opted in (D-07).
    allowResharing = Boolean((prof as { allow_resharing?: boolean } | null)?.allow_resharing)

    // Mint short-lived signed URLs for public playback. The `is_public` gate above
    // is the app-level authorization for using the service client here — the bucket
    // is private, so raw storage paths can never play in <audio src>.
    const paths = (project.tracks ?? [])
      .map(t => t.audio_file_url)
      .filter((p): p is string => Boolean(p))
    if (paths.length > 0) {
      const service = createServiceClient()
      const { data: signed } = await service.storage
        .from('track-audio')
        .createSignedUrls(paths, 60 * 60 * 2)
      for (const row of signed ?? []) {
        if (row.signedUrl && row.path) signedByPath[row.path] = row.signedUrl
      }
    }
  }

  const tracks = toTrackViews(project.tracks ?? [], signedByPath)

  return (
    <div className="min-h-screen bg-ink text-white">
      <header className="sticky top-0 z-40 flex items-center gap-4 border-b border-hair bg-ink/70 px-[clamp(24px,4vw,72px)] py-4 backdrop-blur-xl">
        <Link href="/vault" className="leading-none">
          <div className="gtext text-[23px] font-black tracking-[.04em]">FUNŪN</div>
          <div className="mt-[3px] text-[9.5px] font-bold tracking-[.32em] text-lavdim">THE ARTS</div>
        </Link>
        <span className="ml-3 text-[11.5px] font-bold uppercase tracking-[.18em] text-lavdim">Now Playing</span>
      </header>
      <div className="px-[clamp(24px,4vw,72px)]">
        <h1 className="pb-1 pt-7 text-[27px] font-extrabold tracking-[-.01em]">{project.title}</h1>
        <p className="text-[14px] font-medium text-lavdim">{artist ? `${artist} · ` : ''}Now playing</p>
      </div>
      <PublicPlaybackView
          releaseTitle={project.title}
          artist={artist}
          coverUrl={project.cover_art_url}
          tracks={tracks}
          projectId={projectId}
          allowResharing={allowResharing}
        />
    </div>
  )
}
