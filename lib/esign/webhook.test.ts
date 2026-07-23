// RED-first tests for verifyDocusealSignature + parseDocusealEvent (ESIGN-07).
// Pure crypto — constructs valid/invalid signatures with Node's own `crypto`
// against a fixture secret. No live DocuSeal account or network call.

import { createHmac } from 'crypto'
import { verifyDocusealSignature, parseDocusealEvent, WEBHOOK_STALENESS_WINDOW_SECONDS } from './webhook'

const SECRET = 'fixture-webhook-secret'

/** Builds a valid `{timestamp}.{hexHmac}` header for a given raw body + timestamp. */
function sign(rawBody: string, timestampSeconds: number, secret = SECRET): string {
  const hex = createHmac('sha256', secret).update(`${timestampSeconds}.${rawBody}`).digest('hex')
  return `${timestampSeconds}.${hex}`
}

describe('verifyDocusealSignature', () => {
  const rawBody = JSON.stringify({ event_type: 'submission.completed', data: { id: 'sub_123' } })

  it('returns true for a valid HMAC within the staleness window', () => {
    const now = Math.floor(Date.now() / 1000)
    const header = sign(rawBody, now)
    expect(verifyDocusealSignature(rawBody, header, SECRET, now)).toBe(true)
  })

  it('returns false when the body is tampered after signing', () => {
    const now = Math.floor(Date.now() / 1000)
    const header = sign(rawBody, now)
    const tamperedBody = JSON.stringify({ event_type: 'submission.completed', data: { id: 'sub_999' } })
    expect(verifyDocusealSignature(tamperedBody, header, SECRET, now)).toBe(false)
  })

  it('returns false for a stale timestamp (older than 5 minutes)', () => {
    const now = Math.floor(Date.now() / 1000)
    const staleTimestamp = now - (WEBHOOK_STALENESS_WINDOW_SECONDS + 10)
    const header = sign(rawBody, staleTimestamp)
    expect(verifyDocusealSignature(rawBody, header, SECRET, now)).toBe(false)
  })

  it('accepts a timestamp exactly at the staleness boundary', () => {
    const now = Math.floor(Date.now() / 1000)
    const boundaryTimestamp = now - WEBHOOK_STALENESS_WINDOW_SECONDS
    const header = sign(rawBody, boundaryTimestamp)
    expect(verifyDocusealSignature(rawBody, header, SECRET, now)).toBe(true)
  })

  it('returns false for a stale timestamp from the future too', () => {
    const now = Math.floor(Date.now() / 1000)
    const futureTimestamp = now + (WEBHOOK_STALENESS_WINDOW_SECONDS + 10)
    const header = sign(rawBody, futureTimestamp)
    expect(verifyDocusealSignature(rawBody, header, SECRET, now)).toBe(false)
  })

  it('returns false for a missing header', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(verifyDocusealSignature(rawBody, undefined, SECRET, now)).toBe(false)
    expect(verifyDocusealSignature(rawBody, null, SECRET, now)).toBe(false)
    expect(verifyDocusealSignature(rawBody, '', SECRET, now)).toBe(false)
  })

  it('returns false for a malformed header', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(verifyDocusealSignature(rawBody, 'not-a-valid-header', SECRET, now)).toBe(false)
    expect(verifyDocusealSignature(rawBody, '.onlysignature', SECRET, now)).toBe(false)
    expect(verifyDocusealSignature(rawBody, `${now}.`, SECRET, now)).toBe(false)
    expect(verifyDocusealSignature(rawBody, `notanumber.abcd1234`, SECRET, now)).toBe(false)
  })

  it('returns false when signed with the wrong secret', () => {
    const now = Math.floor(Date.now() / 1000)
    const header = sign(rawBody, now, 'a-different-secret')
    expect(verifyDocusealSignature(rawBody, header, SECRET, now)).toBe(false)
  })

  it('returns false when the signature has the correct length but differs only in the last byte', () => {
    // Regression guard against short-circuiting `===`/byte-by-byte compares
    // that could leak timing info — the implementation must always run a
    // full-length constant-time compare (crypto.timingSafeEqual), so an
    // almost-correct signature is rejected exactly like a wildly wrong one.
    const now = Math.floor(Date.now() / 1000)
    const validHeader = sign(rawBody, now)
    const [ts, hex] = validHeader.split('.')
    const lastChar = hex.at(-1)
    const flippedChar = lastChar === '0' ? '1' : '0'
    const almostRightHex = hex.slice(0, -1) + flippedChar
    expect(verifyDocusealSignature(rawBody, `${ts}.${almostRightHex}`, SECRET, now)).toBe(false)
  })
})

describe('parseDocusealEvent', () => {
  it('maps submission.completed to all_signed with the requestId', () => {
    const event = parseDocusealEvent({ event_type: 'submission.completed', data: { id: 'sub_123' } })
    expect(event).toEqual({ type: 'all_signed', requestId: 'sub_123' })
  })

  it('maps form.completed (per-signer completion) to signed with requestId + signerEmail', () => {
    const event = parseDocusealEvent({
      event_type: 'form.completed',
      data: { submission_id: 'sub_123', email: 'party@example.com' },
    })
    expect(event).toEqual({ type: 'signed', requestId: 'sub_123', signerEmail: 'party@example.com' })
  })

  it('maps form.declined to declined', () => {
    const event = parseDocusealEvent({ event_type: 'form.declined', data: { id: 'sub_123' } })
    expect(event.type).toBe('declined')
    expect(event.requestId).toBe('sub_123')
  })

  it('maps an unknown event type to other rather than throwing', () => {
    const event = parseDocusealEvent({ event_type: 'template.created', data: { id: 'tpl_1' } })
    expect(event.type).toBe('other')
  })

  it('does not throw on a malformed/empty payload', () => {
    expect(() => parseDocusealEvent(null)).not.toThrow()
    expect(() => parseDocusealEvent(undefined)).not.toThrow()
    expect(() => parseDocusealEvent({})).not.toThrow()
    expect(parseDocusealEvent({}).type).toBe('other')
  })
})
