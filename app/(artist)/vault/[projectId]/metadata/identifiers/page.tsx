import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { DDEX_LEVELS, getIdentifiersForLevel, type DdexLevel } from '@/lib/metadata/identifier-guide'
import { IdentifierGuideCard, GenerateIdentifierButton } from '@/components/vault/IdentifierGuide'
import { canGenerate, type ArtistIdentifierProfile, type PlatformIdentifierState } from '@/lib/metadata/generate'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const LEVEL_LABELS: Record<DdexLevel, string> = {
  party: 'Party — you and your collaborators',
  work: 'Work — the composition',
  resource: 'Resource — the recording',
  release: 'Release — the product',
}

const GENERATABLE_ON_THIS_PAGE = new Set(['upc', 'grid', 'catalog_number'])

type Provenance = 'generated' | 'imported' | 'manual'

function asProvenance(v: string | undefined | null): Provenance | null {
  return v === 'generated' || v === 'imported' || v === 'manual' ? v : null
}

// ─── Page ────────────────────────────────────────────────────────────
// "What are all my codes and what do they mean" — every identifier
// Funūn covers, grouped by DDEX level (party → work → resource →
// release), each showing its explainer, assignment guidance, current
// value + provenance on THIS project where applicable, and a Generate
// action when the caller is eligible (16-11 Task 5).
export default async function IdentifiersPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  if (DEMO) redirect(`/vault/${projectId}/metadata`)

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  const { data: project } = await supabase
    .from('vault_projects')
    .select('id, title, upc, grid, catalog_number, identifier_sources')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) notFound()

  const { data: trackRows } = await supabase
    .from('tracks')
    .select('id, isrc, iswc')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
  const tracks = trackRows ?? []
  const isrcCount = tracks.filter(t => (t as { isrc: string | null }).isrc).length
  const iswcCount = tracks.filter(t => (t as { iswc: string | null }).iswc).length

  // ipi/isni/mlc_id/gs1_company_prefix/grid_issuer_code/catalog_number_prefix
  // are all PRIVATE columns (migration 040/082 doctrine) — read via the
  // service-role client, ownership already established via auth.getUser()
  // above (D-19 pattern).
  const service = createServiceClient()
  const { data: profile } = await service
    .from('user_profiles')
    .select('ipi, isni, mlc_id, gs1_company_prefix, grid_issuer_code, catalog_number_prefix')
    .eq('id', user.id)
    .maybeSingle()

  const { data: platformRow } = await service
    .from('platform_identifier_config')
    .select('grid_issuer_code, grid_release_counter')
    .eq('id', 1)
    .maybeSingle()

  const eligibilityProfile: ArtistIdentifierProfile = {
    gs1_company_prefix: profile?.gs1_company_prefix ?? null,
    grid_issuer_code: profile?.grid_issuer_code ?? null,
    catalog_number_prefix: profile?.catalog_number_prefix ?? null,
    isrc_country_code: null,
    isrc_registrant_code: null,
  }
  const platformState: PlatformIdentifierState = {
    grid_issuer_code: platformRow?.grid_issuer_code ?? null,
    grid_release_counter: Number(platformRow?.grid_release_counter ?? 0),
  }

  const eligibility: Record<string, ReturnType<typeof canGenerate>> = {
    upc: canGenerate('upc', eligibilityProfile, platformState),
    grid: canGenerate('grid', eligibilityProfile, platformState),
    catalog_number: canGenerate('catalog_number', eligibilityProfile, platformState),
  }

  const identifierSources = ((project as { identifier_sources?: Record<string, string> }).identifier_sources ?? {}) as Record<
    string,
    string
  >

  function summaryFor(id: string): { value: string | null; provenance: Provenance | null } {
    const projectRow = project as {
      upc: string | null
      grid: string | null
      catalog_number: string | null
    }
    switch (id) {
      case 'upc':
        return { value: projectRow.upc, provenance: asProvenance(identifierSources.upc) }
      case 'grid':
        return { value: projectRow.grid, provenance: asProvenance(identifierSources.grid) }
      case 'catalog_number':
        return { value: projectRow.catalog_number, provenance: asProvenance(identifierSources.catalog_number) }
      case 'ipi':
        return { value: profile?.ipi ?? null, provenance: null }
      case 'isni':
        return { value: profile?.isni ?? null, provenance: null }
      case 'mlc_id':
        return { value: profile?.mlc_id ?? null, provenance: null }
      case 'isrc':
        return { value: tracks.length > 0 ? `${isrcCount}/${tracks.length} tracks` : null, provenance: null }
      case 'iswc':
        return { value: tracks.length > 0 ? `${iswcCount}/${tracks.length} tracks` : null, provenance: null }
      default:
        return { value: null, provenance: null }
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href={`/vault/${projectId}/metadata`} className="text-sm text-white/50 transition hover:text-white">
          ← {project.title}
        </Link>
        <a
          href="/api/metadata/code-sheet"
          className="inline-flex items-center gap-2 rounded-[9px] border border-hair bg-card px-3 py-2 text-[13px] font-semibold text-lav transition hover:text-white"
          title="Downloads every track's identifiers across your WHOLE catalog, not just this release"
        >
          <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
          </svg>
          Code sheet — whole catalog ↓
        </a>
      </div>

      <div className="mt-6">
        <p className="text-xs uppercase tracking-wide text-white/40">{project.title}</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Identifiers guide</h1>
        <p className="mt-1 text-sm text-white/50">
          Every industry identifier Funūn tracks, what it is, and how to get one — grouped by
          where it lives in a DDEX release message.
        </p>
      </div>

      {DDEX_LEVELS.map(level => {
        const entries = getIdentifiersForLevel(level)
        if (entries.length === 0) return null
        return (
          <section key={level} className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">{LEVEL_LABELS[level]}</h2>
            <div className="mt-3 space-y-3">
              {entries.map(entry => {
                const { value, provenance } = summaryFor(entry.id)
                const entryEligibility = eligibility[entry.id]
                const canOfferGenerate = GENERATABLE_ON_THIS_PAGE.has(entry.id) && Boolean(entryEligibility?.eligible) && !value

                let actionSlot: React.ReactNode = undefined
                if (canOfferGenerate && entryEligibility?.eligible) {
                  actionSlot = (
                    <GenerateIdentifierButton
                      projectId={projectId}
                      scheme={entry.id as 'upc' | 'grid' | 'catalog_number'}
                      hint={
                        entryEligibility.source === 'platform'
                          ? "Will mint from Funūn's platform GRid issuer code."
                          : `Will mint from your prefix ${entryEligibility.usingPrefix}.`
                      }
                    />
                  )
                } else if (
                  GENERATABLE_ON_THIS_PAGE.has(entry.id) &&
                  !value &&
                  entryEligibility &&
                  !entryEligibility.eligible
                ) {
                  actionSlot = (
                    <Link href="/settings" className="text-xs font-medium text-indigo-300 transition hover:text-indigo-200">
                      Add your prefix in settings →
                    </Link>
                  )
                }

                return (
                  <IdentifierGuideCard
                    key={entry.id}
                    entry={entry}
                    currentValue={value}
                    provenance={provenance}
                    actionSlot={actionSlot}
                  />
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
