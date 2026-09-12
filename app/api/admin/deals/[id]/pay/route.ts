import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import {
  buildDestinationChargeParams,
  checkoutEconomicsFingerprint,
  createCheckoutSessionForCharge,
} from '@/lib/stripe/connect'

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

  if (fetchError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
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

  if (projectError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!project?.user_id) return NextResponse.json({ error: 'Deal has no owning artist.' }, { status: 400 })

  const { data: artistProfile, error: profileError } = await service
    .from('user_profiles')
    .select('stripe_connect_account_id, stripe_connect_payouts_enabled')
    .eq('id', project.user_id)
    .maybeSingle()

  if (profileError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!artistProfile?.stripe_connect_account_id || !artistProfile.stripe_connect_payouts_enabled) {
    return NextResponse.json(
      { error: 'The artist on this deal has not finished Stripe Connect onboarding yet.' },
      { status: 400 }
    )
  }

  const chargeParams = buildDestinationChargeParams(deal, artistProfile.stripe_connect_account_id)
  const economicsFingerprint = checkoutEconomicsFingerprint(id, chargeParams)
  const claimToken = randomUUID()
  const { data: claimRows, error: claimError } = await service.rpc('claim_license_checkout', {
    p_deal_id: id,
    p_claim_token: claimToken,
    p_economics_fingerprint: economicsFingerprint,
    p_lease_seconds: 300,
  })
  if (claimError) {
    return NextResponse.json({ error: 'Payment setup is temporarily unavailable.' }, { status: 503 })
  }
  const claim = (claimRows as
    | { outcome: string; checkout_session_id: string | null; checkout_url: string | null }[]
    | null)?.[0]
  if (!claim || claim.outcome === 'not_found') {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
  }
  if (claim.outcome === 'paid') {
    return NextResponse.json({ error: 'This deal has already been paid.' }, { status: 409 })
  }
  if (claim.outcome === 'busy') {
    return NextResponse.json({ error: 'Payment setup is already in progress. Try again shortly.' }, { status: 409 })
  }
  if (claim.outcome === 'existing') {
    if (claim.checkout_url) return NextResponse.json({ url: claim.checkout_url })
    return NextResponse.json(
      { error: 'An active payment session already exists. Refresh the deal before trying again.' },
      { status: 409 }
    )
  }

  let session
  try {
    const origin = new URL(request.url).origin
    session = await createCheckoutSessionForCharge(chargeParams, {
      successUrl: `${origin}/sync/requests/${id}?payment=success`,
      cancelUrl: `${origin}/sync/requests/${id}?payment=cancelled`,
      description: `Funūn sync license — deal ${id}`,
      licenseRequestId: id,
      economicsFingerprint,
    })
  } catch {
    await service.rpc('release_license_checkout_claim', {
      p_deal_id: id,
      p_claim_token: claimToken,
    })
    return NextResponse.json({ error: 'Could not create the payment session.' }, { status: 502 })
  }

  const { data: finalized, error: updateError } = await service.rpc('finalize_license_checkout', {
    p_deal_id: id,
    p_claim_token: claimToken,
    p_economics_fingerprint: economicsFingerprint,
    p_checkout_session_id: session.id,
    p_checkout_url: session.url ?? '',
  })

  if (updateError || finalized !== true) {
    return NextResponse.json(
      { error: 'Payment session was created but could not be attached. Contact support.' },
      { status: 503 }
    )
  }

  return NextResponse.json({ url: session.url })
}
