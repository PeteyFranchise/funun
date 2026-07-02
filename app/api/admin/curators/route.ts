import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { ADMIN_EDITABLE_FIELDS, PLATFORM_VALUES } from '@/lib/curators/schema'
import { fetchReachSignal } from '@/lib/curators/reach'
import type { CuratorPlatform } from '@/types'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ─── GET /api/admin/curators ─────────────────────────────────────────────
export async function GET() {
  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('curators')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// ─── POST /api/admin/curators ────────────────────────────────────────────
// Creates a new curator. On create, baseline_genre_focus is seeded from
// genre_focus (D-16 drift baseline), and a reach signal is fetched
// best-effort (D-03 — never blocks creation on failure).
export async function POST(request: Request) {
  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  const platform = typeof body.platform === 'string' ? body.platform : ''
  if (!PLATFORM_VALUES.includes(platform as (typeof PLATFORM_VALUES)[number])) {
    return NextResponse.json(
      { error: `platform must be one of: ${PLATFORM_VALUES.join(', ')}` },
      { status: 400 }
    )
  }

  // Build insert strictly from ADMIN_EDITABLE_FIELDS (mass-assignment protection, T-06-06)
  const insert: Record<string, unknown> = { name, email, platform }

  for (const field of ADMIN_EDITABLE_FIELDS) {
    if (field === 'name' || field === 'email' || field === 'platform') continue
    if (!(field in body)) continue

    if (field === 'genre_focus') {
      const genreFocus = Array.isArray(body.genre_focus)
        ? body.genre_focus.map(t => String(t).trim()).filter(Boolean)
        : []
      insert.genre_focus = genreFocus
      // Seed the drift baseline from the initial genre focus (D-16)
      insert.baseline_genre_focus = genreFocus
      continue
    }

    if (field === 'flagged_inactive') {
      insert.flagged_inactive = Boolean(body.flagged_inactive)
      continue
    }

    if (field === 'playlist_name' || field === 'playlist_url' || field === 'submission_notes') {
      insert[field] = body[field] != null ? String(body[field]).trim() || null : null
      continue
    }
  }

  if (!('genre_focus' in insert)) {
    insert.genre_focus = []
    insert.baseline_genre_focus = []
  }

  // Fetch reach signal best-effort (D-03/D-04) — never blocks creation
  const playlistUrl = typeof insert.playlist_url === 'string' ? insert.playlist_url : null
  const reach = await fetchReachSignal(platform as CuratorPlatform, playlistUrl)
  if (reach !== null) {
    insert.reach_signal = reach
    insert.reach_fetched_at = new Date().toISOString()
  }

  const service = createServiceClient()
  const { data, error } = await service.from('curators').insert(insert).select().maybeSingle()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A curator with this email already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
