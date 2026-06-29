import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'

// ─── Allowlist ──────────────────────────────────────────────────────────────
// Mass-assignment mitigation T-04-06: id, claimed_by, and timestamps are
// intentionally excluded — they must never be written by the client.
const USER_PROFILES_EDITABLE_FIELDS = [
  'pro',
  'ipi',
  'publisher',
  'phone',
  'mailing_address',
  'display_name',
  'bio',
] as const

type UserProfileUpdate = {
  pro?: string | null
  ipi?: string | null
  publisher?: string | null
  phone?: string | null
  mailing_address?: Record<string, unknown> | null
  display_name?: string | null
  bio?: string | null
}

function sanitize(body: Record<string, unknown>): UserProfileUpdate {
  const update: Record<string, unknown> = {}
  for (const key of USER_PROFILES_EDITABLE_FIELDS) {
    if (!(key in body)) continue
    const value = body[key]

    if (key === 'mailing_address') {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        update[key] = value
      } else if (value === null) {
        update[key] = null
      }
      continue
    }

    if (typeof value === 'string') {
      const trimmed = value.trim()
      update[key] = trimmed === '' ? null : trimmed
    } else if (value === null) {
      update[key] = null
    }
  }
  return update as UserProfileUpdate
}

// ─── GET /api/user-profiles ─────────────────────────────────────────────────
// Returns the authenticated user's user_profiles row, or null if it hasn't
// been saved yet (first-time users). T-04-08: query scoped to id = user.id.
export async function GET() {
  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// ─── PATCH /api/user-profiles ───────────────────────────────────────────────
// Upserts the user's identity fields then fires backfill_claimed_collaborators
// as fire-and-forget so claimed collaborator rows get updated additively.
// A back-fill failure never blocks the settings save response.
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
    .from('user_profiles')
    .upsert({ id: user.id, ...update }, { onConflict: 'id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire-and-forget back-fill: fills any gaps on claimed collaborator rows
  // additively (COALESCE ordering in SQL). Rejection swallowed — never blocks
  // the settings save (D-08, D-09, T-04-07).
  void Promise.resolve(
    createServiceClient().rpc('backfill_claimed_collaborators', { p_user_id: user.id })
  ).catch(() => {})

  return NextResponse.json({ data })
}
