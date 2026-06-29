import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { sanitizeCollaborator } from '@/lib/collaborators'

// ─── PATCH /api/collaborators/[id] ───────────────────────────
// Updates a collaborator the authenticated user owns.
// Ownership enforced both by RLS and the explicit .eq('user_id') chain (T-01-03).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = (await request.json()) as Record<string, unknown>
  const update = sanitizeCollaborator(body)
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('collaborators')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// ─── DELETE /api/collaborators/[id] ──────────────────────────
// Deletes a collaborator the authenticated user owns.
// Ownership enforced both by RLS and the explicit .eq('user_id') chain (T-01-03).
// Claimed rows (claimed_by IS NOT NULL) are blocked — archive is the only removal
// path to preserve credit records (T-04-09, D-10).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Check claimed_by before deleting — scoped to the authenticated owner (T-04-09)
  const { data: existing } = await supabase
    .from('collaborators')
    .select('claimed_by')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing?.claimed_by) {
    return NextResponse.json(
      { error: 'Cannot delete a claimed collaborator — use archive instead' },
      { status: 409 }
    )
  }

  const { error } = await supabase
    .from('collaborators')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
