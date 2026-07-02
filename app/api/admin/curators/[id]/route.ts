import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { ADMIN_EDITABLE_FIELDS, PLATFORM_VALUES } from '@/lib/curators/schema'
import { fetchReachSignal } from '@/lib/curators/reach'
import { hasSignificantDrift } from '@/lib/curators/drift'
import { generateClaimToken, CLAIM_TOKEN_EXPIRY_HOURS } from '@/lib/curators/tokens'
import type { Curator, CuratorPlatform } from '@/types'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ─── PATCH /api/admin/curators/[id] ──────────────────────────────────────
// Updates allowlisted fields on a single curator. T-06-06: update object is
// built strictly from ADMIN_EDITABLE_FIELDS, never a spread of the body.
//
// Supports a distinct `resetBaseline` action (D-17/UI-SPEC "Reset baseline")
// that sets baseline_genre_focus = current genre_focus and clears
// drift_flagged, independent of any other field edit in the same request.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const service = createServiceClient()
  const { data: existing, error: fetchError } = await service
    .from('curators')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Curator not found' }, { status: 404 })

  const curator = existing as Curator
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  // Reset-baseline action — distinct from a regular field edit.
  if (body.resetBaseline === true) {
    const { data, error } = await service
      .from('curators')
      .update({ baseline_genre_focus: curator.genre_focus, drift_flagged: false })
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  // Claim-invite issuance action — distinct from a regular field edit and
  // from resetBaseline (06-05, PITCH-05). Sets a fresh 72h-expiry claim
  // token WITHOUT touching claimed_by — claiming itself only happens via
  // POST /api/curators/claim/[token]. Does not disturb any other 06-02
  // PATCH behavior (ADMIN_EDITABLE_FIELDS update, drift recompute, reach
  // refetch) below, since it returns early.
  if (body.action === 'issue_claim') {
    const token = generateClaimToken()
    const expiresAt = new Date(Date.now() + CLAIM_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString()
    const { data, error } = await service
      .from('curators')
      .update({ claim_token: token, claim_token_expires_at: expiresAt })
      .eq('id', id)
      .select()
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Curator not found' }, { status: 404 })
    return NextResponse.json({ data, claimUrl: `/curators/claim/${token}` })
  }

  // Build update strictly from ADMIN_EDITABLE_FIELDS (mass-assignment protection)
  const update: Record<string, unknown> = {}

  for (const field of ADMIN_EDITABLE_FIELDS) {
    if (!(field in body)) continue

    if (field === 'name') {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
      update.name = name
      continue
    }

    if (field === 'email') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      if (!email || !EMAIL_REGEX.test(email)) {
        return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
      }
      update.email = email
      continue
    }

    if (field === 'platform') {
      const platform = typeof body.platform === 'string' ? body.platform : ''
      if (!PLATFORM_VALUES.includes(platform as (typeof PLATFORM_VALUES)[number])) {
        return NextResponse.json(
          { error: `platform must be one of: ${PLATFORM_VALUES.join(', ')}` },
          { status: 400 }
        )
      }
      update.platform = platform
      continue
    }

    if (field === 'genre_focus') {
      const genreFocus = Array.isArray(body.genre_focus)
        ? body.genre_focus.map(t => String(t).trim()).filter(Boolean)
        : []
      update.genre_focus = genreFocus
      // D-16: recompute drift flag whenever genre_focus changes
      update.drift_flagged = hasSignificantDrift(curator.baseline_genre_focus, genreFocus)
      continue
    }

    if (field === 'flagged_inactive') {
      update.flagged_inactive = Boolean(body.flagged_inactive)
      continue
    }

    if (field === 'playlist_name' || field === 'playlist_url' || field === 'submission_notes') {
      update[field] = body[field] != null ? String(body[field]).trim() || null : null
      continue
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Re-fetch reach signal if platform or playlist_url changed
  const nextPlatform = (update.platform as CuratorPlatform | undefined) ?? curator.platform
  const nextPlaylistUrl =
    'playlist_url' in update ? (update.playlist_url as string | null) : curator.playlist_url
  if ('platform' in update || 'playlist_url' in update) {
    const reach = await fetchReachSignal(nextPlatform, nextPlaylistUrl)
    if (reach !== null) {
      update.reach_signal = reach
      update.reach_fetched_at = new Date().toISOString()
    }
  }

  const { data, error } = await service
    .from('curators')
    .update(update)
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A curator with this email already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Curator not found' }, { status: 404 })

  return NextResponse.json({ data })
}

// ─── DELETE /api/admin/curators/[id] ─────────────────────────────────────
// Hard-deletes a curator. pitch_history rows cascade via ON DELETE CASCADE
// (migration 030) — per UI-SPEC copy this is described to the admin as "does
// not affect existing pitch history" from the artist's perspective (the
// pitch_history rows for this curator are removed, but the artist's other
// pitch history and project state are unaffected).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const service = createServiceClient()
  const { data, error } = await service.from('curators').delete().eq('id', id).select('id').maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Curator not found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
