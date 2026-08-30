import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { checkRateLimit } from '@/lib/security/rate-limit'

// ─── POST /api/works/[workId]/notes — the ONE app-authored diary kind ───
// This is the ONE place in this codebase that writes a `work_diary_events`
// row from application code, and that is not a hole in CAT-Q1's
// never-depends-on-discipline guarantee — it is the guarantee's single,
// deliberate, documented exception.
//
// Every OTHER diary kind (version, lyric_edit, roster, sheet, ai_entry,
// rename, reorder, detach) has an underlying row — a `work_versions`
// insert, a `lyric_blocks` edit, an `ai_entries` insert, and so on — whose
// migration-138 trigger fires regardless of which route performed the
// write, including a route that has not been written yet. A note has no
// underlying row to trigger from: it is a free-standing annotation ("Ben
// wrote verse 2"), not a side effect of some other table's mutation. There
// is nothing to trigger.
//
// Migration 138 REVOKEs INSERT (and UPDATE and DELETE) on
// `work_diary_events` from `authenticated` and `anon`, so the service role
// is the only path that can write here at all — and that is deliberate:
// membership access, proven above through `resolveWorkAccess()`, is what
// grants the right to annotate; RLS on this table grants nobody a write.
//
// Adding a second app-authored kind here would weaken CAT-Q1 back into a
// convention instead of a guarantee. That needs a deliberate decision, not
// a convenience — do not add one without reopening this file's reasoning.
//
// RESEARCH Pitfall 1: this route imports NEITHER `emitActivity` NOR any
// reference to `activity_events`. That table is a PUBLIC wall feed (its
// SELECT policy is `USING (true)`), its kind enum is closed at four
// unrelated values, and its emitter is explicitly allowed to swallow its
// own errors — none of which is acceptable for a private evidence trail. A
// future pull request importing that emitter into this tree is the warning
// sign this comment exists to name.

type RouteCtx = { params: Promise<{ workId: string }> }

const NOTE_MAX_LENGTH = 2000

const NoteBodySchema = z
  .object({
    text: z.string().trim().min(1).max(NOTE_MAX_LENGTH),
  })
  .strict()

export async function POST(request: Request, { params }: RouteCtx) {
  const { workId } = await params

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (await checkRateLimit(`work-note:${user.id}`, { maxAttempts: 60, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
  }

  // Annotating is a CONTRIBUTE capability — either tier may write a note.
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) {
    return NextResponse.json({ error: access.reason }, { status: access.status })
  }

  const raw = await request.json().catch(() => null)
  const parsed = NoteBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: `A note must be 1-${NOTE_MAX_LENGTH} characters` },
      { status: 400 }
    )
  }

  const service = createServiceClient()
  const { data: inserted, error } = await service
    .from('work_diary_events')
    .insert({
      work_id: workId,
      kind: 'note',
      actor_user_id: user.id,
      payload: { text: parsed.data.text },
    })
    .select()
    .single()

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? 'Could not save the note' }, { status: 500 })
  }

  return NextResponse.json({ data: inserted }, { status: 201 })
}
