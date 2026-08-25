// Tests for the PartyPicker fast-add auto-invite decision helpers
// (260825-i4i follow-up, lib/collaborators/auto-invite.ts). PartyPicker
// itself is a 'use client' component and this repo has no jsdom test
// environment, so the two pure decisions it wires the invite call through
// are extracted here and covered directly. Component wiring is covered by
// tsc/lint/build only.

import { isAutoInviteEligible, extractAutoInviteLink } from '@/lib/collaborators/auto-invite'

describe('isAutoInviteEligible', () => {
  it('is eligible when the fast-added party has an email', () => {
    expect(isAutoInviteEligible({ email: 'jane@example.com' })).toBe(true)
  })

  it('is NOT eligible for a phone-only party (email null)', () => {
    expect(isAutoInviteEligible({ email: null })).toBe(false)
  })

  it('is NOT eligible for a phone-only party (email undefined)', () => {
    expect(isAutoInviteEligible({})).toBe(false)
  })

  it('is NOT eligible when email is an empty/whitespace string', () => {
    expect(isAutoInviteEligible({ email: '' })).toBe(false)
    expect(isAutoInviteEligible({ email: '   ' })).toBe(false)
  })
})

describe('extractAutoInviteLink', () => {
  it('surfaces the link on a fresh successful invite', () => {
    const link = extractAutoInviteLink(
      { ok: true },
      { ok: true, inviteLink: '/signup?invite=abc', emailSent: true }
    )
    expect(link).toBe('/signup?invite=abc')
  })

  it('surfaces the existing link on a cooldown-reuse response (skipped: true)', () => {
    const link = extractAutoInviteLink(
      { ok: true },
      { ok: true, inviteLink: '/signup?invite=existing', emailSent: false, skipped: true }
    )
    expect(link).toBe('/signup?invite=existing')
  })

  it('surfaces the link even when the email itself failed to send (emailSent: false)', () => {
    const link = extractAutoInviteLink(
      { ok: true },
      { ok: true, inviteLink: '/signup?invite=noemail', emailSent: false }
    )
    expect(link).toBe('/signup?invite=noemail')
  })

  it('returns null on a non-ok response (e.g. 500 insert failure) — never blocks the add', () => {
    const link = extractAutoInviteLink({ ok: false }, { error: 'insert failed' })
    expect(link).toBeNull()
  })

  it('returns null when the body is null (e.g. res.json() itself failed to parse)', () => {
    const link = extractAutoInviteLink({ ok: true }, null)
    expect(link).toBeNull()
  })

  it('returns null when ok but the body carries no inviteLink', () => {
    const link = extractAutoInviteLink({ ok: true }, { ok: true })
    expect(link).toBeNull()
  })
})
