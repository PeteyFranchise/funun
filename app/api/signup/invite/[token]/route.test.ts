import { createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { GET } from './route'

// ─── GET /api/signup/invite/[token] (27-06 Task 2) ─────────────────────────
// Integration test with a mocked service client, mirroring
// app/api/waitlist/route.test.ts's conventions. Covers: artist_invites hit,
// collaborator_invites fallback hit (checked only when artist_invites
// misses), not-found -> 404, expired token -> expired:true, best-effort
// inviter-name resolution via user_profiles, and the ip rate limit.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

// Limiter is DB-backed (audit #7) — mock it; counting is covered in
// lib/security/rate-limit.test.ts.
jest.mock('@/lib/security/rate-limit', () => ({
  ...jest.requireActual('@/lib/security/rate-limit'),
  checkRateLimit: jest.fn(),
}))

function jsonGet(token: string, headers: Record<string, string> = {}) {
  return GET(new Request(`http://t.local/api/signup/invite/${token}`, { headers }), {
    params: Promise.resolve({ token }),
  })
}

type Row = Record<string, unknown> | null

function mockService(options: {
  artistInvite?: Row
  collaboratorInvite?: Row
  userProfile?: Row
}) {
  const { artistInvite = null, collaboratorInvite = null, userProfile = null } = options

  const artistInvitesSpy = jest.fn()
  const collaboratorInvitesSpy = jest.fn()
  const userProfilesSpy = jest.fn()

  const from = jest.fn((table: string) => {
    if (table === 'artist_invites') {
      artistInvitesSpy()
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: artistInvite, error: null })),
          })),
        })),
      }
    }
    if (table === 'collaborator_invites') {
      collaboratorInvitesSpy()
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: collaboratorInvite, error: null })),
          })),
        })),
      }
    }
    if (table === 'user_profiles') {
      userProfilesSpy()
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: userProfile, error: null })),
          })),
        })),
      }
    }
    return {}
  })

  return { from, artistInvitesSpy, collaboratorInvitesSpy, userProfilesSpy }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(checkRateLimit as jest.Mock).mockResolvedValue(false)
})

describe('GET /api/signup/invite/[token]', () => {
  it('resolves a token found in artist_invites with inviter name + not expired', async () => {
    const futureIso = new Date(Date.now() + 1000 * 60 * 60).toISOString()
    const service = mockService({
      artistInvite: {
        email: 'invitee@example.test',
        token_expires_at: futureIso,
        invited_by_user_id: 'staffer-uuid',
      },
      userProfile: { artist_name: 'Staffer Name' },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await jsonGet('tok-artist-1', { 'x-forwarded-for': '40.0.0.1' })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      email: 'invitee@example.test',
      inviterName: 'Staffer Name',
      expired: false,
    })
    expect(service.collaboratorInvitesSpy).not.toHaveBeenCalled()
  })

  it('falls back to collaborator_invites when artist_invites misses', async () => {
    const futureIso = new Date(Date.now() + 1000 * 60 * 60).toISOString()
    const service = mockService({
      artistInvite: null,
      collaboratorInvite: {
        invited_email: 'collab@example.test',
        token_expires_at: futureIso,
        inviting_user_id: 'artist-uuid',
      },
      userProfile: { artist_name: 'Inviting Artist' },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await jsonGet('tok-collab-1', { 'x-forwarded-for': '40.0.0.2' })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      email: 'collab@example.test',
      inviterName: 'Inviting Artist',
      expired: false,
    })
    expect(service.artistInvitesSpy).toHaveBeenCalled()
    expect(service.collaboratorInvitesSpy).toHaveBeenCalled()
  })

  it('returns a generic 404 when the token matches neither table', async () => {
    const service = mockService({ artistInvite: null, collaboratorInvite: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await jsonGet('tok-unknown', { 'x-forwarded-for': '40.0.0.3' })

    expect(res.status).toBe(404)
  })

  it('returns expired:true when token_expires_at is in the past', async () => {
    const pastIso = new Date(Date.now() - 1000 * 60 * 60).toISOString()
    const service = mockService({
      artistInvite: {
        email: 'expired@example.test',
        token_expires_at: pastIso,
        invited_by_user_id: null,
      },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await jsonGet('tok-expired', { 'x-forwarded-for': '40.0.0.4' })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      email: 'expired@example.test',
      inviterName: null,
      expired: true,
    })
  })

  it('resolves inviterName:null when invited_by_user_id is absent (never throws)', async () => {
    const futureIso = new Date(Date.now() + 1000 * 60 * 60).toISOString()
    const service = mockService({
      artistInvite: {
        email: 'no-inviter@example.test',
        token_expires_at: futureIso,
        invited_by_user_id: null,
      },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await jsonGet('tok-no-inviter', { 'x-forwarded-for': '40.0.0.5' })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.inviterName).toBeNull()
    expect(service.userProfilesSpy).not.toHaveBeenCalled()
  })

  it('returns 429 when the limiter reports the request is rate-limited', async () => {
    const service = mockService({ artistInvite: null, collaboratorInvite: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(checkRateLimit as jest.Mock).mockResolvedValue(true)

    const res = await jsonGet('tok', { 'x-forwarded-for': '40.0.1.1' })

    expect(res.status).toBe(429)
    expect(service.artistInvitesSpy).not.toHaveBeenCalled()
  })
})
