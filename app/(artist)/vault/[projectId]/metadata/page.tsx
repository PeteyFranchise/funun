import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getDemoProject } from '@/lib/vault/demo-store'
import { readComposers } from '@/lib/metadata/schema'
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

  if (DEMO) {
    project = (await getDemoProject(projectId)) as MetaProject | null
    artistName = 'Demo Artist'
  } else {
    const supabase = createServerClient()
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
    }))

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link href={`/vault/${projectId}`} className="text-sm text-white/50 transition hover:text-white">
        ← {project.title}
      </Link>
      <div className="mt-6">
        <MetadataStudio
          projectId={projectId}
          releaseTitle={project.title}
          releaseType={project.type}
          genre={project.genre}
          subGenre={project.sub_genre}
          coverArtUrl={project.cover_art_url}
          coverWidth={null}
          coverHeight={null}
          initialRelease={initialRelease}
          initialTracks={initialTracks}
        />
      </div>
    </div>
  )
}
