import type { SupabaseClient } from '@supabase/supabase-js'
import type { Selects, SelectsTrack } from './types'

// ─── Public, unauthenticated Selects resolution (31-13) ────────────────────
// The SINGLE authority every public /selects/[token] surface calls before
// touching Selects data — the SSR page, the OpenGraph image route, and the
// react/respond/download API routes. Resolves ONLY by selects.share_token
// via a service-role client (RLS bypassed deliberately — the unguessable
// token IS the authorization, crate-lead-engine-BUILD-SPEC.md §4). There is
// NO id-addressable variant anywhere in this module or its callers (R11/R12
// — no id-enumerable path).
//
// Fails closed (null) for: no matching token, AND a still-'draft' Selects.
// A draft has never been sent — its token exists (DEFAULT at insert time,
// migration 111) but nobody outside the AE has ever been handed it, and it
// mirrors migration 111's buyer-readable RLS arm EXACTLY (which excludes
// 'draft' from the buyer SELECT policy) — so the public surface and the
// authenticated-buyer RLS surface never disagree about what "reachable"
// means for a Selects.

// Deliberately the SAME column list migration 111 already ships live with —
// NOT migration 113's changes_requested_reason. That column is human-gated
// (owner runs `supabase db push`) and nothing in the public read path may
// depend on it existing: selecting an as-yet-unpushed column would turn
// EVERY /selects/[token] resolution into a hard PostgREST error until the
// owner applies 113, breaking the whole player. The respond route writes
// that column through a separate, isolated, best-effort UPDATE instead
// (never a SELECT here) — see app/api/selects/[token]/respond/route.ts.
const SELECTS_COLUMNS =
  'id, buyer_org_id, created_by, brief_id, name, cover_note, share_token, status, download_enabled, download_max_seconds, created_at, updated_at, sent_at'

const SELECTS_TRACK_COLUMNS =
  'id, selects_id, track_id, note, position, added_by, source, removed_at, removed_by, created_at'

/**
 * Resolves a Selects row by its share_token. Never derive this lookup from
 * selects.id — grep for "share_token" is this module's contract check.
 */
export async function resolveSelectsByToken(service: SupabaseClient, token: string): Promise<Selects | null> {
  if (!token || token.trim().length < 8) return null // cheap guard, never a real token this short
  const { data } = await service.from('selects').select(SELECTS_COLUMNS).eq('share_token', token).maybeSingle()
  if (!data) return null

  const selects = data as Selects
  if (selects.status === 'draft') return null // never publicly reachable — see module header
  return selects
}

/** Non-removed selects_tracks for a Selects, ordered for display. */
export async function loadPublicSelectsTracks(
  service: SupabaseClient,
  selectsId: string
): Promise<SelectsTrack[]> {
  const { data } = await service
    .from('selects_tracks')
    .select(SELECTS_TRACK_COLUMNS)
    .eq('selects_id', selectsId)
    .is('removed_at', null)
    .order('position', { ascending: true })
  return (data ?? []) as SelectsTrack[]
}

/**
 * Scoped, TOCTOU-safe lookup of a single selects_tracks row that MUST
 * belong to `selectsId` — every mutation route (react/download) calls this
 * rather than trusting a bare trackRowId from the request body, so a caller
 * cannot act on a row belonging to a DIFFERENT Selects by guessing/reusing
 * an id (mirrors lib/selects/persistence.ts's removeSelectsTrack scoping).
 */
export async function loadOwnSelectsTrack(
  service: SupabaseClient,
  selectsId: string,
  selectsTrackId: string
): Promise<SelectsTrack | null> {
  const { data } = await service
    .from('selects_tracks')
    .select(SELECTS_TRACK_COLUMNS)
    .eq('id', selectsTrackId)
    .eq('selects_id', selectsId)
    .is('removed_at', null)
    .maybeSingle()
  return (data as SelectsTrack | null) ?? null
}

export { SELECTS_COLUMNS, SELECTS_TRACK_COLUMNS }
