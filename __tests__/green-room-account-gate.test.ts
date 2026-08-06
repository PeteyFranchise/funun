// Tests for the Green Room app-layer account-type gate (Plan 28-02):
//   - greenRoomViewerGate() / greenRoomPosterGate() are pure predicates — no
//     Supabase mock needed, mirroring __tests__/capability-route-guard.test.ts's
//     pure-predicate coverage style.
//   - isFununStaffPrincipal() is the inert/forward-safe stand-in for the
//     unshipped funun_staff table (Phase 25 has zero runtime code — RESEARCH
//     Runtime State Inventory).
//
// INDUSTRY-02: Green Room access is member_type IN ('artist','industry').
// INDUSTRY-07: a Funūn-staff email may not post under the Funūn identity.

import {
  greenRoomViewerGate,
  greenRoomPosterGate,
  isFununStaffPrincipal,
} from '@/lib/green-room/access'

describe('greenRoomViewerGate', () => {
  it('admits an artist member_type', () => {
    expect(greenRoomViewerGate({ memberType: 'artist' })).toEqual({ ok: true })
  })

  it('admits an industry member_type', () => {
    expect(greenRoomViewerGate({ memberType: 'industry' })).toEqual({ ok: true })
  })

  it('rejects a null member_type (buyer / no-profile) with 403', () => {
    const result = greenRoomViewerGate({ memberType: null })
    expect(result.ok).toBe(false)
    expect((result as { status: number }).status).toBe(403)
  })

  it('rejects any non-artist/industry member_type value with 403', () => {
    const result = greenRoomViewerGate({ memberType: 'buyer' })
    expect(result.ok).toBe(false)
    expect((result as { status: number }).status).toBe(403)
  })
})

describe('greenRoomPosterGate', () => {
  it('admits an industry member_type with a non-Funūn email', () => {
    expect(greenRoomPosterGate({ memberType: 'industry', email: 'a@gmail.com' })).toEqual({ ok: true })
  })

  it('rejects a Funūn-staff email even with a valid member_type (INDUSTRY-07)', () => {
    const result = greenRoomPosterGate({ memberType: 'artist', email: 'staff@funun.studio' })
    expect(result.ok).toBe(false)
    expect((result as { status: number }).status).toBe(403)
  })

  it('rejects a null member_type with 403', () => {
    const result = greenRoomPosterGate({ memberType: null, email: 'x@x.com' })
    expect(result.ok).toBe(false)
    expect((result as { status: number }).status).toBe(403)
  })
})

describe('isFununStaffPrincipal', () => {
  it('returns true for a funun.studio email', () => {
    expect(isFununStaffPrincipal('a@funun.studio')).toBe(true)
  })

  it('returns false for a non-funun email', () => {
    expect(isFununStaffPrincipal('a@gmail.com')).toBe(false)
  })

  it('returns false for null', () => {
    expect(isFununStaffPrincipal(null)).toBe(false)
  })
})
