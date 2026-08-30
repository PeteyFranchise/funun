import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { checkRateLimit } from '@/lib/security/rate-limit'

// ─── DELETE /api/works/[workId]/notes/[eventId] — remove your own note ───
// The narrow, deliberate counterpart to the notes POST. The diary is an
// append-only evidence trail (migration 138: one SELECT policy, INSERT /
// UPDATE / DELETE revoked from every client role), and it MUST stay that
// way for the auto-captured kinds — a version, a lyric edit, an ai_entry
// are tamper-proof records of who did what, which is the whole point of
// CAT-Q1. This route does not weaken that. It removes ONLY a `note`, the
// one hand-authored kind, and ONLY the caller's own, so a typo or a
// regretted line can be taken back without ever exposing a path to delete
// the evidence itself.
//
// The guardrails are enforced in application code, not RLS, because the
// only role that can delete here at all is the service role (clients are
// revoked), and the service role bypasses RLS — so every check below is
// load-bearing, and the delete itself re-states them as WHERE filters so a
// race cannot widen the blast radius:
//   1. authenticated                       (401 otherwise)
//   2. a member of THIS work               (resolveWorkAccess 'contribute')
//   3. the row is kind = 'note'            (never an auto-captured kind)
//   4. the row's actor is the caller       (your own note only)
//   5. the row belongs to THIS work        (path can't reach across works)

type RouteCtx = { params: Promise<{ workId: string; eventId: string }> }

export async function DELETE(_request: Request, { params }: RouteCtx) {
  const { workId, eventId } = await params

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (await checkRateLimit(`work-note-delete:${user.id}`, { maxAttempts: 60, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
  }

  // Must be on the work at all — the same capability that grants the right
  // to write a note (either tier) grants the right to remove one's own.
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) {
    return NextResponse.json({ error: access.reason }, { status: access.status })
  }

  const service = createServiceClient()
  const { data: row, error: loadError } = await service
    .from('work_diary_events')
    .select('id, work_id, kind, actor_user_id')
    .eq('id', eventId)
    .maybeSingle()

  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 })
  // A row in another work is indistinguishable from a missing one — never
  // confirm the existence of a diary entry the caller can't see.
  if (!row || row.work_id !== workId) {
    return NextResponse.json({ error: 'Note not found.' }, { status: 404 })
  }
  if (row.kind !== 'note') {
    return NextResponse.json({ error: 'Only notes can be removed — the rest of the diary is a record.' }, { status: 403 })
  }
  if (row.actor_user_id !== user.id) {
    return NextResponse.json({ error: 'You can only remove your own note.' }, { status: 403 })
  }

  // Re-state every guardrail as a WHERE filter: even if the row changed
  // between the load and here, this can only ever delete a note the caller
  // authored, in this work.
  const { error: deleteError } = await service
    .from('work_diary_events')
    .delete()
    .eq('id', eventId)
    .eq('work_id', workId)
    .eq('kind', 'note')
    .eq('actor_user_id', user.id)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
