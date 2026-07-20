// ─── DocuSeal webhook verification + event parsing ───────────────────
// Pure module: Node built-in crypto only, no fetch, no Supabase. The live
// webhook route (17-07) wires I/O (raw body read, DB writes) around these
// two functions — this file owns zero side effects so it's fully unit-
// testable without a DocuSeal account (ESIGN-07).
//
// Signature scheme: DocuSeal's `X-Docuseal-Signature` header is
// `{timestampMs}.{hexHmac}` where hexHmac = HMAC-SHA256(secret,
// `${timestampMs}.${rawBody}`) — per RESEARCH Security Domain ("Use
// Webhooks" doc: HMAC-SHA256 scheme, 5-minute staleness rule). Comparison
// is always constant-time via crypto.timingSafeEqual — never a plain ===
// on hex digests (V6 Cryptography).

import { createHmac, timingSafeEqual } from 'crypto'
import type { EsignWebhookEvent } from './provider'

/** Reject a signature whose timestamp is more than this far from "now" (ms). */
export const WEBHOOK_STALENESS_WINDOW_MS = 5 * 60 * 1000

/**
 * Verifies a DocuSeal webhook signature against the raw request body.
 *
 * @param rawBody  The exact raw request body bytes as a string — MUST be the
 *                  untouched body, never a re-serialized JSON.parse'd copy
 *                  (re-serialization can reorder keys/whitespace and break
 *                  the HMAC).
 * @param header   The `X-Docuseal-Signature` header value: `{timestampMs}.{hexHmac}`.
 * @param secret   The shared webhook secret (DOCUSEAL_WEBHOOK_SECRET).
 * @param nowMs    Injectable clock for testability; defaults to Date.now().
 */
export function verifyDocusealSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  nowMs: number = Date.now()
): boolean {
  if (!header || typeof header !== 'string') return false

  const separatorIndex = header.indexOf('.')
  if (separatorIndex <= 0 || separatorIndex === header.length - 1) return false

  const timestampPart = header.slice(0, separatorIndex)
  const signaturePart = header.slice(separatorIndex + 1)
  if (!/^\d+$/.test(timestampPart) || !/^[0-9a-f]+$/i.test(signaturePart)) return false

  const timestampMs = Number(timestampPart)
  if (!Number.isFinite(timestampMs)) return false
  if (Math.abs(nowMs - timestampMs) > WEBHOOK_STALENESS_WINDOW_MS) return false

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
