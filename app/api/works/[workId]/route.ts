import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'

type RouteCtx = { params: Promise<{ workId: string }> }

// GET and PATCH /api/works/[workId] — the header's live title input and its
// three-state vocal control (plan 11's WorkHeader).
//
// Both handlers begin with resolveWorkAccess() (plan 04) and return its
// refusal status unchanged. No route in this tree derives its own access
// answer — the refusal statuses (401, 404, 403) are the decision
// function's to choose, not the route's.

const VOCAL_STATE_VALUES = ['primary', 'varies', 'instrumental'] as const

const PatchWorkSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    vocal_state: z.enum(VOCAL_STATE_VALUES).optional(),
  })
  .strict()

export async function GET(_request: Request, { params }: RouteCtx) {
  const { workId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const access = await resolveWorkAccess(
    createWorkAccessDeps(supabase),
    workId,
    user?.id ?? null,
    'contribute'
  )
  if (!access.granted) {
    return NextResponse.json({ error: access.reason }, { status: access.status })
  }

  // Kept minimal — the composer page (plan 12) does its own fetching
  // server-side; this handler exists for client-side refreshes after a
  // mutation.
  const { data: work, error: workError } = await supabase
    .from('works')
    .select('*')
    .eq('id', workId)
    .single()

  if (workError || !work) {
    return NextResponse.json({ error: 'Work not found' }, { status: 404 })
  }

  const { data: members, error: membersError } = await supabase
    .from('work_members')
    .select('*')
    .eq('work_id', workId)

  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 })
  }

  return NextResponse.json({ data: { work, members: members ?? [] } })
}

export async function PATCH(request: Request, { params }: RouteCtx) {
  const { workId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, userId, 'contribute')
  if (!access.granted) {
    return NextResponse.json({ error: access.reason }, { status: access.status })
  }
  // access.granted is true, and decideWorkAccess's 401 branch already ruled
  // out a null userId — safe to treat userId as the authenticated caller
  // below.

  const body = await request.json().catch(() => ({}))
  const parsed = PatchWorkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid work update' }, { status: 400 })
  }

  const { title, vocal_state: vocalState } = parsed.data
  if (title === undefined && vocalState === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}

  // RENAME RULE. Identity is the work id and the title is presentation —
  // that is why this is a live autosaved input rather than a form with a
  // save button, why renaming is safe at any time, and why the diary logs
  // it. The diary entry is produced by migration 138's
  // capture_work_rename_event() trigger (AFTER UPDATE OF title, fired only
  // when the title actually changed) — this route writes only the column,
  // never a diary row itself. Former titles stay findable in 37.1 because
  // the diary's rename entries carry both previousTitle and title; a
  // dedicated search index over titles is 37.2's problem once the volume
  // view lands.
  if (title !== undefined) {
    update.title = title
  }

  // DEFAULT-PERFORMER RULE, in the owner's terms: instrumental is not a
  // cosmetic flag. It makes every who-sings prompt disappear, blocks stay
  // pure structure in producer vocabulary, the Crate vocal check passes by
  // construction because the hard no cannot trigger, and DDEX exports omit
  // vocal performer roles entirely.
  if (vocalState !== undefined) {
    update.vocal_state = vocalState

    if (vocalState === 'primary') {
      // Moving TO primary: default the performer to the caller, but only
      // when none is set yet. A default is a plan, not a record, so this
      // write never fabricates a human-take registry entry — and an AI
      // vocal can never hide under the default because the add-audio flow
      // asks regardless, and a declared fact always beats inheritance.
      const { data: current } = await supabase
        .from('works')
        .select('primary_performer')
        .eq('id', workId)
        .maybeSingle()

      if (!current?.primary_performer) {
        update.primary_performer = { kind: 'self', userId }
      }
    } else {
      // Moving AWAY from primary ('varies' or 'instrumental'): a single
      // primary performer no longer describes this song, so the field is
      // cleared rather than left stale.
      update.primary_performer = null
    }
  }

  const { data, error } = await supabase
    .from('works')
    .update(update)
    .eq('id', workId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
