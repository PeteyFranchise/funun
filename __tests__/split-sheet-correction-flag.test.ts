import { readFileSync } from 'fs'
import path from 'path'
import { POST as correctionFlagPOST } from '@/app/api/split-sheets/[id]/correction-flag/route'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(async () => ({ ok: true })),
}))

const SHEET_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OWNER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const CLAIMED_USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const OTHER_USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const PARTY_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const COLLABORATOR_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

function jsonRequest(body: unknown) {
  return new Request(`http://t.local/api/split-sheets/${SHEET_ID}/correction-flag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function sessionClient(userId: string | null) {
  return {
    auth: { getUser: jest.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
  }
}

type SheetFixture = {
  status: string
  initiatorUserId: string
  party: {
    id: string
    collaboratorId: string | null
    userId: string | null
    name: string
  }
}

function buildServiceClient(
  sheet: SheetFixture | null,
  opts: {
    claimedBy?: string | null
    insertResult?: { data: { id: string } | null; error: { message: string } | null }
  } = {}
) {
  const insertResult = opts.insertResult ?? { data: { id: 'flag-1' }, error: null }
  const insertSpy = jest.fn(() => ({
    select: jest.fn(() => ({
      single: jest.fn(async () => insertResult),
    })),
  }))

  const from = jest.fn((table: string) => {
    if (table === 'split_sheets') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: sheet
                ? {
                    id: SHEET_ID,
                    status: sheet.status,
                    initiator_user_id: sheet.initiatorUserId,
                    song_name: 'Test Song',
                    split_sheet_parties: [
                      {
                        id: sheet.party.id,
                        collaborator_id: sheet.party.collaboratorId,
                        user_id: sheet.party.userId,
                        name: sheet.party.name,
                      },
                    ],
                  }
                : null,
              error: null,
            })),
          })),
        })),
      }
    }
    if (table === 'collaborators') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: opts.claimedBy !== undefined ? { claimed_by: opts.claimedBy } : null,
              error: null,
            })),
          })),
        })),
      }
    }
    if (table === 'split_sheet_identity_flags') {
      return { insert: insertSpy }
    }
    throw new Error(`Unexpected table in test: ${table}`)
  })

  return {
    from,
    auth: {
      admin: {
        getUserById: jest.fn(async () => ({ data: { user: { email: 'owner@example.com' } } })),
      },
    },
    __insertSpy: insertSpy,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /api/split-sheets/[id]/correction-flag', () => {
  it('requires authentication', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(sessionClient(null))

    const res = await correctionFlagPOST(jsonRequest({ partyId: PARTY_ID, field: 'pro', suggestedValue: 'ASCAP' }), {
      params: Promise.resolve({ id: SHEET_ID }),
    })
    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('rejects a non-allowlisted field before touching the service client', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(sessionClient(CLAIMED_USER_ID))

    const res = await correctionFlagPOST(
      jsonRequest({ partyId: PARTY_ID, field: 'split_percentage', suggestedValue: '50' }),
      { params: Promise.resolve({ id: SHEET_ID }) }
    )
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('rejects the "role" field — deal terms are never flaggable', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(sessionClient(CLAIMED_USER_ID))

    const res = await correctionFlagPOST(jsonRequest({ partyId: PARTY_ID, field: 'role', suggestedValue: 'lyrics' }), {
      params: Promise.resolve({ id: SHEET_ID }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects a blank suggestedValue', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(sessionClient(CLAIMED_USER_ID))

    const res = await correctionFlagPOST(jsonRequest({ partyId: PARTY_ID, field: 'pro', suggestedValue: '   ' }), {
      params: Promise.resolve({ id: SHEET_ID }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects a sheet that is not frozen (draft/pending_approval/approved/countered)', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(sessionClient(CLAIMED_USER_ID))
    const service = buildServiceClient({
      status: 'approved',
      initiatorUserId: OWNER_ID,
      party: { id: PARTY_ID, collaboratorId: null, userId: CLAIMED_USER_ID, name: 'Claimed User' },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await correctionFlagPOST(jsonRequest({ partyId: PARTY_ID, field: 'pro', suggestedValue: 'ASCAP' }), {
      params: Promise.resolve({ id: SHEET_ID }),
    })
    expect(res.status).toBe(409)
    expect(service.__insertSpy).not.toHaveBeenCalled()
  })

  it('rejects a partyId that is not on this sheet', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(sessionClient(CLAIMED_USER_ID))
    const service = buildServiceClient({
      status: 'executed',
      initiatorUserId: OWNER_ID,
      party: { id: PARTY_ID, collaboratorId: null, userId: CLAIMED_USER_ID, name: 'Claimed User' },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await correctionFlagPOST(
      jsonRequest({ partyId: 'not-a-real-party-id', field: 'pro', suggestedValue: 'ASCAP' }),
      { params: Promise.resolve({ id: SHEET_ID }) }
    )
    expect(res.status).toBe(404)
    expect(service.__insertSpy).not.toHaveBeenCalled()
  })

  // ── Authorization-negative test (R4 core): a user who is neither the
  // party's direct account holder NOR the claimed collaborator on that
  // party's roster row must never be able to write a flag against it. ────
  it('rejects a user who is not the claimed party on this row (cross-user authority)', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(sessionClient(OTHER_USER_ID))
    const service = buildServiceClient(
      {
        status: 'executed',
        initiatorUserId: OWNER_ID,
        party: { id: PARTY_ID, collaboratorId: COLLABORATOR_ID, userId: null, name: 'Claimed User' },
      },
      { claimedBy: CLAIMED_USER_ID }
    )
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await correctionFlagPOST(jsonRequest({ partyId: PARTY_ID, field: 'pro', suggestedValue: 'ASCAP' }), {
      params: Promise.resolve({ id: SHEET_ID }),
    })
    expect(res.status).toBe(403)
    expect(service.__insertSpy).not.toHaveBeenCalled()
  })

  it('accepts the claimed user directly (party.user_id) and derives flagged_by from the session, not the body', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(sessionClient(CLAIMED_USER_ID))
    const service = buildServiceClient({
      status: 'esign_pending',
      initiatorUserId: OWNER_ID,
      party: { id: PARTY_ID, collaboratorId: null, userId: CLAIMED_USER_ID, name: 'Claimed User' },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await correctionFlagPOST(
      jsonRequest({
        partyId: PARTY_ID,
        field: 'pro',
        suggestedValue: 'ASCAP',
        // spoof attempt — must be ignored; flagged_by is always the session user
        flaggedBy: OTHER_USER_ID,
        userId: OTHER_USER_ID,
      }),
      { params: Promise.resolve({ id: SHEET_ID }) }
    )
    expect(res.status).toBe(200)
    expect(service.__insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        split_sheet_party_id: PARTY_ID,
        flagged_by: CLAIMED_USER_ID,
        field: 'pro',
        suggested_value: 'ASCAP',
      })
    )
  })

  it('accepts a claimed collaborator (resolved via collaborators.claimed_by) on a frozen sheet', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(sessionClient(CLAIMED_USER_ID))
    const service = buildServiceClient(
      {
        status: 'executed',
        initiatorUserId: OWNER_ID,
        party: { id: PARTY_ID, collaboratorId: COLLABORATOR_ID, userId: null, name: 'Claimed User' },
      },
      { claimedBy: CLAIMED_USER_ID }
    )
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await correctionFlagPOST(jsonRequest({ partyId: PARTY_ID, field: 'legal_name', suggestedValue: 'Jane Q. Doe' }), {
      params: Promise.resolve({ id: SHEET_ID }),
    })
    expect(res.status).toBe(200)
    expect(service.__insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ flagged_by: CLAIMED_USER_ID, field: 'legal_name' })
    )
  })
})

// ── Static source assertions (R4 Prohibitions) ────────────────────────────
describe('correction-flag route — static authorization guarantees', () => {
  const routeSource = readFileSync(
    path.join(process.cwd(), 'app/api/split-sheets/[id]/correction-flag/route.ts'),
    'utf8'
  )

  it('FLAGGABLE_FIELDS excludes split_percentage/role and every non-identity field', () => {
    const match = routeSource.match(/FLAGGABLE_FIELDS = \[([^\]]+)\]/)
    expect(match).not.toBeNull()
    const fields = (match as RegExpMatchArray)[1]
      .split(',')
      .map(s => s.trim().replace(/'/g, ''))
      .filter(Boolean)
    expect(fields.sort()).toEqual(['administrator', 'ipi', 'legal_name', 'pro', 'publisher'])
    expect(fields).not.toContain('split_percentage')
    expect(fields).not.toContain('role')
  })

  it('never issues an UPDATE against split_sheet_parties — the write targets only split_sheet_identity_flags', () => {
    expect(routeSource).not.toMatch(/from\('split_sheet_parties'\)[\s\S]{0,80}\.update\(/)
    expect(routeSource).toContain("from('split_sheet_identity_flags')")
    expect(routeSource).toContain('.insert({')
  })

  it('derives flagged_by from the authenticated session, never from the request body', () => {
    expect(routeSource).toContain('flagged_by: user.id')
    expect(routeSource).not.toMatch(/flagged_by:\s*body\./)
  })

  it('wraps the notification call best-effort so it can never block the already-committed flag write', () => {
    expect(routeSource).toMatch(/try\s*{[\s\S]*createNotification\(/)
  })
})
