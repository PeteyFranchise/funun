import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

// PATCH /api/launchpad/[projectId]/progress
// Upserts a single checklist completion row for the authenticated user.
// user_id is always taken from the session — never trusted from the request body
// (T-05-01: RLS WITH CHECK also enforces this at the DB layer).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Parse and validate body — only item_key (string) and completed (boolean) are accepted
  const body = (await request.json()) as Record<string, unknown>
  const itemKey = typeof body.item_key === 'string' ? body.item_key : null
  const completed = typeof body.completed === 'boolean' ? body.completed : null

  if (!itemKey || completed === null) {
    return NextResponse.json(
      { error: 'item_key and completed are required' },
      { status: 400 }
    )
  }

  // Upsert on UNIQUE (user_id, project_id, item_key) — matches migration 028 constraint.
  // completed_at is set to now when completing, cleared when unchecking.
  const { error } = await supabase.from('launchpad_progress').upsert(
    {
      user_id: user.id,
      project_id: projectId,
      item_key: itemKey,
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    },
    { onConflict: 'user_id,project_id,item_key' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
