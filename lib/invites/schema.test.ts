import {
  ARTIST_INVITE_SOURCE_VALUES,
  ARTIST_INVITE_STATUS_VALUES,
  sanitizeWaitlistEntry,
} from './schema'

// ─── lib/invites/schema.ts contract (Phase 27-01 Task 2) ──────────────────
// Locks the invite/waitlist field vocabularies + the waitlist sanitizer's
// mass-assignment defense. Pure, no I/O — mirrors
// lib/buyers/register.test.ts's pure-function style.

describe('ARTIST_INVITE_SOURCE_VALUES / ARTIST_INVITE_STATUS_VALUES', () => {
  it('exports the source vocabulary', () => {
    expect(ARTIST_INVITE_SOURCE_VALUES).toEqual([
      'collaborator',
      'staff',
      'waitlist_conversion',
      'owner_seed',
    ])
  })

  it('exports the status vocabulary', () => {
    expect(ARTIST_INVITE_STATUS_VALUES).toEqual(['pending', 'accepted', 'expired'])
  })
})

describe('sanitizeWaitlistEntry', () => {
  it('accepts a valid entry', () => {
    const result = sanitizeWaitlistEntry({
      email: 'artist@example.com',
      name: 'Jamie Rivera',
      note: 'Found you on Instagram',
    })
    expect(result).toEqual({
      ok: true,
      value: { email: 'artist@example.com', name: 'Jamie Rivera', note: 'Found you on Instagram' },
    })
  })

  it('trims surrounding whitespace on name and note', () => {
    const result = sanitizeWaitlistEntry({
      email: 'artist@example.com',
      name: '  Jamie Rivera  ',
      note: '  hello  ',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.name).toBe('Jamie Rivera')
    expect(result.value.note).toBe('hello')
  })

  it('lowercases the email', () => {
    const result = sanitizeWaitlistEntry({ email: 'Jamie.Rivera@Example.COM', name: 'Jamie Rivera' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.email).toBe('jamie.rivera@example.com')
  })

  it('allows note to be omitted (defaults to empty string)', () => {
    const result = sanitizeWaitlistEntry({ email: 'artist@example.com', name: 'Jamie Rivera' })
    expect(result).toEqual({
      ok: true,
      value: { email: 'artist@example.com', name: 'Jamie Rivera', note: '' },
    })
  })

  // L3 (27-CODEX-REVIEW.md): name is required server-side — the signup
  // page's waitlist form already marks it `required` client-side; this
  // closes the client/server parity gap.
  it('rejects a missing name', () => {
    const result = sanitizeWaitlistEntry({ email: 'artist@example.com' })
    expect(result).toEqual({ ok: false, error: 'A name is required.' })
  })

  it('rejects a whitespace-only name', () => {
    const result = sanitizeWaitlistEntry({ email: 'artist@example.com', name: '   ' })
    expect(result).toEqual({ ok: false, error: 'A name is required.' })
  })

  it('caps name length at 200 characters (L3)', () => {
    const longName = 'x'.repeat(300)
    const result = sanitizeWaitlistEntry({ email: 'artist@example.com', name: longName })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.name.length).toBe(200)
    expect(result.value.name).toBe('x'.repeat(200))
  })

  it('rejects an email longer than 254 characters (L3)', () => {
    const longEmail = `${'x'.repeat(250)}@a.co`
    const result = sanitizeWaitlistEntry({ email: longEmail, name: 'Jamie Rivera' })
    expect(result).toEqual({ ok: false, error: 'A valid email is required.' })
  })

  it('rejects a missing email', () => {
    const result = sanitizeWaitlistEntry({ name: 'Jamie Rivera' })
    expect(result).toEqual({ ok: false, error: 'A valid email is required.' })
  })

  it('rejects an empty-string email', () => {
    const result = sanitizeWaitlistEntry({ email: '' })
    expect(result).toEqual({ ok: false, error: 'A valid email is required.' })
  })

  it('rejects a malformed email', () => {
    const result = sanitizeWaitlistEntry({ email: 'not-an-email' })
    expect(result).toEqual({ ok: false, error: 'A valid email is required.' })
  })

  it('rejects a whitespace-only email', () => {
    const result = sanitizeWaitlistEntry({ email: '   ' })
    expect(result).toEqual({ ok: false, error: 'A valid email is required.' })
  })

  it('caps note length at 1000 characters', () => {
    const longNote = 'x'.repeat(1500)
    const result = sanitizeWaitlistEntry({ email: 'artist@example.com', name: 'Jamie Rivera', note: longNote })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.note.length).toBe(1000)
    expect(result.value.note).toBe('x'.repeat(1000))
  })

  it('coerces a non-string note to a string', () => {
    const result = sanitizeWaitlistEntry({ email: 'artist@example.com', name: 'Jamie Rivera', note: 12345 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.note).toBe('12345')
  })

  it('drops keys outside the email/name/note allowlist (mass-assignment defense)', () => {
    const polluted = {
      email: 'artist@example.com',
      name: 'Jamie Rivera',
      note: 'hi',
      status: 'accepted',
      unsubscribed_at: null,
      id: 'attacker-controlled-id',
    }
    const result = sanitizeWaitlistEntry(polluted)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.value).sort()).toEqual(['email', 'name', 'note'])
  })

  it('rejects non-object input', () => {
    const result = sanitizeWaitlistEntry('not-an-object')
    expect(result).toEqual({ ok: false, error: 'A valid email is required.' })
  })

  it('rejects null input', () => {
    const result = sanitizeWaitlistEntry(null)
    expect(result).toEqual({ ok: false, error: 'A valid email is required.' })
  })
})
