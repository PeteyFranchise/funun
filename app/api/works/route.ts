import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import type { Work } from '@/types/catalogue'

// ─── POST /api/works — the 🎵 Start a song door (S-03) ───────────────────
// Plan 13's two-door create flow posts here for 🎵 Start a song and
// redirects to the work page with the returned id; 🚀 Start a release keeps
// posting to /api/vault unchanged (app/api/vault/route.ts) — this route
// creates a Work, never a vault_project.
//
// The body accepts exactly an optional title and nothing else. That is not
// an arbitrary minimalism — sketch 005-C's empty state IS the pitch
// ("Start with a hum — thirty seconds of melody makes it real, and provably
// yours"). The create form has one field at most, so the route accepts no
// more than the form can send. `.strict()` rejects any other key outright.
const CreateWorkSchema = z
  .object({
    title: z.string().trim().max(200).optional(),
  })
  .strict()

// GET /api/works — the caller's own works plus works they are a member of,
// newest first. Kept as two separate queries rather than merged in SQL,
// mirroring how app/(artist)/vault/page.tsx already separates owned
// projects from shared ones. Feeds plan 13's catalogue shelf, which renders
// client-side.
export async function GET() {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: owned, error: ownedError } = await supabase
    .from('works')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (ownedError) return NextResponse.json({ error: ownedError.message }, { status: 500 })

  // work_members' SELECT policy (migration 136) returns a contributor's own
  // row and the owner's whole roster — either way this query, scoped to the
  // caller's own user_id, only ever returns rows this account is named on.
  const { data: memberRows, error: memberError } = await supabase
    .from('work_members')
    .select('work_id, created_at, works (*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })

  // Exclude the caller's own works from the "member of" list — the owner's
  // own work_members row (created by POST below) would otherwise duplicate
  // every entry already returned by the owned query above.
  //
  // `works` comes back from a to-one embed (work_members.work_id →
  // works.id is a single FK) but this project has no generated Database
  // types, so the client's fallback typing is conservative — normalize
  // defensively rather than trust either shape.
  type MemberWorkRow = { works: Work | Work[] | null }
  const member = ((memberRows ?? []) as unknown as MemberWorkRow[])
    .map((row) => (Array.isArray(row.works) ? (row.works[0] ?? null) : row.works))
    .filter((w): w is Work => w !== null && w.user_id !== user.id)

  return NextResponse.json({ data: { owned: owned ?? [], member } })
}

// POST /api/works — create a work, the owner's own membership row and the
// work's living-draft split sheet in one call.
export async function POST(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const parsed = CreateWorkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid work payload' }, { status: 400 })
  }

  // A blank or whitespace-only title is treated the same as no title at
  // all — when no title is given, the database default ('Untitled')
  // stands rather than the route sending a placeholder string of its own.
  const title = parsed.data.title && parsed.data.title.length > 0 ? parsed.data.title : undefined

  // ── 1. Insert the work — session client, RLS-scoped to the caller
  //      (works_insert_own, migration 136). ────────────────────────────
  const insertFields: { user_id: string; title?: string } = { user_id: user.id }
  if (title) insertFields.title = title

  const { data: work, error: workError } = await supabase
    .from('works')
    .insert(insertFields)
    .select()
    .single()

  if (workError || !work) {
    return NextResponse.json({ error: workError?.message ?? 'Could not create work' }, { status: 500 })
  }

  // ── 2 & 3. Service role for both follow-up writes. ───────────────────
  // The owner gets a work_members row even though plan 04's access
  // decision already grants an owner the administer tier without one: the
  // roster UI reads membership, so the owner must appear in it, and the
  // claim-bridge trigger's uniqueness indexes (migration 136) assume the
  // owner row exists. The living-draft sheet is created empty of parties
  // on purpose — nobody is on the splits until someone is promoted to
  // writer (Pitfall 3) — with status 'draft', one of LIVING_DRAFT_STATUSES,
  // which is what makes every later redraft free.
  const service = createServiceClient()

  const { error: memberError } = await service.from('work_members').insert({
    work_id: work.id,
    user_id: user.id,
    collaborator_id: null,
    tier: 'administer',
    added_by: user.id,
  })

  let sheetError: { message: string } | null = null
  if (!memberError) {
    const { error } = await service.from('split_sheets').insert({
      initiator_user_id: user.id,
      work_id: work.id,
      song_name: work.title,
      status: 'draft',
    })
    sheetError = error
  }

  if (memberError || sheetError) {
    // These are three statements without a transaction. A work with no
    // owner membership row or no sheet is worse than no work at all — the
    // composer page would render half-configured and the artist would
    // have no obvious way to recover — so a partial failure rolls the
    // work back rather than leaving it stranded.
    await supabase.from('works').delete().eq('id', work.id).eq('user_id', user.id)
    return NextResponse.json(
      { error: (memberError ?? sheetError)?.message ?? 'Could not fully create the work' },
      { status: 500 }
    )
  }

  return NextResponse.json({ data: work })
}
