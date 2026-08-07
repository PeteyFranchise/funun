import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { buildDestinationChargeParams, createCheckoutSessionForCharge } from '@/lib/stripe/connect'

const DEAL_PAY_COLUMNS =
  'id, vault_project_id, gross_fee_cents, commission_pct, contract_document_id, payment_status'

// ─── POST /api/admin/deals/[id]/pay — create the buyer Checkout Session
//     (D-17/D-17a/D-20, T-16-34) ──────────────────────────────────────────
// Deliberately a separate route file from the deal PATCH route (16-07) so
// this plan does not collide with that one. Admin-gated: a buyer never
// creates their own charge. Refuses to proceed unless the deal has a gross
// fee, a commission percentage, a linked signed contract, and the artist
// has an onboarded connected account (payouts enabled) — a deal cannot be
// charged before it has economics and a payee. The application fee is
// ALWAYS recomputed here via buildDestinationChargeParams from the deal's
// CURRENTLY stored commission_pct — this route accepts no request body at
// all, so nothing client-supplied can influence the split (T-16-33).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const { data: deal, error: fetchError } = await service
    .from('license_requests')
    .select(DEAL_PAY_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  if (deal.payment_status === 'paid') {
    return NextResponse.json({ error: 'This deal has already been paid.' }, { status: 400 })
  }
  if (deal.gross_fee_cents == null) {
    return NextResponse.json({ error: 'Cannot charge a deal with no gross fee set.' }, { status: 400 })
  }
  if (deal.commission_pct == null) {
    return NextResponse.json(
      { error: 'Cannot charge a deal with no commission percentage set.' },
      { status: 400 }
    )
  }
  if (!deal.contract_document_id) {
    return NextResponse.json(
      { error: 'Cannot charge a deal with no linked signed contract.' },
      { status: 400 }
    )
  }

  const { data: project, error: projectError } = await service
    .from('vault_projects')
    .select('user_id')
    .eq('id', deal.vault_project_id)
    .maybeSingle()

  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 })
  if (!project?.user_id) return NextResponse.json({ error: 'Deal has no owning artist.' }, { status: 400 })

  const { data: artistProfile, error: profileError } = await service
    .from('user_profiles')
    .select('stripe_connect_account_id, stripe_connect_payouts_enabled')
    .eq('id', project.user_id)
    .maybeSingle()

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
  if (!artistProfile?.stripe_connect_account_id || !artistProfile.stripe_connect_payouts_enabled) {
    return NextResponse.json(
      { error: 'The artist on this deal has not finished Stripe Connect onboarding yet.' },
      { status: 400 }
    )
  }

  let session
  try {
    const chargeParams = buildDestinationChargeParams(deal, artistProfile.stripe_connect_account_id)

    const origin = new URL(request.url).origin
    session = await createCheckoutSessionForCharge(chargeParams, {
      successUrl: `${origin}/sync/requests/${id}?payment=success`,
      cancelUrl: `${origin}/sync/requests/${id}?payment=cancelled`,
      description: `Funūn sync license — deal ${id}`,
      licenseRequestId: id,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not create the Stripe checkout session.' },
      { status: 400 }
    )
  }

  const { error: updateError } = await service
    .from('license_requests')
    .update({
      payment_status: 'awaiting_payment',
      stripe_checkout_session_id: session.id,
    })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ url: session.url })
}
