import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getDemoProject } from '@/lib/vault/demo-store'
import { readComposers, readLyrics, readPerformers, readRecordingInfo } from '@/lib/metadata/schema'
import { MetadataStudio } from '@/components/vault/MetadataStudio'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// Loose shape covering both the live Supabase row and the demo store. The
// metadata columns (migration 006) may be absent in demo data — default null.
type MetaProject = {
  id: string
  title: string
  type: string
  genre: string | null
  sub_genre: string | null
  cover_art_url: string | null
  upc?: string | null
  label?: string | null
  publisher?: string | null
  c_line?: string | null
  p_line?: string | null
  copyright_year?: number | null
  primary_language?: string | null
  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  tracks: {
    id: string
    title?: string | null
    track_number?: number | null
    isrc?: string | null
    iswc?: string | null
    language?: string | null
    audio_file_url?: string | null
    metadata?: Record<string, unknown> | null
  }[]
}

const str = (v: unknown): string => (v == null ? '' : String(v))

export default async function MetadataPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  let project: MetaProject | null = null
  let artistName = ''
  let coverWidth: number | null = null
  let coverHeight: number | null = null

  if (DEMO) {
    project = (await getDemoProject(projectId)) as MetaProject | null
    artistName = 'Demo Artist'
  } else {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data } = await supabase
      .from('vault_projects')
      .select(
        `
        id, title, type, genre, sub_genre, cover_art_url,
        upc, label, publisher, c_line, p_line, copyright_year,
        primary_language, contact_name, contact_email, contact_phone,
        tracks (id, title, track_number, isrc, iswc, language, audio_file_url, metadata)
      `
      )
      .eq('id', projectId)
      .eq('user_id', user?.id ?? '')
      .maybeSingle()

    project = (data as MetaProject | null) ?? null

    if (project && user) {
      const { data: profile } = await supabase
        .from('artist_profiles')
        .select('artist_name')
        .eq('id', user.id)
        .maybeSingle()
      artistName = profile?.artist_name ?? ''

      // Cover-art dimensions (captured on upload) so the 3000² check can verify.
      const { data: cover } = await supabase
        .from('vault_assets')
        .select('width, height')
        .eq('project_id', projectId)
        .eq('type', 'cover_art')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      coverWidth = (cover?.width as number | null) ?? null
      coverHeight = (cover?.height as number | null) ?? null
    }
  }

  if (!project) notFound()

  const initialRelease = {
    upc: str(project.upc),
    label: str(project.label),
    publisher: str(project.publisher),
    c_line: str(project.c_line),
    p_line: str(project.p_line),
    copyright_year: project.copyright_year != null ? String(project.copyright_year) : '',
    primary_language: str(project.primary_language),
    contact_name: str(project.contact_name),
    contact_email: str(project.contact_email),
    contact_phone: str(project.contact_phone),
  }

  const initialTracks = [...(project.tracks ?? [])]
    .sort((a, b) => (a.track_number ?? 0) - (b.track_number ?? 0))
    .map(t => ({
      id: t.id,
      title: t.title ?? 'Untitled track',
      track_number: t.track_number ?? null,
      isrc: str(t.isrc),
      iswc: str(t.iswc),
      language: str(t.language),
      audio_file_url: t.audio_file_url ?? null,
      composers: readComposers(t.metadata),
      lyrics: readLyrics(t.metadata)?.text ?? '',
      lyricsExplicit: readLyrics(t.metadata)?.explicit ?? false,
      performers: readPerformers(t.metadata),
      recordingDate: readRecordingInfo(t.metadata)?.recordingDate ?? '',
      recordingCountry: readRecordingInfo(t.metadata)?.recordingCountry ?? '',
      originalPurpose: readRecordingInfo(t.metadata)?.originalPurpose ?? '',
      commerciallyAvailable: readRecordingInfo(t.metadata)?.commerciallyAvailable ?? false,
    }))

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/vault/${projectId}`} className="text-sm text-white/50 transition hover:text-white">
          ← {project.title}
        </Link>
        <a
          href={`/api/vault/${projectId}/lyrics`}
          className="inline-flex items-center gap-2 rounded-[9px] border border-hair bg-card px-3 py-2 text-[13px] font-semibold text-lav transition hover:text-white"
          title="Download all lyrics as a plain-text file for collaborators, press, and promo"
        >
          <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
          </svg>
          Lyrics (.txt)
        </a>
      </div>
      <div className="mt-6">
        <MetadataStudio
          projectId={projectId}
          releaseTitle={project.title}
          releaseType={project.type}
          genre={project.genre}
          subGenre={project.sub_genre}
          coverArtUrl={project.cover_art_url}
          coverWidth={coverWidth}
          coverHeight={coverHeight}
          initialRelease={initialRelease}
          initialTracks={initialTracks}
        />
      </div>
    </div>
  )
}
