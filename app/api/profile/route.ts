import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import type { ArtistProfile } from '@/types'
import { normalizeCountry, normalizeRegistrant } from '@/lib/metadata/identifiers'

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
] as const

function sanitize(body: Record<string, unknown>): Partial<ArtistProfile> {
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
    if (typeof value === 'string') {
      const trimmed = value.trim()
      update[key] = trimmed === '' ? null : trimmed
    } else if (value === null) {
      update[key] = null
    }
  }
  return update as Partial<ArtistProfile>
}

export async function PATCH(request: Request) {
  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as Record<string, unknown>
  const update = sanitize(body)
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('artist_profiles')
    .update(update)
    .eq('id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
