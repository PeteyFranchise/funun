import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { resolveSelectsByToken, loadOwnSelectsTrack } from '@/lib/selects/public-resolve'
import { SELECTS_REACTION_VALUES } from '@/lib/selects/types'
import { isSelectsReactionCapError } from '@/lib/selects/reaction-cap'

// ─── POST /api/selects/[token]/react — per-track reaction, no login (R12) ──
// Public, token-gated, no requireStaff/buyer-auth REQUIRED — play/keep/pass
// is open to everyone with no login (must_haves truth). Resolves the
// Selects ONLY via share_token (resolveSelectsByToken — never an id path),
// then scopes the target row to THIS Selects (loadOwnSelectsTrack) so a
// caller cannot react against a track belonging to a different Selects by
// guessing a selectsTrackId.
//
// Attribution (R13 — never guess a named contact for an anonymous/forwarded
// reaction): reacted_by is set ONLY when the caller is authenticated AND a
// buyer_members row ties them to THIS Selects' own buyer_org_id — a
// Client Partner from a DIFFERENT org (or no session at all) is a guest,
// attributed to viewerKey (a random id the player mints client-side and
// persists in a cookie — link/session attribution, never fingerprinting,
// mirrors [[project_guest_lead_identification]]'s consent-first posture).
const ReactBodySchema = z
  .object({
    selectsTrackId: z.string().uuid(),
    reaction: z.union([z.enum(SELECTS_REACTION_VALUES), z.null()]),
    viewerKey: z.string().trim().min(8).max(200).optional(),
  })
  .strict()

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceClient()

  const selects = await resolveSelectsByToken(service, token)
  if (!selects) {
    return NextResponse.json({ error: "This link isn't live." }, { status: 404 })
  }

  // Rate-limit reactions per (token+ip) and per token so a leaked share link
  // can't be flooded with rotating viewer keys (audit #6). Caps are generous —
  // a legit viewer reacts across a curated Selects' handful of tracks; a DB-side
  // per-track cap (migration 117) backstops distributed abuse.
  const ip = getClientIp(request)
  if (
    (await checkRateLimit(`selects-react:${token}:${ip}`, { maxAttempts: 60 })) ||
    (await checkRateLimit(`selects-react:${token}`, { maxAttempts: 300 }))
  ) {
    return NextResponse.json({ error: 'Too many reactions — please slow down.' }, { status: 429 })
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const parsed = ReactBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  }

  const track = await loadOwnSelectsTrack(service, selects.id, parsed.data.selectsTrackId)
  if (!track) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Resolve attribution — an authenticated caller who is a member of THIS
  // Selects' own org is a "known org member" (R13); everyone else is a
  // guest, attributed only to viewerKey.
  let reactedBy: string | null = null
  try {
    const apiClient = await createApiClient()
    const {
      data: { user },
    } = await apiClient.auth.getUser()
    if (user) {
      const { data: member } = await service
        .from('buyer_members')
        .select('user_id')
        .eq('user_id', user.id)
        .eq('org_id', selects.buyer_org_id)
        .maybeSingle()
      if (member) reactedBy = user.id
    }
  } catch {
    // Session resolution failure degrades to guest attribution — never a
    // 500 just because we couldn't confirm who the caller is.
  }

  if (!reactedBy && !parsed.data.viewerKey) {
    return NextResponse.json({ error: 'viewerKey is required for a guest reaction.' }, { status: 400 })
  }

  const matchColumn = reactedBy ? { reacted_by: reactedBy } : { viewer_key: parsed.data.viewerKey! }

  const { data: existing } = await service
    .from('selects_reactions')
    .select('id')
    .eq('selects_track_id', track.id)
    .match(matchColumn)
    .maybeSingle()

  if (parsed.data.reaction === null) {
    if (existing) {
      const { error } = await service.from('selects_reactions').delete().eq('id', (existing as { id: string }).id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data: { reaction: null } })
  }

  if (existing) {
    const { error } = await service
      .from('selects_reactions')
      .update({ reaction: parsed.data.reaction })
      .eq('id', (existing as { id: string }).id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await service.from('selects_reactions').insert({
      selects_track_id: track.id,
      reaction: parsed.data.reaction,
      ...matchColumn,
    })
    if (isSelectsReactionCapError(error)) {
      return NextResponse.json(
        { error: 'This track has reached its reaction limit.' },
        { status: 409 }
      )
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { reaction: parsed.data.reaction } })
}
