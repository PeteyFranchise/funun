// ─── Minimal structured-logging convention ──────────────────────────
// Standardizes the repo's scattered `requestId` usage (see
// lib/esign/webhook.ts) into one correlation-ID-tagged JSON-line log,
// without a pino/winston footprint. The R6 safety guarantee here is
// STRUCTURAL, not a runtime check: logWithCorrelation's signature accepts
// only a typed safe-field object — there is no parameter typed as an
// arbitrary record/object map, so a caller has no path to pass a raw
// sensitive payload through this function. This is the counterpart to
// lib/observability/scrub.ts, which defends the Sentry SDK path where
// arbitrary exception payloads DO arrive and must be scrubbed after the
// fact; this logger simply never accepts what it can't safely emit.

/** Distinguishes an expected user-facing error from an unexpected operational failure. */
export type LogKind = 'user_error' | 'operational_failure'

/** The only fields a log line may carry — an explicit safe-field allowlist. */
export type LogFields = {
  route: string
  status: number
  durationMs: number
  kind: LogKind
}

/**
 * Emits exactly one JSON line to stdout: { correlationId, ts, route,
 * status, durationMs, kind }. No raw-record parameter exists in this
 * signature, so arbitrary/sensitive data cannot reach this function.
 */
export function logWithCorrelation(correlationId: string, fields: LogFields): void {
  const line = {
    correlationId,
    ts: new Date().toISOString(),
    route: fields.route,
    status: fields.status,
    durationMs: fields.durationMs,
    kind: fields.kind,
  }
  console.log(JSON.stringify(line))
}
