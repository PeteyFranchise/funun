import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getDemoProject } from '@/lib/vault/demo-store'
import { readComposers, COMPOSER_ROLE_LABELS } from '@/lib/metadata/schema'
import { Topbar } from '@/components/layout/Topbar'
import { PlaybackView, type TrackView } from '@/components/vault/PlaybackView'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

type TrackRow = {
  id: string
  title?: string | null
  track_number?: number | null
  isrc?: string | null
  iswc?: string | null
  bpm?: number | null
  language?: string | null
  duration_seconds?: number | null
  audio_file_url?: string | null
  metadata?: Record<string, unknown> | null
}
type ProjectRow = {
  id: string
  title: string
  cover_art_url: string | null
  tracks?: TrackRow[]
}

function toTrackViews(tracks: TrackRow[]): TrackView[] {
  return [...tracks]
    .sort((a, b) => (a.track_number ?? 0) - (b.track_number ?? 0))
    .map((t, i) => {
      const composers = readComposers(t.metadata)
      const splitTotal = Math.round(composers.reduce((s, c) => s + (c.split || 0), 0) * 100) / 100
      return {
        id: t.id,
        number: t.track_number ?? i + 1,
        title: t.title || `Track ${i + 1}`,
        durationSeconds: t.duration_seconds ?? null,
        isrc: t.isrc ?? null,
        iswc: t.iswc ?? null,
        bpm: t.bpm ?? null,
        language: t.language ?? null,
        audioUrl: t.audio_file_url ?? null,
        credits: composers.map(c => ({
          name: c.name,
          role: COMPOSER_ROLE_LABELS[c.role],
          split: c.split,
        })),
        splitTotal,
      }
    })
}

async function load(projectId: string): Promise<{ project: ProjectRow; artist: string | null } | null> {
  if (DEMO) {
    const p = (await getDemoProject(projectId)) as ProjectRow | null
    return p ? { project: p, artist: 'Maya Reyes' } : null
  }
  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const [{ data: profile }, { data: project }] = await Promise.all([
    supabase.from('artist_profiles').select('artist_name').eq('id', user?.id ?? '').maybeSingle(),
    supabase
      .from('vault_projects')
      .select(
        `id, title, cover_art_url, tracks (id, title, track_number, isrc, iswc, bpm, language, duration_seconds, audio_file_url, metadata)`
      )
      .eq('id', projectId)
      .eq('user_id', user?.id ?? '')
      .maybeSingle(),
  ])
  return project ? { project: project as ProjectRow, artist: profile?.artist_name ?? null } : null
}

export default async function PlaybackPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const loaded = await load(projectId)
  if (!loaded) notFound()
  const { project, artist } = loaded
  const tracks = toTrackViews(project.tracks ?? [])

  return (
    <>
      <Topbar title={project.title} subtitle={`${artist ? `${artist} · ` : ''}Now playing — masters, credits & metadata`} />
      <PlaybackView
        releaseTitle={project.title}
        artist={artist}
        coverUrl={project.cover_art_url}
        tracks={tracks}
      />
    </>
  )
}
