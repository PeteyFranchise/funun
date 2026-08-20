import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/server'

// ─── POST /api/webhooks/stripe — payment + Connect account state
//     (T-16-32/T-16-37, D-17/D-17a) ────────────────────────────────────────
// Second webhook route in this codebase (first: app/api/webhooks/resend/
// route.ts) — same raw-body-first ordering: read the body as raw text
// BEFORE any parse, verify with the Stripe SDK's own constructEvent against
// STRIPE_WEBHOOK_SECRET, and only THEN act. A body parsed and
// re-serialized before verification would not byte-match what Stripe
// signed. The Resend route's svix helper is NOT reused here — it is
// Resend-specific and would misparse Stripe's headers (RESEARCH
// anti-pattern); Stripe ships its own constructEvent for this exact
// purpose.
//
// A failed signature verification returns a non-2xx with NO partial
// processing — a forged webhook must never be able to mark a deal paid
// (T-16-32). Handling is idempotent: a redelivered checkout.session.
// completed for an already-paid deal is a no-op that still returns 200,
// not a duplicate state change (T-16-37).
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    // Degrades gracefully (mirrors the Resend webhook's 503 convention)
    // rather than crashing when the webhook hasn't been configured yet in
    // this environment.
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  }

  const raw = await request.text()
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  // Dynamically imported so this route only reaches lib/stripe/index.ts's
  // STRIPE_SECRET_KEY guard once we already know STRIPE_WEBHOOK_SECRET is
  // configured — mirrors lib/stripe/connect.ts's own pattern.
  const { stripe } = await import('@/lib/stripe')

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret)
  } catch {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  const service = createServiceClient()

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const paymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null)

    const { data: deal, error: dealError } = await service
      .from('license_requests')
      .select('id, payment_status')
      .eq('stripe_checkout_session_id', session.id)
      .maybeSingle()

    // A transient DB read error must NOT be swallowed as "unknown session"
    // — return a retryable 5xx so Stripe redelivers, rather than
    // permanently leaving a paid deal marked unpaid (audit #9).
    if (dealError) {
      return NextResponse.json({ error: 'Persistence unavailable' }, { status: 503 })
    }

    // Idempotent: no deal found (unknown session) or already paid ->
    // no-op, falls through to the 200 below either way (T-16-37).
    if (deal && deal.payment_status !== 'paid') {
      const { error: paidError } = await service
        .from('license_requests')
        .update({
          payment_status: 'paid',
          stripe_payment_intent_id: paymentIntentId,
          paid_at: new Date().toISOString(),
        })
        .eq('id', deal.id)

      // Persisting the paid state is the whole point of this event — if it
      // fails, 5xx so Stripe retries instead of losing the payment record.
      if (paidError) {
        return NextResponse.json({ error: 'Persistence failed' }, { status: 503 })
      }
    }
  }

  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account

    const { error: accountError } = await service
      .from('user_profiles')
      .update({
        stripe_connect_charges_enabled: !!account.charges_enabled,
        stripe_connect_payouts_enabled: !!account.payouts_enabled,
        stripe_connect_details_submitted: !!account.details_submitted,
      })
      .eq('stripe_connect_account_id', account.id)

    // Don't ack a Connect state change we failed to persist — 5xx so Stripe
    // redelivers rather than leaving payout capability permanently stale
    // (audit #9).
    if (accountError) {
      return NextResponse.json({ error: 'Persistence failed' }, { status: 503 })
    }
  }

  // Always 200 for a verified event, handled or not — Stripe retries on
  // any non-2xx response, and an event type we don't act on legitimately
  // writes nothing (mirrors the Resend webhook's convention).
  return NextResponse.json({ ok: true })
}
