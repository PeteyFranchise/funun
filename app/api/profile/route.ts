import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ArtistProfile } from '@/types'
import { normalizeCountry, normalizeRegistrant } from '@/lib/metadata/identifiers'
import { ALL_INDUSTRY_ROLE_SLUGS } from '@/lib/industry-roles'
import { ALL_GENRE_SLUGS } from '@/lib/genres'
import { sanitizeProfileRoles, filterOpenTo, isFeaturableProjectRow } from '@/lib/profile/validate'

// Mass-assignment allowlist. Deliberately EXCLUDES `verified`, `verified_at`,
// `verified_by` (SAFETY-03 — admin-only, see app/api/admin/verification/
// [id]/route.ts) and `profile_visibility`/`open_to_visibility` (SAFETY-04 —
// owner-writable, but only via the dedicated app/api/profile/visibility
// route per migration 058's no-authenticated-UPDATE-grant design). Any of
// these keys present in a PATCH body here are silently ignored — the loop
// below only ever reads keys that are IN this array.
const EDITABLE_FIELDS = [
  'artist_name',
  'genre',
  'location',
  'bio',
  'instagram_handle',
  'threads_handle',
  'tiktok_handle',
  'spotify_url',
  'career_stage',
  'monthly_listeners',
  'isrc_country_code',
  'isrc_registrant_code',
  'pro',
  'ipi',
  'publisher',
  'mlc_id',
  'soundexchange_id',
  'legal_first_name',
  'legal_middle_name',
  'legal_last_name',
  'legal_name_suffix',
  'contact_phone',
  'mailing_address',
  'industry_roles',
  'genres',
  'pronouns',
  'roles',
  'open_to',
  'avatar_url',
  'banner_url',
  'featured_project_id',
  'allow_resharing',
] as const

type SanitizeResult =
  | { update: Partial<ArtistProfile> }
  | { error: string; status: number }

async function sanitize(
  body: Record<string, unknown>,
  service: SupabaseClient,
  userId: string
): Promise<SanitizeResult> {
  const update: Record<string, unknown> = {}
  for (const key of EDITABLE_FIELDS) {
    if (!(key in body)) continue
    const value = body[key]

    if (key === 'career_stage') {
      const n = Number(value)
      if (n >= 1 && n <= 4) update[key] = n
      continue
    }
    if (key === 'monthly_listeners') {
      if (value === null || value === '') {
        update[key] = null
      } else {
        const n = Number(value)
        if (Number.isFinite(n) && n >= 0) update[key] = Math.round(n)
      }
      continue
    }
    if (key === 'isrc_country_code') {
      const cc = normalizeCountry(typeof value === 'string' ? value : '')
      update[key] = cc || null
      continue
    }
    if (key === 'isrc_registrant_code') {
      const reg = normalizeRegistrant(typeof value === 'string' ? value : '')
      update[key] = reg || null
      continue
    }
    if (key === 'mailing_address') {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        update[key] = value
      } else if (value === null) {
        update[key] = null
      }
      continue
    }
    if (key === 'industry_roles') {
      if (Array.isArray(value)) {
        update[key] = (value as unknown[])
          .filter((s): s is string => typeof s === 'string' && ALL_INDUSTRY_ROLE_SLUGS.includes(s))
      }
      continue
    }
    if (key === 'genres') {
      if (Array.isArray(value)) {
        update[key] = (value as unknown[])
          .filter((s): s is string => typeof s === 'string' && ALL_GENRE_SLUGS.includes(s))
      }
      continue
    }
    if (key === 'roles') {
      update[key] = sanitizeProfileRoles(value)
      continue
    }
    if (key === 'open_to') {
      update[key] = filterOpenTo(value)
      continue
    }
    if (key === 'allow_resharing') {
      if (typeof value === 'boolean') update[key] = value
      continue
    }
    if (key === 'featured_project_id') {
      if (value === null) {
        update[key] = null
        continue
      }
      const { data: proj } = await service
        .from('vault_projects')
        .select('id, user_id, is_public')
        .eq('id', value as string)
        .maybeSingle()
      const check = isFeaturableProjectRow(
        proj as { id: string; user_id: string; is_public: boolean } | null,
        userId
      )
      if (check === 'not-found') return { error: 'Release not found', status: 404 }
      if (check === 'rejected-not-public') {
        return {
          error: 'Only public releases can be featured — publish it first.',
          status: 400,
        }
      }
      update[key] = value
      continue
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      update[key] = trimmed === '' ? null : trimmed
    } else if (value === null) {
      update[key] = null
    }
  }
  return { update: update as Partial<ArtistProfile> }
}

export async function PATCH(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as Record<string, unknown>

  // Ownership already verified above via the session-bound client's
  // auth.getUser(). The write + read-back run on the service-role client
  // (bypasses RLS + migration 040's column grants entirely) so a PATCH
  // touching a PRIVATE column (e.g. legal name, contact info) doesn't
  // 42501 on its own `.select()` read-back — D-19 companion fix.
  // EDITABLE_FIELDS above remains the mass-assignment allowlist; only the
  // client used to execute the already-sanitized update changes. The
  // service client is also needed inside sanitize() itself for the
  // featured_project_id ownership+is_public pre-check (Pitfall 4).
  const service = createServiceClient()
  const result = await sanitize(body, service, user.id)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const update = result.update
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await service
    .from('artist_profiles')
    .update(update)
    .eq('id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
