import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import {
  generateIdentifier,
  type ArtistIdentifierProfile,
  type ArtistIdentifierCounters,
  type PlatformIdentifierState,
} from '@/lib/metadata/generate'
import { GENERATABLE_SCHEME_IDS } from '@/lib/metadata/identifier-guide'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// Project-level schemes write directly onto this vault_projects column.
const PROJECT_SCHEME_COLUMNS: Record<string, 'grid' | 'upc' | 'catalog_number'> = {
  grid: 'grid',
  upc: 'upc',
  catalog_number: 'catalog_number',
}

// POST /api/metadata/generate-identifier
// Mints the next code for a scheme (grid, upc, catalog_number, isrc)
// against a project (or track, for isrc) the caller owns. Eligibility is
// re-run server-side inside generateIdentifier() against the caller's OWN
// profile + the platform config — a client-supplied eligibility result is
// never trusted (T-16-11-5). Scope is strictly the caller's own
// project/track; the platform GRid counter is shared infrastructure the
// caller advances but does not own (T-16-11-9).
export async function POST(request: Request) {
  if (DEMO) {
    return NextResponse.json(
      { error: 'Identifier generation is not available in demo mode' },
      { status: 400 }
    )
  }

  const body = (await request.json().catch(() => null)) as
    | { scheme?: unknown; projectId?: unknown; trackId?: unknown }
    | null
  const scheme = typeof body?.scheme === 'string' ? body.scheme : ''
  const projectId = typeof body?.projectId === 'string' ? body.projectId : ''
  const trackId = typeof body?.trackId === 'string' ? body.trackId : null

  if (!(GENERATABLE_SCHEME_IDS as readonly string[]).includes(scheme)) {
    return NextResponse.json({ error: 'Unsupported or non-generatable identifier scheme.' }, { status: 400 })
  }
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
  }
  if (scheme === 'isrc' && !trackId) {
    return NextResponse.json({ error: 'trackId is required for isrc.' }, { status: 400 })
  }

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Ownership: project must belong to the caller. No column-level
  // privilege restriction is in force on vault_projects (migration 082
  // header), so the session-bound client is safe to read/write it.
  const { data: project } = await supabase
    .from('vault_projects')
    .select('id, grid, upc, catalog_number, identifier_sources')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  type TrackRow = { id: string; isrc: string | null; metadata: Record<string, unknown> | null }
  let track: TrackRow | null = null
  if (scheme === 'isrc') {
    const { data: trackRow } = await supabase
      .from('tracks')
      .select('id, isrc, metadata')
      .eq('id', trackId as string)
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!trackRow) return NextResponse.json({ error: 'Track not found' }, { status: 404 })
    track = trackRow as unknown as TrackRow
  }

  const projectRow = project as unknown as {
    id: string
    grid: string | null
    upc: string | null
    catalog_number: string | null
    identifier_sources: Record<string, string> | null
  }

  const existingValue =
    scheme === 'isrc'
      ? (track?.isrc ?? null)
      : (projectRow[PROJECT_SCHEME_COLUMNS[scheme as keyof typeof PROJECT_SCHEME_COLUMNS]] ?? null)

  // gs1_company_prefix, grid_issuer_code, catalog_number_prefix,
  // identifier_counters, isrc_country_code, isrc_registrant_code,
  // isrc_year_counters are all PRIVATE columns (migration 040/082
  // doctrine) — read via the service-role client; ownership is already
  // confirmed above via the session-bound project/track lookups (D-19).
  const service = createServiceClient()
  const { data: profileRow } = await service
    .from('user_profiles')
    .select(
      'gs1_company_prefix, grid_issuer_code, catalog_number_prefix, identifier_counters, isrc_country_code, isrc_registrant_code, isrc_year_counters'
    )
    .eq('id', user.id)
    .maybeSingle()

  const profile: ArtistIdentifierProfile = {
    gs1_company_prefix: profileRow?.gs1_company_prefix ?? null,
    grid_issuer_code: profileRow?.grid_issuer_code ?? null,
    catalog_number_prefix: profileRow?.catalog_number_prefix ?? null,
    isrc_country_code: profileRow?.isrc_country_code ?? null,
    isrc_registrant_code: profileRow?.isrc_registrant_code ?? null,
  }
  const artistCounters: ArtistIdentifierCounters = {
    identifier_counters: (profileRow?.identifier_counters as Record<string, number>) ?? {},
    isrc_year_counters: (profileRow?.isrc_year_counters as Record<string, number>) ?? {},
  }

  // Single-row platform config (migration 082) — service_role-only.
  const { data: platformRow } = await service
    .from('platform_identifier_config')
    .select('grid_issuer_code, grid_release_counter')
    .eq('id', 1)
    .maybeSingle()
  const platformState: PlatformIdentifierState = {
    grid_issuer_code: platformRow?.grid_issuer_code ?? null,
    grid_release_counter: Number(platformRow?.grid_release_counter ?? 0),
  }

  const result = generateIdentifier(scheme, profile, artistCounters, platformState, existingValue)
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 })
  }

  // ── Persist. The counter increment and the value write are SEPARATE,
  // non-transactional operations, so a concurrent mint for the same artist can
  // read the same counter and compute the same value. The partial unique
  // indexes (migration 122) are the backstop: the second value-write fails with
  // 23505 and we return a retryable 409 below; the counter is already advanced,
  // so the retry mints a fresh value (no duplicate, no gap). The platform GRid
  // path additionally uses the optimistic CAS above.
  if (result.source === 'platform') {
    // Atomic, optimistically-locked increment on the SHARED global
    // counter (T-16-11-9): the WHERE clause matches the counter value we
    // just read, so a concurrent mint (another artist, or a double-click
    // racing this same request) cannot silently lose an update. Zero
    // rows affected means someone else advanced the counter first — fail
    // closed rather than risk reusing a release number.
    const { data: casRows, error: casError } = await service
      .from('platform_identifier_config')
      .update({ grid_release_counter: result.nextPlatformState.grid_release_counter })
      .eq('id', 1)
      .eq('grid_release_counter', platformState.grid_release_counter)
      .select('id')
    if (casError || !casRows || casRows.length === 0) {
      return NextResponse.json(
        { error: 'The platform GRid counter changed concurrently — please try again.' },
        { status: 409 }
      )
    }
  } else if (scheme === 'isrc') {
    const { error: counterErr } = await service
      .from('user_profiles')
      .update({ isrc_year_counters: result.nextArtistCounters.isrc_year_counters })
      .eq('id', user.id)
    if (counterErr) {
      return NextResponse.json({ error: 'Could not reserve the identifier number.' }, { status: 500 })
    }
  } else {
    const { error: counterErr } = await service
      .from('user_profiles')
      .update({ identifier_counters: result.nextArtistCounters.identifier_counters })
      .eq('id', user.id)
    if (counterErr) {
      return NextResponse.json({ error: 'Could not reserve the identifier number.' }, { status: 500 })
    }
  }

  // Write the minted value + provenance ('generated' — T-16-11-8) to the target.
  if (scheme === 'isrc') {
    const existingSources =
      ((track?.metadata as Record<string, unknown> | null)?.identifier_sources as
        | Record<string, string>
        | undefined) ?? {}
    const nextMetadata = {
      ...(track?.metadata ?? {}),
      identifier_sources: { ...existingSources, isrc: 'generated' },
    }
    const { error: trackErr } = await supabase
      .from('tracks')
      .update({ isrc: result.value, metadata: nextMetadata })
      .eq('id', trackId as string)
      .eq('user_id', user.id)
    if (trackErr) {
      // 23505 = the partial unique index on tracks.isrc (migration 122) rejected
      // a duplicate — a concurrent mint took this value first. The counter is
      // already advanced, so a retry mints a fresh ISRC. Surface as retryable.
      if (trackErr.code === '23505') {
        return NextResponse.json(
          { error: 'That identifier was just taken — please try again.' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: 'Could not save the identifier to the track.' }, { status: 500 })
    }
  } else {
    const column = PROJECT_SCHEME_COLUMNS[scheme as keyof typeof PROJECT_SCHEME_COLUMNS]
    const nextSources = { ...(projectRow.identifier_sources ?? {}), [scheme]: 'generated' }
    const { error: projectErr } = await supabase
      .from('vault_projects')
      .update({ [column]: result.value, identifier_sources: nextSources })
      .eq('id', projectId)
      .eq('user_id', user.id)
    if (projectErr) {
      // 23505 = a partial unique index (migration 122) rejected a duplicate
      // upc/grid, or a per-artist duplicate catalog_number — a concurrent mint
      // won. The counter is already advanced, so a retry mints a fresh value.
      if (projectErr.code === '23505') {
        return NextResponse.json(
          { error: 'That identifier was just taken — please try again.' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: 'Could not save the identifier to the project.' }, { status: 500 })
    }
  }

  return NextResponse.json({ data: { value: result.value, source: result.source } })
}
