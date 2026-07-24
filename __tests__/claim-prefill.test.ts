import {
  shouldPrefill,
  pickWinningSource,
  buildClaimPrefillEntry,
  type ClaimPrefillEntry,
} from '@/lib/profile/claim-prefill'

describe('shouldPrefill (idempotency guard)', () => {
  it('pre-fills a blank field that has never been claimed', () => {
    expect(shouldPrefill('', undefined)).toBe(true)
  })

  it('never overwrites a confirmed entry, even if the canonical value is still blank', () => {
    const confirmed: ClaimPrefillEntry = {
      confirmed: true,
      source_collaborator_id: 'collab-1',
      source_name: 'Maya',
      filled_at: '2026-01-01T00:00:00Z',
    }
    expect(shouldPrefill('', confirmed)).toBe(false)
  })

  it('never overwrites a non-blank (owned) canonical value with no existing entry', () => {
    expect(shouldPrefill('ASCAP', undefined)).toBe(false)
  })

  it('never overwrites a non-blank canonical value even with an unconfirmed prior entry (edited since fill)', () => {
    const unconfirmed: ClaimPrefillEntry = {
      confirmed: false,
      source_collaborator_id: 'collab-1',
      source_name: 'Maya',
      filled_at: '2026-01-01T00:00:00Z',
    }
    expect(shouldPrefill('ASCAP', unconfirmed)).toBe(false)
  })

  it('re-fills a still-blank, still-unconfirmed field on re-run (idempotent, not a permanent lock)', () => {
    const unconfirmed: ClaimPrefillEntry = {
      confirmed: false,
      source_collaborator_id: 'collab-1',
      source_name: 'Maya',
      filled_at: '2026-01-01T00:00:00Z',
    }
    expect(shouldPrefill('', unconfirmed)).toBe(true)
  })

  it('supports json-kind blank checks for mailing_address-shaped fields', () => {
    expect(shouldPrefill({}, undefined, 'json')).toBe(true)
    expect(shouldPrefill({ line1: 'x' }, undefined, 'json')).toBe(false)
  })
})

describe('pickWinningSource (source conflict resolution)', () => {
  it('resolves conflicting sources to the most-recent by updated_at', () => {
    const winner = pickWinningSource([
      { value: 'BMI', updated_at: '2026-01-01' },
      { value: 'ASCAP', updated_at: '2026-06-01' },
    ])
    expect(winner?.value).toBe('ASCAP')
  })

  it('is order-independent (latest wins regardless of array position)', () => {
    const winner = pickWinningSource([
      { value: 'ASCAP', updated_at: '2026-06-01' },
      { value: 'BMI', updated_at: '2026-01-01' },
    ])
    expect(winner?.value).toBe('ASCAP')
  })

  it('returns null for an empty candidate list', () => {
    expect(pickWinningSource([])).toBeNull()
  })

  it('returns the single candidate when only one source exists', () => {
    const winner = pickWinningSource([{ value: 'ASCAP', updated_at: '2026-01-01' }])
    expect(winner?.value).toBe('ASCAP')
  })
})

describe('buildClaimPrefillEntry (provenance shape)', () => {
  it('produces an unconfirmed entry carrying the inviting-artist source_name (D-03), not a song title', () => {
    const entry = buildClaimPrefillEntry('collab-1', 'Maya', '2026-07-24T00:00:00Z')
    expect(entry.confirmed).toBe(false)
    expect(entry.source_collaborator_id).toBe('collab-1')
    expect(entry.source_name).toBe('Maya')
    expect(entry.filled_at).toBe('2026-07-24T00:00:00Z')
  })
})
