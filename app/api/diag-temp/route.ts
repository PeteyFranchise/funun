import { NextResponse } from 'next/server'

// ─── TEMPORARY diagnostic (2026-08-25) ────────────────────────────────────
// Added to determine why production's transactional email never reaches
// Resend (lib/email's sendEmail short-circuits with "Email not configured"
// when RESEND_API_KEY / RESEND_FROM_EMAIL are absent at runtime).
//
// Secret-safe by construction: reports only presence, a length, and the
// PUBLIC sender address — never a key value. Gated behind a one-off token so
// it discloses nothing to an anonymous caller.
//
// DELETE THIS ROUTE once the Resend production config is confirmed working.
const DIAG_TOKEN = 'r3s3nd-check-8f21'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get('diag') !== DIAG_TOKEN) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    resendKeyPresent: !!process.env.RESEND_API_KEY,
    resendKeyLength: (process.env.RESEND_API_KEY ?? '').length,
    resendKeyPrefix: (process.env.RESEND_API_KEY ?? '').slice(0, 3),
    resendFrom: process.env.RESEND_FROM_EMAIL ?? null,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  })
}
