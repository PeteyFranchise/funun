// Tests for envelope lifecycle helpers: the monthly NEW-RECIPIENT cap
// (AM-2c / ESIGN-13), fast-lane backfill (P17-01), and void reset
// (P17-02). Pure shape/decision helpers — no Supabase client.
//
// The cap suite was rewritten for AM-2c (2026-07-20). It previously
// asserted a ~10-document/month ceiling; that ceiling is retired, and the
// album regression below is the test that would have caught why.

import {
  MONTHLY_NEW_RECIPIENT_CAP,
  VOIDED_ENVELOPES_COUNT_TOWARD_CAP,
  checkNewRecipientCap,
  envelopeCountsTowardCap,
  normalizeRecipient,
  buildFastLaneBackfill,
  buildVoidReset,
} from './envelopes'

describe('MONTHLY_NEW_RECIPIENT_CAP', () => {
  it('is 25 new recipients per calendar month (AM-2c, confirmed 2026-07-20)', () => {
    expect(MONTHLY_NEW_RECIPIENT_CAP).toBe(25)
  })
})

describe('the retired document cap (AM-2c)', () => {
  it('no longer exports a document/envelope ceiling', async () => {
    const envelopes: Record<string, unknown> = await import('./envelopes')
    expect(envelopes).not.toHaveProperty('MONTHLY_ENVELOPE_CAP')
    expect(envelopes).not.toHaveProperty('checkMonthlyCap')
  })
})

describe('normalizeRecipient', () => {
  it('trims and lowercases so one collaborator is never counted twice', () => {
    expect(normalizeRecipient('  Sam@Example.COM ')).toBe('sam@example.com')
  })

  it('maps absent values to an empty string', () => {
    expect(normalizeRecipient(null)).toBe('')
    expect(normalizeRecipient(undefined)).toBe('')
  })
})

describe('envelopeCountsTowardCap', () => {
  it('counts pending and completed envelopes', () => {
    expect(envelopeCountsTowardCap('pending')).toBe(true)
    expect(envelopeCountsTowardCap('completed')).toBe(true)
  })

  it('excludes voided envelopes while VOIDED_ENVELOPES_COUNT_TOWARD_CAP is false', () => {
    expect(VOIDED_ENVELOPES_COUNT_TOWARD_CAP).toBe(false)
    expect(envelopeCountsTowardCap('voided')).toBe(false)
  })
})

describe('checkNewRecipientCap (AM-2c)', () => {
  it('counts only recipients the initiator has never sent a sheet to', () => {
    const result = checkNewRecipientCap({
      priorRecipients: ['ana@band.com', 'ben@band.com'],
      newRecipientsThisMonth: ['ana@band.com'],
      outgoingRecipients: ['ana@band.com', 'ben@band.com', 'newcomer@example.com'],
    })

    expect(result.newRecipients).toEqual(['newcomer@example.com'])
    expect(result.spentThisMonth).toBe(1)
    expect(result.projectedCount).toBe(2)
    expect(result.allowed).toBe(true)
  })

  it('REGRESSION (AM-2c): a 12-track album to the same 3 bandmates never blocks', () => {
    const band = ['ana@band.com', 'ben@band.com', 'cy@band.com']
    // Every track after the first sends to an entirely known roster. A
    // document cap blocked this at track 11; P18-15 needs a sheet per
    // track, so it must succeed twelve times over.
    for (let track = 0; track < 12; track++) {
      const result = checkNewRecipientCap({
        priorRecipients: band,
        newRecipientsThisMonth: band,
        outgoingRecipients: band,
      })
      expect(result.newRecipients).toEqual([])
      expect(result.allowed).toBe(true)
    }
  })

  it('allows an all-known mint even when the month is already AT the cap', () => {
    const spent = Array.from({ length: MONTHLY_NEW_RECIPIENT_CAP }, (_, i) => `p${i}@x.com`)
    const result = checkNewRecipientCap({
      priorRecipients: spent,
      newRecipientsThisMonth: spent,
      outgoingRecipients: ['p0@x.com', 'p1@x.com'],
    })

    expect(result.projectedCount).toBe(MONTHLY_NEW_RECIPIENT_CAP)
    expect(result.allowed).toBe(true)
  })

  it('allows the mint that lands exactly ON the cap', () => {
    const spent = Array.from({ length: MONTHLY_NEW_RECIPIENT_CAP - 1 }, (_, i) => `p${i}@x.com`)
    const result = checkNewRecipientCap({
      priorRecipients: spent,
      newRecipientsThisMonth: spent,
      outgoingRecipients: ['stranger@example.com'],
    })

    expect(result.projectedCount).toBe(MONTHLY_NEW_RECIPIENT_CAP)
    expect(result.allowed).toBe(true)
  })

  it('blocks the mint that would push the month one past the cap', () => {
    const spent = Array.from({ length: MONTHLY_NEW_RECIPIENT_CAP }, (_, i) => `p${i}@x.com`)
    const result = checkNewRecipientCap({
      priorRecipients: spent,
      newRecipientsThisMonth: spent,
      outgoingRecipients: ['stranger@example.com'],
    })

    expect(result.projectedCount).toBe(MONTHLY_NEW_RECIPIENT_CAP + 1)
    expect(result.allowed).toBe(false)
  })

  it('blocks a single mint that introduces more strangers than the whole allowance (T-17-16)', () => {
    const strangers = Array.from({ length: MONTHLY_NEW_RECIPIENT_CAP + 1 }, (_, i) => `s${i}@spam.com`)
    const result = checkNewRecipientCap({
      priorRecipients: [],
      newRecipientsThisMonth: [],
      outgoingRecipients: strangers,
    })

    expect(result.allowed).toBe(false)
  })

  it('de-duplicates repeated and differently-cased addresses within one mint', () => {
    const result = checkNewRecipientCap({
      priorRecipients: [],
      newRecipientsThisMonth: [],
      outgoingRecipients: ['Sam@X.com', 'sam@x.com', ' SAM@x.com '],
    })

    expect(result.newRecipients).toEqual(['sam@x.com'])
    expect(result.projectedCount).toBe(1)
  })

  it('treats a known recipient as known regardless of case', () => {
    const result = checkNewRecipientCap({
      priorRecipients: ['Ana@Band.com'],
      newRecipientsThisMonth: [],
      outgoingRecipients: ['ana@band.com'],
    })

    expect(result.newRecipients).toEqual([])
  })

  it('ignores blank and absent addresses rather than counting them as recipients', () => {
    const result = checkNewRecipientCap({
      priorRecipients: [],
      newRecipientsThisMonth: [],
      outgoingRecipients: ['', '   ', null, undefined, 'real@example.com'],
    })

    expect(result.newRecipients).toEqual(['real@example.com'])
  })

  it('ignores a month entry that is not in the all-time prior set', () => {
    const result = checkNewRecipientCap({
      priorRecipients: ['ana@band.com'],
      newRecipientsThisMonth: ['ana@band.com', 'voided-only@example.com'],
      outgoingRecipients: ['ana@band.com'],
    })

    expect(result.spentThisMonth).toBe(1)
  })

  it('honors a custom cap override (admin bump)', () => {
    const result = checkNewRecipientCap({
      priorRecipients: [],
      newRecipientsThisMonth: [],
      outgoingRecipients: ['a@x.com', 'b@x.com', 'c@x.com'],
      cap: 2,
    })

    expect(result.cap).toBe(2)
    expect(result.allowed).toBe(false)
  })

  it('re-counts a voided-only recipient as new, since the void spent no allowance', () => {
    // The mint route filters history through envelopeCountsTowardCap, so a
    // voided attempt's recipients never enter priorRecipients at all.
    const result = checkNewRecipientCap({
      priorRecipients: [],
      newRecipientsThisMonth: [],
      outgoingRecipients: ['was-voided@example.com'],
    })

    expect(result.newRecipients).toEqual(['was-voided@example.com'])
    expect(result.allowed).toBe(true)
  })
})

describe('buildFastLaneBackfill (P17-01 signature ⊃ approval)', () => {
  it('sets every party to approved and the sheet to esign_pending', () => {
    const now = '2026-07-20T12:00:00.000Z'
    const backfill = buildFastLaneBackfill(now)
    expect(backfill.partyUpdate).toEqual({ approval_status: 'approved', approved_at: now })
    expect(backfill.sheetUpdate).toEqual({ status: 'esign_pending', all_approved_at: now })
  })
})

describe('buildVoidReset (P17-02)', () => {
  it('marks the envelope voided (not deleted)', () => {
    const now = '2026-07-20T12:00:00.000Z'
    const reset = buildVoidReset(now, false)
    expect(reset.envelopeUpdate).toEqual({ status: 'voided', voided_at: now })
  })

  it('resets the sheet to countered when a counter exists', () => {
    const reset = buildVoidReset('2026-07-20T12:00:00.000Z', true)
    expect(reset.sheetUpdate).toEqual({ status: 'countered' })
  })

  it('resets the sheet to pending_approval when no counter exists', () => {
    const reset = buildVoidReset('2026-07-20T12:00:00.000Z', false)
    expect(reset.sheetUpdate).toEqual({ status: 'pending_approval' })
  })
})
