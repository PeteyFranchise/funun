import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { getDemoProject } from '@/lib/vault/demo-store'
import { readComposers, readLyrics, readPerformers, readRecordingInfo, readDescriptors } from '@/lib/metadata/schema'
import { MetadataStudio } from '@/components/vault/MetadataStudio'
import { canGenerate, type ArtistIdentifierProfile, type PlatformIdentifierState } from '@/lib/metadata/generate'
import type { IdentifierEligibilityMap } from '@/components/vault/MetadataStudio'

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
  grid?: string | null
  catalog_number?: string | null
  identifier_sources?: Record<string, string> | null
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
  let coverWidth: number | null = null
  let coverHeight: number | null = null
  // Eligibility for the self-assignable/platform-issued release-level
  // generators (16-11 Task 4b/5) — computed server-side against PRIVATE
  // profile columns + the service-role-only platform config, never trusted
  // from the client. Demo mode has no real profile/platform state.
  const NOT_AVAILABLE_IN_DEMO = { eligible: false as const, reason: 'Not available in demo mode.' }
  let identifierEligibility: IdentifierEligibilityMap = {
    upc: NOT_AVAILABLE_IN_DEMO,
    grid: NOT_AVAILABLE_IN_DEMO,
    catalog_number: NOT_AVAILABLE_IN_DEMO,
  }

  if (DEMO) {
    project = (await getDemoProject(projectId)) as MetaProject | null
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
        grid, catalog_number, identifier_sources,
        tracks (id, title, track_number, isrc, iswc, language, audio_file_url, metadata)
      `
      )
      .eq('id', projectId)
      .eq('user_id', user?.id ?? '')
      .maybeSingle()

    project = (data as MetaProject | null) ?? null

    if (project && user) {
      // gs1_company_prefix/grid_issuer_code/catalog_number_prefix are
      // PRIVATE columns (migration 040/082 doctrine) — read via the
      // service-role client, ownership already established via
      // auth.getUser() above (D-19 pattern). platform_identifier_config is
      // service-role-only entirely (migration 082).
      const service = createServiceClient()
      const [{ data: prefixRow }, { data: platformRow }] = await Promise.all([
        service
          .from('user_profiles')
          .select('gs1_company_prefix, grid_issuer_code, catalog_number_prefix')
          .eq('id', user.id)
          .maybeSingle(),
        service.from('platform_identifier_config').select('grid_issuer_code, grid_release_counter').eq('id', 1).maybeSingle(),
      ])

      const eligibilityProfile: ArtistIdentifierProfile = {
        gs1_company_prefix: prefixRow?.gs1_company_prefix ?? null,
        grid_issuer_code: prefixRow?.grid_issuer_code ?? null,
        catalog_number_prefix: prefixRow?.catalog_number_prefix ?? null,
        isrc_country_code: null,
        isrc_registrant_code: null,
      }
      const eligibilityPlatform: PlatformIdentifierState = {
        grid_issuer_code: platformRow?.grid_issuer_code ?? null,
        grid_release_counter: Number(platformRow?.grid_release_counter ?? 0),
      }

      identifierEligibility = {
        upc: canGenerate('upc', eligibilityProfile, eligibilityPlatform),
        grid: canGenerate('grid', eligibilityProfile, eligibilityPlatform),
        catalog_number: canGenerate('catalog_number', eligibilityProfile, eligibilityPlatform),
      }

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
    grid: str(project.grid),
    catalog_number: str(project.catalog_number),
  }

  const identifierSources: Record<string, string> = project.identifier_sources ?? {}

  const initialTracks = [...(project.tracks ?? [])]
    .sort((a, b) => (a.track_number ?? 0) - (b.track_number ?? 0))
    .map(t => {
      const descriptors = readDescriptors(t.metadata)
      return {
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
        descriptorMoods: descriptors?.moods ?? [],
        descriptorEnergy: descriptors?.energy ?? '',
        descriptorVocal: descriptors?.vocal ?? '',
      }
    })

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
          coverArtUrl={project.cover_art_url}
          coverWidth={coverWidth}
          coverHeight={coverHeight}
          initialRelease={initialRelease}
          initialTracks={initialTracks}
          identifierEligibility={identifierEligibility}
          identifierSources={identifierSources}
        />
      </div>
    </div>
  )
}
