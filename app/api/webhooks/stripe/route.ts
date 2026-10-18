import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import * as Sentry from '@sentry/nextjs'
import { createServiceClient } from '@/lib/supabase/server'

// ─── POST /api/webhooks/stripe - payment + Connect account state
//     (T-16-32/T-16-37, D-17/D-17a) ────────────────────────────────────────
// Second webhook route in this codebase (first: app/api/webhooks/resend/
// route.ts) - same raw-body-first ordering: read the body as raw text
// BEFORE any parse, verify with the Stripe SDK's own constructEvent against
// STRIPE_WEBHOOK_SECRET, and only THEN act. A body parsed and
// re-serialized before verification would not byte-match what Stripe
// signed. The Resend route's svix helper is NOT reused here - it is
// Resend-specific and would misparse Stripe's headers (RESEARCH
// anti-pattern); Stripe ships its own constructEvent for this exact
// purpose.
//
// A failed signature verification returns a non-2xx with NO partial
// processing - a forged webhook must never be able to mark a deal paid
// (T-16-32). Handling is idempotent: a redelivered checkout.session.
// completed for an already-paid deal is a no-op that still returns 200,
// not a duplicate state change (T-16-37).
//
// Handled event types:
//   - checkout.session.completed and checkout.session.async_payment_succeeded:
//     a session whose payment_status is 'paid' runs completePaidCheckout()
//     (PaymentIntent retrieval + complete_license_checkout RPC). Responses:
//     400 when a paid session lacks reconciliation data, 503 when Stripe or
//     the database is unavailable, 409 when the database rejects the
//     economics or identity, otherwise 200. The 400 and 409 cases are also
//     reported to Sentry at level 'error' (money may have been captured
//     without the deal being marked paid).
//     A completed session that is 'unpaid' (a delayed method such as ACH) is
//     acknowledged with 200, writes nothing, and is reported to Sentry at
//     level 'info'; the deal stays awaiting_payment until
//     async_payment_succeeded arrives. Any other non-'paid' status (for
//     example 'no_payment_required'), or an unpaid async_payment_succeeded,
//     is acknowledged with 200, writes nothing, and is reported at level
//     'warning'.
//   - checkout.session.async_payment_failed and checkout.session.expired:
//     call reset_license_checkout (migration 247, not applied until the owner
//     does so) to move the deal back to unpaid so a new checkout can be
//     issued. The RPC only acts on a deal that is awaiting_payment or
//     creating_payment with this exact session id, so a paid deal is never
//     touched. 200 whether or not a row was reset, 503 on RPC error so
//     Stripe retries. async_payment_failed is also reported to Sentry at
//     level 'warning'; an RPC error is reported at level 'error'. Expiry
//     itself is not reported.
//   - charge.refunded and charge.dispute.*: acknowledged with 200 and
//     reported to Sentry, 'error' for charge.dispute.created and 'warning'
//     for refunds and every other dispute subtype. They are NOT persisted:
//     license_requests has no refunded/disputed state, and that schema
//     decision is pending.
//   - account.updated persists Connect capability flags.
//   - Any other verified event is acknowledged with 200 and ignored.
//
// Sentry reports carry Stripe ids and the internal deal id only (no PII). The session id is sent under
// the key checkout_ref because lib/observability/scrub.ts redacts any key
// matching /session/i. After every capture the route awaits Sentry.flush so
// the event is delivered before a serverless freeze; a flush failure never
// changes the response.
type ServiceClient = ReturnType<typeof createServiceClient>

type ReportLevel = 'info' | 'warning' | 'error'

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

// Captures a Sentry message, then flushes so it survives a serverless freeze
// right after the response. Never throws: a Sentry failure must not turn a
// verified webhook into a retry storm or change the HTTP response.
async function report(
  level: ReportLevel,
  message: string,
  stripeEvent: string,
  extra: Record<string, unknown>
): Promise<void> {
  try {
    Sentry.captureMessage(message, {
      level,
      tags: { stripe_event: stripeEvent },
      extra,
    })
    await Sentry.flush(2000)
  } catch {
    // Swallowed on purpose; see the comment above.
  }
}

function checkoutExtra(event: Stripe.Event, session: Stripe.Checkout.Session): Record<string, unknown> {
  return {
    event_id: event.id,
    checkout_ref: session.id,
    payment_intent_id: idOf(session.payment_intent),
    license_request_id: session.metadata?.license_request_id ?? null,
  }
}

// Marks a deal paid from a verified Checkout Session. Precondition: the caller
// has already confirmed session.payment_status === 'paid'. Returns null on
// success so the caller falls through to the final 200, or a NextResponse to
// return as-is.
async function completePaidCheckout(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
  stripe: Stripe,
  service: ServiceClient
): Promise<NextResponse | null> {
  const dealId = session.metadata?.license_request_id?.trim() ?? ''
  const economicsFingerprint = session.metadata?.economics_fingerprint?.trim() ?? ''
  const paymentIntentId = idOf(session.payment_intent)
  if (!dealId || !economicsFingerprint || !paymentIntentId) {
    await report(
      'error',
      'Stripe paid checkout is missing reconciliation data',
      event.type,
      checkoutExtra(event, session)
    )
    return NextResponse.json({ error: 'Payment event is missing required reconciliation data.' }, { status: 400 })
  }

  let paymentIntent: Stripe.PaymentIntent
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
  } catch {
    return NextResponse.json({ error: 'Payment verification unavailable' }, { status: 503 })
  }
  const destination = paymentIntent.transfer_data?.destination
  const destinationId = typeof destination === 'string' ? destination : destination?.id
  const { data: completed, error: paidError } = await service.rpc('complete_license_checkout', {
    p_deal_id: dealId,
    p_checkout_session_id: session.id,
    p_economics_fingerprint: economicsFingerprint,
    p_payment_intent_id: paymentIntentId,
    p_amount_cents: session.amount_total ?? -1,
    p_currency: session.currency ?? '',
    p_application_fee_cents: paymentIntent.application_fee_amount ?? -1,
    p_transfer_destination: destinationId ?? '',
  })
  if (paidError) {
    return NextResponse.json({ error: 'Persistence failed' }, { status: 503 })
  }
  if (completed !== true) {
    await report(
      'error',
      'Stripe payment reconciliation mismatch: payment captured but deal not marked paid',
      event.type,
      checkoutExtra(event, session)
    )
    return NextResponse.json({ error: 'Payment reconciliation mismatch' }, { status: 409 })
  }
  return null
}

// Moves a deal whose Checkout Session can no longer complete back to unpaid.
// Returns null to fall through to the final 200, or a 503 NextResponse so
// Stripe retries. A zero-row reset (deal paid, already reset, or on a newer
// session) is a normal no-op.
async function resetDeadCheckout(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
  service: ServiceClient
): Promise<NextResponse | null> {
  const dealId = session.metadata?.license_request_id?.trim() ?? ''
  if (!dealId) return null

  const { error: resetError } = await service.rpc('reset_license_checkout', {
    p_deal_id: dealId,
    p_checkout_session_id: session.id,
  })
  if (resetError) {
    await report('error', 'Stripe dead checkout could not be reset', event.type, checkoutExtra(event, session))
    return NextResponse.json({ error: 'Persistence failed' }, { status: 503 })
  }
  return null
}

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
  // configured - mirrors lib/stripe/connect.ts's own pattern.
  const { stripe } = await import('@/lib/stripe')

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret)
  } catch {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  const service = createServiceClient()

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.payment_status === 'paid') {
      const failure = await completePaidCheckout(event, session, stripe, service)
      if (failure) return failure
    } else if (event.type === 'checkout.session.completed' && session.payment_status === 'unpaid') {
      // Delayed-method completion: acknowledge so Stripe stops retrying. The
      // deal stays awaiting_payment until async_payment_succeeded arrives.
      await report(
        'info',
        'Stripe checkout completed with payment pending',
        event.type,
        checkoutExtra(event, session)
      )
      return NextResponse.json({ ok: true })
    } else {
      // Not expected from Checkout in payment mode (for example
      // 'no_payment_required'), and an unpaid async_payment_succeeded is
      // contradictory. Never complete the deal; make the oddity visible.
      await report('warning', 'Stripe checkout event with unexpected payment status', event.type, {
        ...checkoutExtra(event, session),
        payment_status: session.payment_status ?? null,
      })
      return NextResponse.json({ ok: true })
    }
  }

  if (
    event.type === 'checkout.session.async_payment_failed' ||
    event.type === 'checkout.session.expired'
  ) {
    const session = event.data.object as Stripe.Checkout.Session
    if (event.type === 'checkout.session.async_payment_failed') {
      await report('warning', 'Stripe async payment failed', event.type, checkoutExtra(event, session))
    }
    const failure = await resetDeadCheckout(event, session, service)
    if (failure) return failure
  }

  if (event.type === 'charge.refunded' || event.type.startsWith('charge.dispute.')) {
    const object = event.data.object as {
      id?: string
      charge?: string | { id: string } | null
      payment_intent?: string | { id: string } | null
    }
    const isDispute = event.type.startsWith('charge.dispute.')
    await report(
      event.type === 'charge.dispute.created' ? 'error' : 'warning',
      isDispute ? 'Stripe dispute event' : 'Stripe charge refunded',
      event.type,
      {
        event_id: event.id,
        object_id: object.id ?? null,
        charge_id: isDispute ? idOf(object.charge) : (object.id ?? null),
        payment_intent_id: idOf(object.payment_intent),
      }
    )
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

    // Don't ack a Connect state change we failed to persist - 5xx so Stripe
    // redelivers rather than leaving payout capability permanently stale
    // (audit #9).
    if (accountError) {
      return NextResponse.json({ error: 'Persistence failed' }, { status: 503 })
    }
  }

  // Always 200 for a verified event, handled or not - Stripe retries on
  // any non-2xx response, and an event type we don't act on legitimately
  // writes nothing (mirrors the Resend webhook's convention).
  return NextResponse.json({ ok: true })
}
