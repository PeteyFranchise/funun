import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { validateProfileVisibilityUpdate } from '@/lib/trust-safety/visibility'

// ─── PATCH /api/profile/visibility ───────────────────────────────────────
// Body: { profileVisibility?: 'public'|'connections_only', openToVisibility?: 'public'|'connections'|'hidden' }
// Owner-only write to profile_visibility/open_to_visibility (SAFETY-04).
// Deliberately separate from app/api/profile/route.ts's EDITABLE_FIELDS
// allowlist: migration 058 gives these two columns no authenticated UPDATE
// grant at all, so this route must use the service client after its own
// auth.getUser() ownership check — same precedent as the legal/PII fields
// that route already writes via the service client.
export async function PATCH(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const validated = validateProfileVisibilityUpdate(body)
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

  const service = createServiceClient()
  const { data, error } = await service
    .from('artist_profiles')
    .update(validated.value)
    .eq('id', user.id)
    .select('id, profile_visibility, open_to_visibility')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
