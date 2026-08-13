// ─── Correlation-ID convention ──────────────────────────────────────
// Generalizes the ad-hoc `requestId` idiom already established in
// lib/esign/webhook.ts (extractRequestId + typed discriminated-union
// result) into a request-scoped, provider-agnostic helper. Every request
// gets/propagates its OWN id — this is the R6 concurrency guarantee: two
// concurrent calls with no propagated header must never share a value.
// randomUUID() is per-call, so there is no shared mutable state to race on.

import { randomUUID } from 'crypto'

/** Canonical request-correlation header, read from and threaded through requests. */
export const CORRELATION_HEADER = 'x-correlation-id'

/**
 * Returns the propagated x-correlation-id header value when present,
 * otherwise mints a fresh UUID. Never returns a shared/cached value across
 * calls — each invocation with no propagated header produces its own id.
 */
export function getOrCreateCorrelationId(headers: Headers): string {
  const propagated = headers.get(CORRELATION_HEADER)
  if (propagated) return propagated
  return randomUUID()
}
