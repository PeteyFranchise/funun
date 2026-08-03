import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { canSubmitRequest } from '@/lib/buyers/permissions'
import { matchesPreclearedTerms } from '@/lib/deals/matching'
import { USAGE_TYPE_VALUES, TERRITORY_VALUES, type ProjectLicenseTerms } from '@/lib/deals/schema'
import { buildLicenseRequestNotification } from '@/lib/deals/notifications'
import { createNotification } from '@/lib/notifications'
import { authorizeRequestTarget } from '@/lib/deals/request-target'

// ─── POST /api/buyer/requests (D-07/D-02/D-15a/D-15b) ─────────────────────
// license_requests writes are REVOKEd from authenticated (migration 081) —
// this route is the ONLY way a buyer request lands in the table. Every
// D-07 buyer dimension is Zod-validated with .strict() so a client-supplied
// stage/owner_id/commission_pct/gross_fee_cents/artist_net_cents/
// matched_precleared field has no home in the parsed input and fails the
// whole request rather than being silently dropped (T-16-22). The target
// project is re-authorized through the same rights-ready + Phase 13
// visibility + block gate the catalog surface applies (T-16-23), and every
// requested track id is verified to belong to that project before insert.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const RequestBodySchema = z
  .object({
    vault_project_id: z.string().uuid(),
    track_ids: z.array(z.string().uuid()).min(1, 'Select at least one track.'),
    usage_types: z.array(z.enum(USAGE_TYPE_VALUES)).min(1, 'Select at least one usage type.'),
    territories: z.array(z.enum(TERRITORY_VALUES)).min(1, 'Select at least one territory.'),
    term_months: z.number().int().min(1, 'Term must be at least 1 month.').max(1200, 'Term is too long.'),
    exclusivity: z.boolean(),
    budget_cents: z.number().int().min(0, 'Budget cannot be negative.'),
    need_by: z.union([z.string().regex(DATE_RE, 'need_by must be YYYY-MM-DD.'), z.null()]).optional(),
    buyer_notes: z
      .union([z.string().trim().max(2000, 'Notes must be 2000 characters or fewer.'), z.null()])
      .optional(),
  })
  .strict()

// license_requests (migration 081) has no dedicated mismatch-reasons
// column. admin_notes is the closest admin-only fit — buyers can never
// SELECT it (the column-grant allowlist excludes it) — so the 16-07
// negotiation queue can read exactly which dimensions were out of band
// without a new migration.
function formatMismatchNote(reasons: string[]): string {
  return `Pre-clearance mismatch at submission:\n${reasons.map(r => `- ${r}`).join('\n')}`
}

export async function POST(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('buyer_members')
    .select('org_id, buyer_role')
    .eq('user_id', user.id)
    .maybeSingle()

  // Both requester and approver may submit (D-14a) — only non-members are
  // rejected. canSubmitRequest fails closed on a missing/corrupt role.
  if (!member || !canSubmitRequest(member)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const parsed = RequestBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }
  const input = parsed.data

  const service = createServiceClient()

  const target = await authorizeRequestTarget(service, user.id, input.vault_project_id)
  if (!target.ok) {
    return NextResponse.json(
      { error: 'This project is not available for license requests.' },
      { status: 404 }
    )
  }

  const validTrackIds = new Set(target.project.tracks.map(t => t.id))
  const trackIds = Array.from(new Set(input.track_ids))
  if (trackIds.some(id => !validTrackIds.has(id))) {
    return NextResponse.json(
      { error: 'One or more selected tracks do not belong to this project.' },
      { status: 400 }
    )
  }

  const { data: termsRow } = await service
    .from('project_license_terms')
    .select(
      'vault_project_id, min_fee_cents, allowed_usage_types, territories, exclusivity_allowed, max_term_months, updated_at'
    )
    .eq('vault_project_id', input.vault_project_id)
    .maybeSingle()

  // D-15a: matched precleared vs. flagged for admin negotiation — computed
  // server-side, never trusted from the client. matched_precleared, stage,
  // owner_id, commission_pct, gross_fee_cents, and artist_net_cents have no
  // home in the strict Zod schema above, so none of them can be
  // client-supplied.
  const matchResult = matchesPreclearedTerms(
    {
      usage_types: input.usage_types,
      territories: input.territories,
      term_months: input.term_months,
      exclusivity: input.exclusivity,
      budget_cents: input.budget_cents,
    },
    (termsRow as ProjectLicenseTerms | null) ?? null
  )

  const { data: inserted, error: insertError } = await service
    .from('license_requests')
    .insert({
      buyer_org_id: member.org_id,
      created_by: user.id,
      vault_project_id: input.vault_project_id,
      usage_types: input.usage_types,
      territories: input.territories,
      term_months: input.term_months,
      exclusivity: input.exclusivity,
      budget_cents: input.budget_cents,
      need_by: input.need_by ?? null,
      buyer_notes: input.buyer_notes ?? null,
      matched_precleared: matchResult.matched,
      admin_notes: matchResult.matched ? null : formatMismatchNote(matchResult.reasons),
    })
    .select('id, created_at, updated_at')
    .single()

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: 'Failed to submit request — please try again.' },
      { status: 500 }
    )
  }

  const { error: tracksError } = await service
    .from('license_request_tracks')
    .insert(trackIds.map(track_id => ({ license_request_id: inserted.id, track_id })))

  if (tracksError) {
    // Compensating delete — a request must never persist with no tracks.
    await service.from('license_requests').delete().eq('id', inserted.id)
    return NextResponse.json(
      { error: 'Failed to submit request — please try again.' },
      { status: 500 }
    )
  }

  // Best-effort artist notification (D-15b) — mirrors
  // lib/social/activity-emit.ts's convention: runs AFTER the primary
  // insert, wrapped in try/catch, and must never fail request creation.
  try {
    const [{ data: authUser }, { data: org }] = await Promise.all([
      service.auth.admin.getUserById(user.id),
      service.from('buyer_orgs').select('name').eq('id', member.org_id).maybeSingle(),
    ])
    const actorName =
      (authUser?.user?.user_metadata as { display_name?: string } | undefined)?.display_name?.trim() ||
      'A buyer'
    const buyerCompanyName = org?.name ?? 'A buyer company'

    await createNotification(
      service,
      buildLicenseRequestNotification({
        recipientId: target.project.user_id,
        actorId: user.id,
        actorName,
        actorAvatarUrl: null,
        buyerCompanyName,
        projectTitle: target.project.title,
        licenseRequestId: inserted.id,
      })
    )
  } catch {
    // Notification failure must never fail request creation.
  }

  return NextResponse.json(
    {
      data: {
        id: inserted.id,
        buyer_org_id: member.org_id,
        created_by: user.id,
        vault_project_id: input.vault_project_id,
        usage_types: input.usage_types,
        territories: input.territories,
        term_months: input.term_months,
        exclusivity: input.exclusivity,
        budget_cents: input.budget_cents,
        need_by: input.need_by ?? null,
        buyer_notes: input.buyer_notes ?? null,
        stage: 'submitted',
        matched_precleared: matchResult.matched,
        gross_fee_cents: null,
        contract_document_id: null,
        created_at: inserted.created_at,
        updated_at: inserted.updated_at,
      },
    },
    { status: 201 }
  )
}
