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
        await service.from('curators').update({ email_valid: false }).eq('email', recipient)
      }
    }
  }

  // Always 200 for a verified event, bounce or not — Resend retries on any
  // non-2xx response, and a non-bounce event legitimately writes nothing.
  return NextResponse.json({ ok: true })
}
