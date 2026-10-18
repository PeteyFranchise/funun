import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyResendWebhook } from '@/lib/webhooks/resend-verify'

// POST /api/webhooks/resend — the first webhook route in this codebase
// (D-15). The signature MUST be verified against the raw, unparsed request
// body before any DB write (RESEARCH Pitfall 2 + the forged-webhook threat,
// T-06-16): every other route in this app calls request.json() first, but
// that call reads-then-parses the body, and a parsed-then-reserialized
// object rarely reproduces the exact bytes Resend signed. So this route
// reads the body as raw text FIRST, verifies it, and only then treats it as
// JSON. Degrades to 503 (not a crash) when RESEND_WEBHOOK_SECRET is unset
// (D-22) — this is not yet configured in this environment.
export async function POST(request: Request) {
  const raw = await request.text()

  const headers = {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  }

  const result = verifyResendWebhook(raw, headers)
  if (!result.ok) {
    return NextResponse.json({ error: 'Webhook verification failed' }, { status: result.status })
  }

  const event = result.event

  if (event.type === 'email.bounced') {
    const bounceType = event.data.bounce?.type ?? event.data.bounce_type
    if (bounceType === 'HardBounce') {
      const recipient = event.data.to?.[0] ?? event.data.email
      if (recipient) {
        const service = createServiceClient()
        const normalized = recipient.trim().toLowerCase()
        // Curator emails are normalized to lowercase everywhere they're
        // written; match the same normalization here so casing differences
        // in what Resend reports don't silently match zero rows (WR-09).
        const { data: updated, error } = await service
          .from('curators')
          .update({ email_valid: false })
          .eq('email', normalized)
          .select('id')

        if (error) {
          // Acknowledging a failed persistence step would permanently lose
          // the bounce because Resend retries only non-2xx deliveries.
          return NextResponse.json({ error: 'Could not record the hard bounce' }, { status: 500 })
        }

        // App-wide suppression (GH #190): sendEmail() skips every address in
        // email_suppressions, for any recipient class, not just curators.
        // This runs AFTER the curator flag on purpose: if the table is
        // missing (migration 243 unapplied) the curator invalidation that
        // already worked must not regress. Both writes are idempotent, so a
        // Resend retry after a failure here redoes them safely;
        // ignoreDuplicates keeps the first event id on conflict. A missing
        // table also 500s here, which is correct: Resend keeps retrying
        // until the owner applies the migration, so no bounce is lost.
        // Only the first recipient is suppressed: a bounce event is per
        // recipient, and suppressing every `to` entry would over-suppress.
        const { error: suppressionError } = await service
          .from('email_suppressions')
          .upsert(
            {
              email: normalized,
              reason: 'hard_bounce',
              source_event_id: headers['svix-id'] || null,
            },
            { onConflict: 'email', ignoreDuplicates: true }
          )
        if (suppressionError) {
          return NextResponse.json({ error: 'Could not record the hard bounce' }, { status: 500 })
        }

        if (!updated || updated.length === 0) {
          // The suppression is already recorded above; only the curator flag
          // had nothing to match. An address that is not in the curator
          // directory is not a persistence failure and must not be retried
          // forever.
          return NextResponse.json({ ok: true, ignored: true })
        }
      }
    }
  }

  // A verified event that either needs no write or was durably applied can
  // be acknowledged. Transient persistence failures return above as 5xx.
  return NextResponse.json({ ok: true })
}
