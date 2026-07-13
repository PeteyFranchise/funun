import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { CURATOR_SELF_EDITABLE_FIELDS, PLATFORM_VALUES } from '@/lib/curators/schema'
import { hasSignificantDrift } from '@/lib/curators/drift'

// ─── PATCH /api/curators/[id] ────────────────────────────────────────────
// Curator self-serve profile edit (06-05, D-19). 401 unauthenticated, 403
// unless app_metadata.role === 'curator'. Update object is built strictly
// from CURATOR_SELF_EDITABLE_FIELDS (T-06-06 mass-assignment protection —
// email_valid/flagged_inactive/reach_signal/claimed_by are NOT in the
// allowlist and are silently dropped). The write is scoped with an
// explicit .eq('claimed_by', user.id) on top of the RLS UPDATE policy
// USING(auth.uid() = claimed_by) (migration 030) — defense-in-depth
// against IDOR (T-06-05) even if RLS were ever misconfigured.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isCurator = (user.app_metadata as { role?: string })?.role === 'curator'
  if (!isCurator) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, unknown> = {}

  for (const field of CURATOR_SELF_EDITABLE_FIELDS) {
    if (!(field in body)) continue

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

  // D-16 (curator side): recompute drift against the stored baseline
  // whenever genre_focus is being edited. Loaded via the service client,
  // still explicitly scoped to claimed_by = caller.
  if ('genre_focus' in update) {
    const service = createServiceClient()
    const { data: existing } = await service
      .from('curators')
      .select('baseline_genre_focus')
      .eq('id', id)
      .eq('claimed_by', user.id)
      .maybeSingle()
    if (!existing) return NextResponse.json({ error: 'Curator not found' }, { status: 404 })
    update.drift_flagged = hasSignificantDrift(
      (existing as { baseline_genre_focus: string[] }).baseline_genre_focus,
      update.genre_focus as string[]
    )
  }

  const { data, error } = await supabase
    .from('curators')
    .update(update)
    .eq('id', id)
    .eq('claimed_by', user.id)
    .select(
      'id, name, playlist_name, playlist_url, platform, genre_focus, submission_notes, drift_flagged'
    )
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Curator not found' }, { status: 404 })

  return NextResponse.json({ data })
}
