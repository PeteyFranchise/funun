import { NextResponse } from 'next/server'
import { AuthDiagnosticSchema } from '@/lib/auth/diagnostics'
import { recordAuthDiagnosticEvent } from '@/lib/auth/diagnostic-store'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { createServiceClient } from '@/lib/supabase/server'

const MAX_BODY_BYTES = 1024

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.startsWith('application/json')) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 415 })
  }

  const declaredLength = Number(request.headers.get('content-length'))
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_BODY_BYTES
  ) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 413 })
  }

  // Fixed-key admission deliberately stores no IP, email, user ID, or browser
  // fingerprint. Diagnostics are best-effort; exhausting this shared budget
  // can suppress telemetry but can never authorize or block authentication.
  const limited = await checkRateLimit('auth-diagnostics:global', {
    windowMs: 60 * 60 * 1000,
    maxAttempts: 5000,
    failClosed: true,
  })
  if (limited) return new NextResponse(null, { status: 202 })

  const parsed = AuthDiagnosticSchema.safeParse(
    await request.json().catch(() => null)
  )
  if (!parsed.success || parsed.data.runtime !== 'browser') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Deliberately acknowledge even when storage is not activated or available.
  // Authentication must never depend on its diagnostic side channel.
  try {
    await recordAuthDiagnosticEvent(createServiceClient(), parsed.data)
  } catch {
    // The public auth flow never depends on diagnostics infrastructure.
  }
  return new NextResponse(null, { status: 202 })
}
