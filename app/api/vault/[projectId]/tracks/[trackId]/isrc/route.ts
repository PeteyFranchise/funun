import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import {
  currentIsrcYear,
  formatIsrc,
  isValidCountry,
  isValidRegistrant,
  nextDesignation,
} from '@/lib/metadata/identifiers'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// POST /api/vault/[projectId]/tracks/[trackId]/isrc
// Mints the next ISRC under the artist's own registrant code, assigns it to
// the track, and advances the per-year designation counter. Requires the
// artist to have set their registrant code + country in Settings first.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; trackId: string }> }
) {
  const { projectId, trackId } = await params

  if (DEMO) {
    return NextResponse.json(
      { error: 'ISRC generation is not available in demo mode' },
      { status: 400 }
    )
  }

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Confirm the track belongs to this user/project before touching it.
  const { data: track } = await supabase
    .from('tracks')
    .select('id, isrc')
    .eq('id', trackId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

  if ((track as { isrc: string | null }).isrc) {
    return NextResponse.json(
      { error: 'This track already has an ISRC. Clear it first to mint a new one.' },
      { status: 409 }
    )
  }

  // isrc_country_code, isrc_registrant_code, isrc_year_counters are PRIVATE
  // columns (no authenticated SELECT grant under migration 040). Ownership
  // is established above (track scoped to user.id), so the read runs via
  // the service-role client (D-19 pattern).
  const service = createServiceClient()
  const { data: profile } = await service
    .from('artist_profiles')
    .select('isrc_country_code, isrc_registrant_code, isrc_year_counters')
    .eq('id', user.id)
    .maybeSingle()

  const country = profile?.isrc_country_code ?? ''
  const registrant = profile?.isrc_registrant_code ?? ''
  if (!isValidCountry(country) || !isValidRegistrant(registrant)) {
    return NextResponse.json(
      {
        error:
          'Set your ISRC country and registrant code in Settings before generating ISRCs.',
        needsSetup: true,
      },
      { status: 400 }
    )
  }

  const counters = (profile?.isrc_year_counters ?? {}) as Record<string, number>
  const year = currentIsrcYear()
  const designation = nextDesignation(counters, year)
  if (designation == null) {
    return NextResponse.json(
      { error: `You've issued all 99,999 ISRCs for 20${year}. Wait for the next year.` },
      { status: 409 }
    )
  }

  const isrc = formatIsrc(country, registrant, year, designation)

  // Advance the counter, then assign the code. If the track update fails we
  // don't roll back the counter — a skipped number is harmless (codes need
  // only be unique, not contiguous).
  const nextCounters = { ...counters, [year]: designation }
  // isrc_year_counters has no authenticated UPDATE grant (migration 040);
  // the service client write is safe because ownership is already confirmed.
  const { error: counterErr } = await service
    .from('artist_profiles')
    .update({ isrc_year_counters: nextCounters })
    .eq('id', user.id)
  if (counterErr) {
    return NextResponse.json({ error: 'Could not reserve the ISRC number.' }, { status: 500 })
  }

  const { error: trackErr } = await supabase
    .from('tracks')
    .update({ isrc })
    .eq('id', trackId)
    .eq('user_id', user.id)
  if (trackErr) {
    return NextResponse.json({ error: 'Could not save the ISRC to the track.' }, { status: 500 })
  }

  return NextResponse.json({ data: { isrc } })
}
