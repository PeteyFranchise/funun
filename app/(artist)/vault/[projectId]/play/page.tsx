import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { getDemoProject } from '@/lib/vault/demo-store'
import { readComposers, readMasterAudio, readStems, readInstrumental, COMPOSER_ROLE_LABELS } from '@/lib/metadata/schema'
import { readinessLabel } from '@/lib/vault/readiness'
import { buildExportManifest } from '@/lib/vault/export-pack'
import { Topbar } from '@/components/layout/Topbar'
import { PlaybackView, type TrackView } from '@/components/vault/PlaybackView'
import { ExportPackButton } from '@/components/vault/ExportPackButton'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
const BUCKET = 'track-audio'

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
  vault_readiness_score: number
  tracks?: TrackRow[]
}

function toTrackViews(tracks: TrackRow[], signedByPath: Record<string, string>): TrackView[] {
  return [...tracks]
    .sort((a, b) => (a.track_number ?? 0) - (b.track_number ?? 0))
    .map((t, i) => {
      const composers = readComposers(t.metadata)
      const splitTotal = Math.round(composers.reduce((s, c) => s + (c.split || 0), 0) * 100) / 100
      const stems = readStems(t.metadata)
      const instrumental = readInstrumental(t.metadata)
      return {
        id: t.id,
        number: t.track_number ?? i + 1,
        title: t.title || `Track ${i + 1}`,
        durationSeconds: t.duration_seconds ?? null,
        isrc: t.isrc ?? null,
        iswc: t.iswc ?? null,
        bpm: t.bpm ?? null,
        language: t.language ?? null,
        // Signed URL for the share/master playback path
        audioUrl: t.audio_file_url ? (signedByPath[t.audio_file_url] ?? null) : null,
        // Signed URL for the instrumental (null when absent)
        instrumentalUrl: instrumental ? (signedByPath[instrumental.path] ?? null) : null,
        // Whether a stems ZIP exists (presence, not a signed URL — stems are download-only)
        hasStems: Boolean(stems),
        // Signed download URL for the stems ZIP
        stemsUrl: stems ? (signedByPath[stems.path] ?? null) : null,
        // Whether this track has a master WAV — used for the no-master gate on Export Pack (D-10)
        hasMasterWav: Boolean(readMasterAudio(t.metadata)),
        credits: composers.map(c => ({
          name: c.name,
          role: COMPOSER_ROLE_LABELS[c.role],
          split: c.split,
        })),
        splitTotal,
      }
    })
}

async function load(projectId: string): Promise<{
  project: ProjectRow
  artist: string | null
  userId: string
} | null> {
  if (DEMO) {
    const p = (await getDemoProject(projectId)) as ProjectRow | null
    return p ? { project: { ...p, vault_readiness_score: p.vault_readiness_score ?? 0 }, artist: 'Maya Reyes', userId: '' } : null
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
        `id, title, cover_art_url, vault_readiness_score,
         tracks (id, title, track_number, isrc, iswc, bpm, language, duration_seconds, audio_file_url, metadata)`
      )
      .eq('id', projectId)
      .eq('user_id', user?.id ?? '')
      .maybeSingle(),
  ])

  return project
    ? { project: project as ProjectRow, artist: profile?.artist_name ?? null, userId: user?.id ?? '' }
    : null
}

export default async function PlaybackPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const loaded = await load(projectId)
  if (!loaded) notFound()

  const { project, artist, userId } = loaded
  const rawTracks = project.tracks ?? []

  // Mint short-lived signed URLs for master, instrumental, and stems paths.
  // Raw storage paths are not playable/downloadable — signed URLs are required.
  // This mirrors the management page's createSignedUrls block verbatim.
  const signedByPath: Record<string, string> = {}
  if (!DEMO) {
    const paths = rawTracks
      .flatMap(t => [
        t.audio_file_url,
        readMasterAudio(t.metadata)?.path,
        readInstrumental(t.metadata)?.path,
        readStems(t.metadata)?.path,
      ])
      .filter((p): p is string => Boolean(p))

    if (paths.length > 0) {
      const service = createServiceClient()
      const { data: signed } = await service.storage
        .from(BUCKET)
        .createSignedUrls(paths, 60 * 60 * 2)
      for (const row of signed ?? []) {
        if (row.signedUrl && row.path) signedByPath[row.path] = row.signedUrl
      }
    }
  }

  const tracks = toTrackViews(rawTracks, signedByPath)
  const readinessScore = project.vault_readiness_score ?? 0
  const { label, tone } = readinessLabel(readinessScore)

  // Derive export pack manifest to know which artifacts exist (for the button gate + panel list).
  // buildExportManifest is pure (no I/O) — safe to call server-side here.
  // artist is already in scope from load() above.
  const exportManifest = !DEMO
    ? buildExportManifest(
        { title: project.title, artist_name: artist } as unknown as Parameters<typeof buildExportManifest>[0],
        rawTracks as Parameters<typeof buildExportManifest>[1]
      )
    : null

  // Artifact labels shown in the Export Pack panel's included list (only items that exist — D-08)
  const artifactLabels: string[] = []
  if (exportManifest) {
    if (exportManifest.files.some(f => f.kind === 'master')) artifactLabels.push('Master WAV')
    if (exportManifest.files.some(f => f.kind === 'share')) artifactLabels.push('Share MP3')
    if (exportManifest.files.some(f => f.kind === 'stems')) artifactLabels.push('Stems (ZIP)')
    if (exportManifest.files.some(f => f.kind === 'instrumental')) artifactLabels.push('Instrumental')
    artifactLabels.push('Credits & splits sheet (PDF)')
    artifactLabels.push('Metadata sheet (PDF)')
  }

  // Topbar readiness chip tone classes (D-02, placement 1)
  const chipClasses: Record<typeof tone, string> = {
    green: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400',
    amber: 'border-amber-400/40 bg-amber-400/10 text-amber-400',
    red: 'border-rose-400/40 bg-rose-400/10 text-rose-400',
  }

  return (
    <>
      <Topbar
        title={project.title}
        subtitle={`${artist ? `${artist} · ` : ''}Now playing — masters, credits & metadata`}
      >
        {/* Readiness chip (D-02, placement 1) — links to the management page */}
        <Link
          href={`/vault/${projectId}`}
          className={`inline-flex items-center gap-[7px] rounded-full border px-[11px] py-[5px] text-[12.5px] font-bold whitespace-nowrap transition hover:opacity-80 ${chipClasses[tone]}`}
        >
          <span className="h-[7px] w-[7px] rounded-full bg-current" />
          Readiness {readinessScore} · {label}
        </Link>
        {/* Export pack button (D-10) — rightmost topbar element, gated on master presence */}
        {!DEMO && exportManifest && (
          <ExportPackButton
            projectId={projectId}
            hasMaster={exportManifest.hasMaster}
            artifactLabels={artifactLabels}
          />
        )}
      </Topbar>
      <PlaybackView
        releaseTitle={project.title}
        artist={artist}
        coverUrl={project.cover_art_url}
        tracks={tracks}
        projectId={projectId}
        userId={userId}
        canManage={true}
        readinessScore={readinessScore}
      />
    </>
  )
}
