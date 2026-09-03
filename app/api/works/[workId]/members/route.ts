import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import * as collaboratorInvite from '@/lib/collaborators/invite'
import { planWriterPromotion } from '@/lib/catalogue/splits'
import { loadWorkSplits, applyWorkSplits } from '@/lib/catalogue/splits-io'
import { planWorkMemberAdmission } from '@/lib/catalogue/member-admission'

// ─── POST /api/works/[workId]/members — invite, tiers, and the separate
// writer promotion (S-02) ─────────────────────────────────────────────
//
// Reuses the existing collaborator invite/claim machinery for an UNCLAIMED
// roster person only. A claimed collaborator already has a verified Funūn
// identity and is linked directly, with no signup email. The invite helper
// still owns cooldown, escaping, and copyable-link fallback; no second email
// flow is built here.
//
// Membership and splits are different facts (doctrine, verbatim). Adding
// a member never touches the split sheet; a writer promotion, requested
// explicitly and separately, does.

type RouteCtx = { params: Promise<{ workId: string }> }

const TierEnum = z.enum(['contribute', 'administer'])

// Two shapes, unioned: an existing roster collaborator by id, or a
// first-name + email pair matching quick-invite's own field shape and
// bounds (app/api/collaborators/quick-invite/route.ts). Each branch is
// `.strict()` — no percentage field, no tier-bypassing key, nothing beyond
// what each shape allows. A caller can never supply a split percentage,
// a contribution weight, or a tier override: the schema's strictness is
// the enforcement, because the system never proposes a number.
const AddNewCollaboratorSchema = z
  .object({
    first_name: z.string().trim().min(1).max(80),
    email: z.string().trim().toLowerCase().email().max(254),
    tier: TierEnum,
    is_writer: z.boolean(),
  })
  .strict()

const AddExistingCollaboratorSchema = z
  .object({
    collaborator_id: z.string().uuid(),
    tier: TierEnum,
    is_writer: z.boolean(),
  })
  .strict()

const AddMemberSchema = z.union([AddNewCollaboratorSchema, AddExistingCollaboratorSchema])

type CollaboratorRow = {
  id: string
  name: string
  email: string | null
  claimed_by: string | null
}

export async function POST(request: Request, { params }: RouteCtx) {
  const { workId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  // Membership changes are an administer capability (doctrine scope item
  // 9) — canManageMembership's rule, enforced here through
  // resolveWorkAccess() requiring the administer tier. The tier is a
  // database fact resolved by the one decision function, never read from
  // this request.
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, userId, 'administer')
  if (!access.granted) {
    return NextResponse.json({ error: access.reason }, { status: access.status })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = AddMemberSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid member payload' }, { status: 400 })
  }
  const input = parsed.data
  const { tier, is_writer: isWriter } = input

  // ── Look up or create the collaborator row, quick-invite's reuse-by-
  //    email pattern — so re-inviting the same person never creates a
  //    second roster row. ─────────────────────────────────────────────
  let collaborator: CollaboratorRow | null = null

  if ('collaborator_id' in input) {
    const { data: existing, error } = await supabase
      .from('collaborators')
      .select('id, name, email, claimed_by')
      .eq('id', input.collaborator_id)
      .eq('user_id', userId as string)
      .maybeSingle()

    if (error || !existing) {
      return NextResponse.json({ error: 'Collaborator not found' }, { status: 404 })
    }
    collaborator = existing as CollaboratorRow
  } else {
    const { first_name: firstName, email } = input

    const { data: existingByEmail, error: lookupError } = await supabase
      .from('collaborators')
      .select('id, name, email, claimed_by')
      .eq('user_id', userId as string)
      .ilike('email', email)
      .is('archived_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    // A failed roster lookup is not “no match.” Treating it that way created
    // duplicate unclaimed rows when production drifted away from the expected
    // archived_at schema, then sent existing Funūn users signup invitations.
    if (lookupError) {
      return NextResponse.json({ error: 'Could not check your collaborator roster' }, { status: 500 })
    }

    if (existingByEmail) {
      collaborator = existingByEmail as CollaboratorRow
    } else {
      // Never accept claimed_by, user_id, or any registry field from the
      // body — the strict schema above already makes that impossible;
      // this insert only ever writes the allowlisted partial-row shape,
      // matching quick-invite's own insert.
      const { data: inserted, error: insertError } = await supabase
        .from('collaborators')
        .insert({ user_id: userId, name: firstName, first_name: firstName, email, status: 'pending' })
        .select('id, name, email, claimed_by')
        .single()

      if (insertError || !inserted) {
        return NextResponse.json(
          { error: insertError?.message ?? 'Could not create collaborator' },
          { status: 500 }
        )
      }
      collaborator = inserted as CollaboratorRow
    }
  }

  // `claimed_by` is a verified Funūn identity, established by the account's
  // authenticated email claim. Claimed members receive direct room access
  // and must never get another "create your account" email. Only genuinely
  // unclaimed roster rows enter the invite workflow.
  const admission = planWorkMemberAdmission(collaborator.claimed_by)

  // ── Insert the work_members row through the service role. ────────────
  // Migration 136 revokes INSERT/UPDATE/DELETE on work_members from
  // authenticated and anon — every membership write goes through a
  // service-role route that has already proved the caller's tier on this
  // specific work (resolveWorkAccess, above).
  const service = createServiceClient()

  const { data: member, error: memberError } = await service
    .from('work_members')
    .insert({
      work_id: workId,
      // Set immediately for an already-claimed collaborator; otherwise left
      // null and backfilled by migration 136's bridge trigger the moment that
      // person signs up, keyed off collaborators.claimed_by — the only
      // verified-identity signal in this codebase.
      // split_sheet_parties.user_id (a dead column, written nowhere) is
      // never consulted for this.
      user_id: admission.userId,
      collaborator_id: collaborator.id,
      tier,
      added_by: userId,
    })
    .select()
    .single()

  if (memberError || !member) {
    if (memberError?.code === '23505') {
      return NextResponse.json(
        { error: 'This collaborator is already on this song' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: memberError?.message ?? 'Could not add member' },
      { status: 500 }
    )
  }

  // Deliver only after membership succeeds. A duplicate/rejected membership
  // must never send a misleading invitation for a room the person was not
  // actually added to.
  const inviteResult =
    admission.kind === 'invite-required'
      ? await collaboratorInvite.sendCollaboratorInvite(supabase, {
          collaborator: {
            id: collaborator.id,
            name: collaborator.name,
            email: collaborator.email,
          },
          invitingUserId: userId as string,
          // Writer's Room invitations preserve creative momentum: after the
          // signup transaction creates the profile and claims membership, the
          // new member enters this room before seeing broader onboarding.
          nextPath: `/vault/works/${workId}`,
        })
      : null

  // ── Writer promotion — explicit, separate, and ONLY on request. ──────
  // PITFALL 3 (doctrine, verbatim): auto-adding every member to the sheet
  // would silently grant a publishing share to a pure performer or
  // listener who was never meant to own one. Being on the work and being
  // on the splits are different facts, and this is the one place they are
  // allowed to touch — behind an explicit, deliberate conditional, never
  // implicitly.
  let splits: { changed: boolean } | null = null
  if (isWriter) {
    const sheet = await loadWorkSplits(service, workId)
    if (!sheet) {
      return NextResponse.json(
        { error: 'This work has no living-draft split sheet to promote a writer onto' },
        { status: 500 }
      )
    }

    const promotion = planWriterPromotion({
      parties: sheet.parties,
      writer: { collaboratorId: collaborator.id, name: collaborator.name },
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
    splits = { changed: promotion.changed }
  }

  return NextResponse.json({
    data: {
      member,
      collaborator,
      admission: admission.kind,
      inviteLink: inviteResult?.ok ? inviteResult.inviteLink : null,
      inviteError: inviteResult && !inviteResult.ok ? inviteResult.error : null,
      splits,
    },
  })
}
