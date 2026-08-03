import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { matchesPreclearedTerms } from '@/lib/deals/matching'
import { authorizeRequestTarget } from '@/lib/deals/request-target'
import { buildLicenseRequestNotification } from '@/lib/deals/notifications'
import { createNotification } from '@/lib/notifications'
import {
  USAGE_TYPE_VALUES,
  TERRITORY_VALUES,
  DEAL_STAGE_VALUES,
  type LicenseRequestAdmin,
  type ProjectLicenseTerms,
} from '@/lib/deals/schema'

// Every internal column — this route runs entirely behind verifyAdmin, so
// (unlike the buyer-facing GET /api/buyer/requests) admin_notes, owner_id,
// commission_pct, and artist_net_cents are all included deliberately.
const ADMIN_DEAL_COLUMNS =
  'id, buyer_org_id, created_by, vault_project_id, usage_types, territories, term_months, exclusivity, budget_cents, need_by, buyer_notes, stage, matched_precleared, gross_fee_cents, contract_document_id, owner_id, admin_notes, commission_pct, artist_net_cents, created_at, updated_at'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ─── GET /api/admin/deals?stage=&owner=&matched= ──────────────────────────
// Lists the negotiation queue. Admin-gated (T-16-27/T-16-30) — the internal
// economics and negotiation-note fields excluded from the buyer/artist
// column grants (migration 081) are readable here precisely BECAUSE this
// route runs as the service role behind verifyAdmin, never before it.
// Supports the three filters the founder needs to work the unmatched lane
// first (D-15a): stage, owner ('unassigned' or a specific admin id), and
// matched_precleared ('true'/'false'). Joins buyer org, target project, and
// submitter/owner identity for queue context — none of which are readable
// through the license_requests row alone.
export async function GET(request: Request) {
  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const url = new URL(request.url)
  const stageParam = url.searchParams.get('stage')
  const ownerParam = url.searchParams.get('owner')
  const matchedParam = url.searchParams.get('matched')

  const service = createServiceClient()
  let query = service.from('license_requests').select(ADMIN_DEAL_COLUMNS)

  if (stageParam && (DEAL_STAGE_VALUES as readonly string[]).includes(stageParam)) {
    query = query.eq('stage', stageParam)
  }
  if (ownerParam === 'unassigned') {
    query = query.is('owner_id', null)
  } else if (ownerParam) {
    query = query.eq('owner_id', ownerParam)
  }
  if (matchedParam === 'true') {
    query = query.eq('matched_precleared', true)
  } else if (matchedParam === 'false') {
    query = query.eq('matched_precleared', false)
  }

  // Oldest first: the request-age clock plan 16-10 aggregates, and the D-15a
  // founder-led motion works the longest-waiting unmatched request first.
  const { data, error } = await query.order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const requests = (data ?? []) as LicenseRequestAdmin[]

  const orgIds = Array.from(new Set(requests.map(r => r.buyer_org_id)))
  const projectIds = Array.from(new Set(requests.map(r => r.vault_project_id)))
  const userIds = Array.from(
    new Set(requests.flatMap(r => [r.created_by, r.owner_id].filter((v): v is string => !!v)))
  )

  const [{ data: orgRows }, { data: projectRows }] = await Promise.all([
    orgIds.length > 0
      ? service.from('buyer_orgs').select('id, name').in('id', orgIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    projectIds.length > 0
      ? service.from('vault_projects').select('id, title, vault_readiness_score').in('id', projectIds)
      : Promise.resolve({ data: [] as { id: string; title: string; vault_readiness_score: number }[] }),
  ])

  const orgNameById = new Map((orgRows ?? []).map(o => [o.id, o.name]))
  const projectById = new Map(
    (projectRows ?? []).map(p => [p.id, { title: p.title, readiness: p.vault_readiness_score }])
  )

  const userNameById = new Map<string, string | null>()
  await Promise.all(
    userIds.map(async id => {
      try {
        const { data: authUser } = await service.auth.admin.getUserById(id)
        const name =
          (authUser?.user?.user_metadata as { display_name?: string } | undefined)?.display_name ?? null
        userNameById.set(id, name)
      } catch {
        userNameById.set(id, null)
      }
    })
  )

  const rows = requests.map(r => ({
    request: r,
    buyerOrgName: orgNameById.get(r.buyer_org_id) ?? 'Unknown company',
    projectTitle: projectById.get(r.vault_project_id)?.title ?? 'Unknown project',
    projectReadinessScore: projectById.get(r.vault_project_id)?.readiness ?? null,
    submitterName: userNameById.get(r.created_by) ?? null,
    ownerName: r.owner_id ? (userNameById.get(r.owner_id) ?? null) : null,
  }))

  return NextResponse.json({ data: rows })
}

// license_requests has no dedicated "admin-created" column (no migration in
// this plan). admin_notes doubles as that signal, exactly like the buyer
// route's mismatch-note convention — plan 16-10's support-burden metric
// reads for this marker rather than a new column.
function buildManualIntakeNote(
  adminIdentifier: string,
  matchResult: { matched: boolean; reasons: string[] }
): string {
  const header = `[Admin-created via manual intake by ${adminIdentifier}]`
  if (matchResult.matched) return header
  return `${header}\n\nPre-clearance mismatch at submission:\n${matchResult.reasons.map(r => `- ${r}`).join('\n')}`
}

const ManualIntakeBodySchema = z
  .object({
    buyer_org_id: z.string().uuid(),
    created_by: z.string().uuid(),
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

// ─── POST /api/admin/deals (D-03 manual intake) ────────────────────────────
// The founder-assist fallback for a deal that started over email or at a
// conference. Writes into the SAME license_requests/license_request_tracks
// tables through the SAME strict validation and the SAME pre-cleared
// matching as POST /api/buyer/requests — deliberately re-implemented here
// rather than shared, mirroring this codebase's admin-route-mirrors-
// member-route precedent (e.g. app/api/admin/members vs. the industry
// self-serve equivalents), so the two entry points stay independently
// auditable at the migration-081 REVOKE boundary. A manual deal is a
// first-class deal, never a spreadsheet or a parallel shape.
export async function POST(request: Request) {
  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const parsed = ManualIntakeBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }
  const input = parsed.data

  const service = createServiceClient()

  // A manual deal must be attributed to a REAL member of the named org
  // (D-13a dual attribution) — an admin cannot file on behalf of an
  // arbitrary account.
  const { data: member } = await service
    .from('buyer_members')
    .select('org_id, user_id')
    .eq('org_id', input.buyer_org_id)
    .eq('user_id', input.created_by)
    .maybeSingle()
  if (!member) {
    return NextResponse.json(
      { error: 'The selected buyer is not a member of the selected company.' },
      { status: 400 }
    )
  }

  const target = await authorizeRequestTarget(service, input.created_by, input.vault_project_id)
  if (!target.ok) {
    return NextResponse.json(
      { error: 'This project is not available for license requests.' },
      { status: 404 }
    )
  }

  const validTrackIds = new Set(target.project.tracks.map(t => t.id))
  const trackIds = Array.from(new Set(input.track_ids))
  if (trackIds.some(trackId => !validTrackIds.has(trackId))) {
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
      buyer_org_id: input.buyer_org_id,
      created_by: input.created_by,
      vault_project_id: input.vault_project_id,
      usage_types: input.usage_types,
      territories: input.territories,
      term_months: input.term_months,
      exclusivity: input.exclusivity,
      budget_cents: input.budget_cents,
      need_by: input.need_by ?? null,
      buyer_notes: input.buyer_notes ?? null,
      matched_precleared: matchResult.matched,
      admin_notes: buildManualIntakeNote(auth.user.email ?? auth.user.id, matchResult),
      // The creating admin becomes the initial deal owner — a sensible
      // default for a founder-assisted deal; reassignable via PATCH.
      owner_id: auth.user.id,
    })
    .select(ADMIN_DEAL_COLUMNS)
    .single()

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: 'Failed to create request — please try again.' },
      { status: 500 }
    )
  }

  const { error: tracksError } = await service
    .from('license_request_tracks')
    .insert(trackIds.map(track_id => ({ license_request_id: inserted.id, track_id })))

  if (tracksError) {
    // Compensating delete — mirrors the buyer route: a request must never
    // persist with no tracks.
    await service.from('license_requests').delete().eq('id', inserted.id)
    return NextResponse.json(
      { error: 'Failed to create request — please try again.' },
      { status: 500 }
    )
  }

  // Best-effort artist notification — a manual deal is a first-class deal,
  // so the artist learns about it exactly as they would a portal-filed
  // request (D-15b). Wrapped in try/catch AFTER the primary write
  // (lib/social/activity-emit.ts convention); can never fail creation.
  try {
    const [{ data: authUser }, { data: org }] = await Promise.all([
      service.auth.admin.getUserById(input.created_by),
      service.from('buyer_orgs').select('name').eq('id', input.buyer_org_id).maybeSingle(),
    ])
    const actorName =
      (authUser?.user?.user_metadata as { display_name?: string } | undefined)?.display_name?.trim() ||
      'A buyer'
    const buyerCompanyName = org?.name ?? 'A buyer company'

    await createNotification(
      service,
      buildLicenseRequestNotification({
        recipientId: target.project.user_id,
        actorId: input.created_by,
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

  return NextResponse.json({ data: inserted }, { status: 201 })
}
