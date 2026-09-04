import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { planWriterPromotion } from '@/lib/catalogue/splits'
import { loadWorkSplits, applyWorkSplits } from '@/lib/catalogue/splits-io'
import { asWriterDesignation } from '@/lib/catalogue/designation'

type RouteCtx = { params: Promise<{ workId: string; memberId: string }> }

// ─── POST /api/works/[workId]/members/[memberId]/promote — the SEPARATE,
// explicit writer promotion for someone ALREADY on the roster (S-02,
// Pitfall 3 — plan 11's WorkRoster) ─────────────────────────────────────
//
// Plan 05's sibling route (/api/works/[workId]/members) only ever creates
// a brand-new work_members row, and can optionally promote that new
// member to the sheet in the SAME request. It has no path for promoting
// someone who is already a member: calling it again with the same
// collaborator_id would collide with migration 136's partial unique
// indexes (idx_work_members_unique_user / idx_work_members_unique_collab)
// and fail. This route is the missing bridge for that exact case — a
// blocking gap surfaced while building the roster's "mark as writer is a
// separate action on an EXISTING member" requirement, not present in the
// wave-2 API surface.
//
// It reuses, unchanged, the same three primitives plan 05's route already
// calls for its own inline promotion branch (planWriterPromotion /
// loadWorkSplits / applyWorkSplits) and touches work_members NOT AT ALL —
// promotion moves the split sheet only, never the guest list. Membership
// and splits stay two different facts, enforced structurally: this route
// has no `.insert()`, `.update()` or `.delete()` against work_members
// anywhere in its body.
export async function POST(request: Request, { params }: RouteCtx) {
  const { workId, memberId } = await params

  // Optional body: the writer's DDEX/PRO designation, captured at the moment
  // of promotion. Anything not in the designation set (or an absent body) is
  // a null designation — an honest "not stated", never a fabricated role.
  const body = (await request.json().catch(() => null)) as { designation?: unknown } | null
  const designation = asWriterDesignation(body?.designation)

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  // Same administer-tier gate plan 05's members route uses — promoting a
  // writer changes who owns the composition, which is a membership-tier
  // decision, not a contribute-tier one.
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, userId, 'administer')
  if (!access.granted) {
    return NextResponse.json({ error: access.reason }, { status: access.status })
  }

  const service = createServiceClient()

  const { data: member, error: memberError } = await service
    .from('work_members')
    .select('id, collaborator_id, user_id')
    .eq('id', memberId)
    .eq('work_id', workId)
    .maybeSingle()

  if (memberError || !member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  // planWriterPromotion() needs a display NAME (PartyIdentity), which
  // work_members itself does not carry. For an invited member it comes from
  // the collaborator row (migration 136: collaborator_id is set for every
  // invitee). For the OWNER's own row — collaborator_id NULL — it comes
  // from the profile: the owner can now add THEMSELVES as a writer from the
  // roster (they wrote the song), so this endpoint must resolve their name
  // too. Artist name, else the handle (Phase 36's fallback identity), never
  // a fabricated stand-in.
  let name: string | null = null
  if (member.collaborator_id) {
    const { data: collaborator } = await service
      .from('collaborators')
      .select('name')
      .eq('id', member.collaborator_id)
      .maybeSingle()
    name = collaborator?.name ?? null
  } else if (member.user_id) {
    const { data: profile } = await service
      .from('user_profiles')
      .select('artist_name, handle')
      .eq('id', member.user_id)
      .maybeSingle()
    name = profile?.artist_name?.trim() || profile?.handle || null
  }

  if (!name) {
    return NextResponse.json(
      { error: 'Could not resolve a name for this member — cannot promote to writer' },
      { status: 400 }
    )
  }

  let sheet
  try {
    sheet = await loadWorkSplits(service, workId)
  } catch {
    return NextResponse.json({ error: 'Could not load this work’s split sheet' }, { status: 500 })
  }
  if (!sheet) {
    return NextResponse.json(
      { error: 'This work has no living-draft split sheet to promote a writer onto' },
      { status: 500 }
    )
  }

  // CAT-Q1a, verbatim: promotion redrafts the WHOLE sheet to equal
  // shares. No percentage is ever read from this request — there isn't
  // one to read, this route accepts no body.
  const promotion = planWriterPromotion({
    parties: sheet.parties,
    writer: { collaboratorId: member.collaborator_id, userId: member.user_id, name },
    designation,
    status: sheet.status,
  })
  if (!promotion.ok) {
    return NextResponse.json({ error: promotion.reason }, { status: 409 })
  }

  if (promotion.changed) {
    const applied = await applyWorkSplits(service, sheet.sheetId, promotion.parties)
    if (!applied.ok) {
      return NextResponse.json({ error: applied.reason }, { status: 500 })
    }
  }

  return NextResponse.json({ data: { changed: promotion.changed } })
}
