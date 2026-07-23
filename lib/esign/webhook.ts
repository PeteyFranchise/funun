// ─── DocuSeal webhook verification + event parsing ───────────────────
// Pure module: Node built-in crypto only, no fetch, no Supabase. The live
// webhook route (17-07) wires I/O (raw body read, DB writes) around these
// two functions — this file owns zero side effects so it's fully unit-
// testable without a DocuSeal account (ESIGN-07).
//
// Signature scheme (CONFIRMED against DocuSeal's official "Use Webhooks"
// doc, 2026-07-20, during the provider-verification pass): the
// `X-Docuseal-Signature` header is `{timestampSeconds}.{hexHmac}` where
// hexHmac = HMAC-SHA256(secret, `${timestampSeconds}.${rawBody}`). The
// timestamp is UNIX SECONDS (their sample uses Date.now()/1000), NOT
// milliseconds — the provisional 17-01 implementation assumed ms, which
// would have rejected every genuine webhook as stale. 5-minute tolerance;
// secret is the dashboard's whsec_-prefixed value used as-is as the HMAC
// key. Comparison is always constant-time via crypto.timingSafeEqual —
// never a plain === on hex digests (V6 Cryptography).

import { createHmac, timingSafeEqual } from 'crypto'
import type { EsignWebhookEvent } from './provider'

/** Reject a signature whose timestamp is more than this far from "now" (seconds). */
export const WEBHOOK_STALENESS_WINDOW_SECONDS = 5 * 60

/**
 * Verifies a DocuSeal webhook signature against the raw request body.
 *
 * @param rawBody  The exact raw request body bytes as a string — MUST be the
 *                  untouched body, never a re-serialized JSON.parse'd copy
 *                  (re-serialization can reorder keys/whitespace and break
 *                  the HMAC).
 * @param header      The `X-Docuseal-Signature` header value: `{timestampSeconds}.{hexHmac}`.
 * @param secret      The shared webhook secret (DOCUSEAL_WEBHOOK_SECRET, whsec_-prefixed, used as-is).
 * @param nowSeconds  Injectable clock in UNIX SECONDS for testability; defaults to Date.now()/1000.
 */
export function verifyDocusealSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!header || typeof header !== 'string') return false

  const separatorIndex = header.indexOf('.')
  if (separatorIndex <= 0 || separatorIndex === header.length - 1) return false

  const timestampPart = header.slice(0, separatorIndex)
  const signaturePart = header.slice(separatorIndex + 1)
  if (!/^\d+$/.test(timestampPart) || !/^[0-9a-f]+$/i.test(signaturePart)) return false

  const timestampSeconds = Number(timestampPart)
  if (!Number.isFinite(timestampSeconds)) return false
  if (Math.abs(nowSeconds - timestampSeconds) > WEBHOOK_STALENESS_WINDOW_SECONDS) return false

  const expectedHex = createHmac('sha256', secret).update(`${timestampPart}.${rawBody}`).digest('hex')

  const expectedBuf = Buffer.from(expectedHex, 'hex')
  const actualBuf = Buffer.from(signaturePart, 'hex')
  if (expectedBuf.length !== actualBuf.length || expectedBuf.length === 0) return false

  return timingSafeEqual(expectedBuf, actualBuf)
}

// ─── Webhook event parsing ─────────────────────────────────────────────
// Researched event catalog (RESEARCH Assumption A2): submission.completed,
// form.completed, form.declined, plus others (form.viewed, form.started,
// submission.created, submission.archived, submission.expired,
// template.created, template.updated) that all fall through to 'other'
// so the route never throws on an event Funūn doesn't yet act on.

/** Extracts the DocuSeal submission id from a loosely-shaped event payload. */
function extractRequestId(data: Record<string, unknown>): string {
  if (typeof data.submission_id === 'string') return data.submission_id
  if (typeof data.id === 'string') return data.id
  const submission = data.submission as Record<string, unknown> | undefined
  if (submission && typeof submission.id === 'string') return submission.id
  return ''
}

/**
 * Maps a DocuSeal webhook payload to the shared EsignWebhookEvent shape
 * (the SAME type every provider's webhook route returns — no re-implementation
 * per provider). Tolerates unknown event types by returning 'other' rather
 * than throwing.
 */
export function parseDocusealEvent(payload: unknown): EsignWebhookEvent {
  const o = (payload ?? {}) as Record<string, unknown>
  const eventType = typeof o.event_type === 'string' ? o.event_type : ''
  const data = (o.data ?? {}) as Record<string, unknown>
  const requestId = extractRequestId(data)

  if (eventType === 'submission.completed') {
    return { type: 'all_signed', requestId }
  }
  if (eventType === 'form.completed') {
    const signerEmail = typeof data.email === 'string' ? data.email : undefined
    return { type: 'signed', requestId, signerEmail }
  }
  if (eventType === 'form.declined') {
    return { type: 'declined', requestId }
  }
  return { type: 'other', requestId }
}
