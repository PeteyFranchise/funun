import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { isLegalTransition, requiredFieldsForStage } from '@/lib/deals/stage-machine'
import { computeNetFee } from '@/lib/deals/commission'
import { buildDealStageChangedNotification } from '@/lib/deals/notifications'
import { createNotification } from '@/lib/notifications'
import { DEAL_STAGE_VALUES, type LicenseRequestAdmin } from '@/lib/deals/schema'

const ADMIN_DEAL_COLUMNS =
  'id, buyer_org_id, created_by, vault_project_id, usage_types, territories, term_months, exclusivity, budget_cents, need_by, buyer_notes, stage, matched_precleared, gross_fee_cents, contract_document_id, owner_id, admin_notes, commission_pct, artist_net_cents, created_at, updated_at'

const DealPatchBodySchema = z
  .object({
    stage: z.enum(DEAL_STAGE_VALUES).optional(),
    owner_id: z.union([z.string().uuid(), z.null()]).optional(),
    commission_pct: z.union([z.number().min(0).max(100), z.null()]).optional(),
    gross_fee_cents: z.union([z.number().int().min(0), z.null()]).optional(),
    admin_notes: z.union([z.string().trim().max(5000), z.null()]).optional(),
  })
  .strict()

const REQUIRED_FIELD_LABELS: Record<string, string> = {
  gross_fee_cents: 'a gross fee',
  commission_pct: 'a commission percentage',
  contract_document_id: 'a linked contract document',
}

// ─── PATCH /api/admin/deals/[id] ──────────────────────────────────────────
// Body: { stage?, owner_id?, commission_pct?, gross_fee_cents?, admin_notes? }
// Explicit field allowlist (T-16-29) — the request body is NEVER spread
// into the update. Stage moves are gated by isLegalTransition against the
// freshly-loaded CURRENT stage (never trusted from the client) and by
// requiredFieldsForStage against the EFFECTIVE row — current values merged
// with whatever this same PATCH is setting, so an admin can quote and
// advance to `contract` in a single request. Gross fee / commission
// percentage changes always recompute artist_net_cents server-side with
// computeNetFee (T-16-29); artist_net_cents has no field in the Zod schema
// above, so a client-supplied value has nowhere to land.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const { data: existing, error: fetchError } = await service
    .from('license_requests')
    .select(ADMIN_DEAL_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
  const current = existing as LicenseRequestAdmin

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = DealPatchBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }
  const input = parsed.data

  const update: Record<string, unknown> = {}

  if (input.stage !== undefined) {
    if (!isLegalTransition(current.stage, input.stage)) {
      return NextResponse.json(
        {
          error: `Cannot move a deal from "${current.stage}" to "${input.stage}" — that transition is not legal.`,
        },
        { status: 400 }
      )
    }

    const effective = {
      gross_fee_cents: input.gross_fee_cents !== undefined ? input.gross_fee_cents : current.gross_fee_cents,
      commission_pct: input.commission_pct !== undefined ? input.commission_pct : current.commission_pct,
      contract_document_id: current.contract_document_id,
    }
    const missing = requiredFieldsForStage(input.stage).filter(field => effective[field] == null)
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot move to "${input.stage}" without ${missing
            .map(field => REQUIRED_FIELD_LABELS[field] ?? field)
            .join(' and ')}.`,
        },
        { status: 400 }
      )
    }

    update.stage = input.stage
  }

  if (input.owner_id !== undefined) {
    if (input.owner_id !== null) {
      // Deal ownership is an admin-authority field — verify the target user
      // is actually an admin before assigning, so ownership can never end
      // up pointing at a buyer or artist account.
      let ownerIsAdmin = false
      try {
        const { data: ownerUser } = await service.auth.admin.getUserById(input.owner_id)
        ownerIsAdmin =
          !!ownerUser?.user &&
          (ownerUser.user.app_metadata as { is_admin?: boolean } | undefined)?.is_admin === true
      } catch {
        ownerIsAdmin = false
      }
      if (!ownerIsAdmin) {
        return NextResponse.json({ error: 'Deal owner must be an existing admin account.' }, { status: 400 })
      }
    }
    update.owner_id = input.owner_id
  }

  if (input.admin_notes !== undefined) {
    update.admin_notes = input.admin_notes
  }

  if (input.gross_fee_cents !== undefined || input.commission_pct !== undefined) {
    const effectiveGross = input.gross_fee_cents !== undefined ? input.gross_fee_cents : current.gross_fee_cents
    const effectivePct = input.commission_pct !== undefined ? input.commission_pct : current.commission_pct

    if (input.gross_fee_cents !== undefined) update.gross_fee_cents = input.gross_fee_cents
    if (input.commission_pct !== undefined) update.commission_pct = input.commission_pct

    // Persist gross, percentage, and net together so the stored economics
    // never drift out of sync (T-16-29) — this triple is what plan 16-08's
    // Stripe split and plan 16-10's GTM averages read.
    if (effectiveGross != null && effectivePct != null) {
      const { artistNetCents } = computeNetFee(effectiveGross, effectivePct)
      update.artist_net_cents = artistNetCents
    } else {
      update.artist_net_cents = null
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No changes provided.' }, { status: 400 })
  }

  const { data: updated, error } = await service
    .from('license_requests')
    .update(update)
    .eq('id', id)
    .select(ADMIN_DEAL_COLUMNS)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  // Best-effort stage-change notifications — AFTER the primary write,
  // wrapped in try/catch, can never fail the transition (lib/social/
  // activity-emit.ts convention). Both parties who care about a deal's
  // stage learn about it: the buyer who filed it and the artist who owns
  // the target project.
  if (input.stage !== undefined) {
    try {
      const [{ data: project }, { data: adminUser }] = await Promise.all([
        service
          .from('vault_projects')
          .select('id, title, user_id')
          .eq('id', current.vault_project_id)
          .maybeSingle(),
        service.auth.admin.getUserById(auth.user.id),
      ])
      const actorName =
        (adminUser?.user?.user_metadata as { display_name?: string } | undefined)?.display_name?.trim() ||
        'Funūn'

      const recipients = new Set(
        [current.created_by, project?.user_id].filter((v): v is string => !!v)
      )
      await Promise.all(
        Array.from(recipients).map(recipientId =>
          createNotification(
            service,
            buildDealStageChangedNotification({
              recipientId,
              actorId: auth.user.id,
              actorName,
              actorAvatarUrl: null,
              newStage: input.stage!,
              projectTitle: project?.title ?? 'your project',
              licenseRequestId: id,
            })
          )
        )
      )
    } catch {
      // Notification failure must never fail the stage transition.
    }
  }

  return NextResponse.json({ data: updated })
}
