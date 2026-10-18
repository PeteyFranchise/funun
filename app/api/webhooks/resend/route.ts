import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { normalizeEmailAddress } from '@/lib/email/suppression'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyResendWebhook } from '@/lib/webhooks/resend-verify'

// Resend's bounce classes, per https://resend.com/docs/webhooks/emails/bounced
// (`data.bounce.type`): "Permanent" means the recipient's server permanently
// rejected the mail, which is the only class that justifies suppressing an
// address. Anything else ("Transient", "Undetermined", "Temporary", or a
// value we do not recognise) may succeed later, so it writes nothing.
// "HardBounce" is kept for back-compat with the value this route originally
// looked for; Resend does not document it. Compared case-insensitively.
const HARD_BOUNCE_TYPES = new Set(['permanent', 'hardbounce'])

function isHardBounce(bounceType: unknown): boolean {
  return typeof bounceType === 'string' && HARD_BOUNCE_TYPES.has(bounceType.trim().toLowerCase())
}

// A 500 here is how Resend learns to retry, but nobody reads Resend's retry
// log. Report it so a stuck write (e.g. migration 246 unapplied) is visible.
// Tags only: the recipient address is PII and is never sent.
function reportWriteFailure(
  operation: 'curator-write' | 'suppression-write',
  eventType: string,
  error: { code?: string }
) {
  Sentry.captureMessage('Resend webhook write failed', {
    level: 'error',
    tags: {
      feature: 'resend-webhook',
      operation,
      event_type: eventType,
      ...(error.code ? { pg_code: error.code } : {}),
    },
  })
}

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

  // email.bounced (permanent class only) and email.complained both suppress
  // the recipient app-wide; only a bounce also invalidates a curator.
  const isBounce = event.type === 'email.bounced' && isHardBounce(event.data.bounce?.type)
  const isComplaint = event.type === 'email.complained'
  if (!isBounce && !isComplaint) {
    return NextResponse.json({ ok: true })
  }

  // Resend documents `to` as the array of impacted recipients without saying
  // whether a multi-recipient send reports one event per address or one event
  // listing them all. If it lists several, nothing in the payload says which
  // address bounced, and suppressing the wrong one silently blocks a healthy
  // address while the bad one keeps getting mail. So with anything other than
  // exactly one recipient, suppress nothing and report it (no addresses).
  const recipients = event.data.to ?? []
  if (recipients.length !== 1) {
    Sentry.captureMessage('Resend webhook event has an ambiguous recipient list', {
      level: 'warning',
      tags: {
        feature: 'resend-webhook',
        operation: 'ambiguous-recipients',
        event_type: event.type,
        recipient_count: String(recipients.length),
      },
    })
    return NextResponse.json({ ok: true, ignored: true })
  }

  // The same normalization sendEmail() applies before its lookup, so a
  // display-name `to` ("Name <a@b.c>") lands on the row sendEmail will find.
  const normalized = normalizeEmailAddress(recipients[0])
  if (!normalized) return NextResponse.json({ ok: true, ignored: true })

  const service = createServiceClient()

  let curatorMatched = true
  if (isBounce) {
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
      reportWriteFailure('curator-write', event.type, error)
      return NextResponse.json({ error: 'Could not record the hard bounce' }, { status: 500 })
    }
    curatorMatched = !!updated && updated.length > 0
  }

  // App-wide suppression (GH #190): sendEmail() skips every address in
  // email_suppressions, for any recipient class, not just curators.
  // This runs AFTER the curator flag on purpose: if the table is
  // missing (migration 246 unapplied) the curator invalidation that
  // already worked must not regress. Both writes are idempotent, so a
  // Resend retry after a failure here redoes them safely;
  // ignoreDuplicates keeps the first event id on conflict. A missing
  // table also 500s here, which is correct: Resend keeps retrying
  // until the owner applies the migration, so no bounce is lost.
  const { error: suppressionError } = await service
    .from('email_suppressions')
    .upsert(
      {
        email: normalized,
        reason: isBounce ? 'hard_bounce' : 'complaint',
        source_event_id: headers['svix-id'] || null,
      },
      { onConflict: 'email', ignoreDuplicates: true }
    )
  if (suppressionError) {
    reportWriteFailure('suppression-write', event.type, suppressionError)
    return NextResponse.json(
      { error: isBounce ? 'Could not record the hard bounce' : 'Could not record the complaint' },
      { status: 500 }
    )
  }

  if (!curatorMatched) {
    // The suppression is already recorded above; only the curator flag
    // had nothing to match. An address that is not in the curator
    // directory is not a persistence failure and must not be retried
    // forever.
    return NextResponse.json({ ok: true, ignored: true })
  }

  // A verified event that either needs no write or was durably applied can
  // be acknowledged. Transient persistence failures return above as 5xx.
  return NextResponse.json({ ok: true })
}
