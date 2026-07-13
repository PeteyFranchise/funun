// Tests for the Phase-10 connect state-transition payload builders
// (lib/social/connections.ts). Pure unit tests — no Supabase client
// involved, no mocking needed.
//
// RED (Task 1): lib/social/connections.ts does not exist yet — this file
// MUST fail on module resolution. Task 3 makes it GREEN.

import { buildConnectRequest, buildRespondTransition } from '@/lib/social/connections'
import { readFileSync } from 'fs'
import path from 'path'

// ─── buildConnectRequest ─────────────────────────────────────────────────

describe('buildConnectRequest', () => {
  it('returns the insert payload with a trimmed note', () => {
    const result = buildConnectRequest('req-1', 'addr-1', '  Loved your last single!  ')

    expect(result).toEqual({
      requester_id: 'req-1',
      addressee_id: 'addr-1',
      note: 'Loved your last single!',
    })
  })

  it('coerces an empty/whitespace note to null', () => {
    expect(buildConnectRequest('req-1', 'addr-1', '   ')).toEqual({
      requester_id: 'req-1',
      addressee_id: 'addr-1',
      note: null,
    })

    expect(buildConnectRequest('req-1', 'addr-1', undefined)).toEqual({
      requester_id: 'req-1',
      addressee_id: 'addr-1',
      note: null,
    })
  })

  it('rejects a note longer than 200 characters', () => {
    const tooLong = 'x'.repeat(201)
    expect(() => buildConnectRequest('req-1', 'addr-1', tooLong)).toThrow(/200/)
  })

  it('accepts a note of exactly 200 characters', () => {
    const exact = 'x'.repeat(200)
    expect(buildConnectRequest('req-1', 'addr-1', exact)).toEqual({
      requester_id: 'req-1',
      addressee_id: 'addr-1',
      note: exact,
    })
  })

  it('rejects requesterId === addresseeId (self-request)', () => {
    expect(() => buildConnectRequest('same-id', 'same-id', null)).toThrow(/yourself|self/i)
  })
})

// ─── buildRespondTransition ──────────────────────────────────────────────

describe('buildRespondTransition', () => {
  it('maps accept -> accepted', () => {
    expect(buildRespondTransition('accept')).toBe('accepted')
  })

  it('maps decline -> declined', () => {
    expect(buildRespondTransition('decline')).toBe('declined')
  })

  it('maps withdraw -> withdrawn', () => {
    expect(buildRespondTransition('withdraw')).toBe('withdrawn')
  })

  it('rejects any other action string', () => {
    expect(() => buildRespondTransition('approve')).toThrow()
  })
})

// ─── database invariant ──────────────────────────────────────────────────────

describe('connections active-pair uniqueness migration', () => {
  it('enforces one active connection per unordered member pair', () => {
    const migration = readFileSync(
      path.join(process.cwd(), 'supabase/migrations/050_connections_symmetric_active_pair.sql'),
      'utf8'
    )

    expect(migration).toContain('connections_active_unordered_pair_uniq')
    expect(migration).toContain('LEAST(requester_id, addressee_id)')
    expect(migration).toContain('GREATEST(requester_id, addressee_id)')
    expect(migration).toContain("WHERE status IN ('pending', 'accepted')")
  })
})
