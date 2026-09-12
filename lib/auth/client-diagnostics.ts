'use client'

import {
  AuthDiagnosticSchema,
  authCopyWithReference,
  createAuthCorrelationId,
  type AuthDiagnosticEvent,
} from '@/lib/auth/diagnostics'

type BrowserAuthDiagnostic = Omit<
  AuthDiagnosticEvent,
  'correlationId' | 'runtime'
>

export function reportBrowserAuthFailure(
  event: BrowserAuthDiagnostic,
  publicCopy: string
): string {
  const correlationId = reportBrowserAuthEvent(event)
  return authCopyWithReference(publicCopy, correlationId)
}

export function reportBrowserAuthEvent(event: BrowserAuthDiagnostic): string {
  const correlationId = createAuthCorrelationId()
  const payload = AuthDiagnosticSchema.parse({
    ...event,
    correlationId,
    runtime: 'browser',
  })

  void fetch('/api/auth/diagnostics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined)

  return correlationId
}
