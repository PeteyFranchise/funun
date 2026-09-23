import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
import { BLOCKED_ACTION_ERROR } from '@/lib/trust-safety/block-check'
import { POST } from './route'

// ─── POST /api/collaborators/[id]/invite (M6 fix 27-CODEX-REVIEW.md) ──────
// M6: collaborator.name is artist-entered free text and was previously
// interpolated into this email's HTML body unescaped — an HTML/markup
// injection vector. This test's primary job is proving every value now
// routes through lib/email/esc.ts before landing in the HTML body; the
// remaining tests cover the route's pre-existing wiring (auth, ownership,
// cooldown, missing email, insert failure, best-effort send outcome).

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
}))

jest.mock('@/lib/accounts/member-api-gate', () => ({
  requireMemberApiAccount: jest.fn(),
}))

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const COLLAB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const MEMBER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

/**
 * The service client behind the block gate: `find_auth_user_id_by_email`
 * resolves the collaborator's email to an account, then `blocks` is read in
 * both directions. The real mustBlockActionForEmail / mustBlockActionBetween
 * run against this — nothing about the gate is simulated.
 */
function serviceClient(
  options: {
    accountId?: string | null
    rpcError?: { message: string } | null
    blocks?: { blocker_id: string; blocked_id: string }[]
    blocksError?: { message: string } | null
  } = {}
) {
  const { accountId = null, rpcError = null, blocks = [], blocksError = null } = options
  return {
    rpc: jest.fn(async () => ({ data: accountId, error: rpcError })),
    from: jest.fn((table: string) => {
      if (table !== 'blocks') throw new Error(`service client must only read blocks, got ${table}`)
      return {
        select: () => ({ or: async () => ({ data: blocksError ? null : blocks, error: blocksError }) }),
      }
    }),
  }
}

function postRequest() {
  return new Request(`http://t.local/api/collaborators/${COLLAB_ID}/invite`, { method: 'POST' })
}

function mockSupabase(
  options: {
    collaborator?: {
      id: string
      user_id: string
      name: string
      email: string | null
      claimed_by?: string | null
    } | null
    collabError?: { message: string } | null
    recentInvite?: { id: string; invite_token?: string } | null
    insertError?: { message: string } | null
  } = {}
) {
  const {
    collaborator = { id: COLLAB_ID, user_id: USER_ID, name: 'Jamie Rivera', email: 'jamie@example.com' },
    collabError = null,
    recentInvite = null,
    insertError = null,
  } = options

  const insertSpy = jest.fn(async () => ({ error: insertError }))

  const from = jest.fn((table: string) => {
    if (table === 'collaborators') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({ data: collaborator, error: collabError })),
            })),
          })),
        })),
      }
    }
    if (table === 'collaborator_invites') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              gte: jest.fn(() => ({
                maybeSingle: jest.fn(async () => ({ data: recentInvite, error: null })),
              })),
            })),
          })),
        })),
        insert: insertSpy,
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: USER_ID } } })) },
    from,
    insertSpy,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(requireMemberApiAccount as jest.Mock).mockImplementation(async (_client: unknown, user: { id: string } | null) =>
    user
      ? { ok: true, user }
      : { ok: false, status: 401, error: 'Unauthorized' }
  )
  process.env.NEXT_PUBLIC_APP_URL = 'https://funun.studio'
  ;(sendEmail as jest.Mock).mockResolvedValue({ ok: true })
  // Default: the collaborator's email resolves to no account, so the gate
  // falls through without reading `blocks` — every pre-existing case below is
  // an unblocked pair.
  ;(createServiceClient as jest.Mock).mockReturnValue(serviceClient())
})

describe('POST /api/collaborators/[id]/invite', () => {
  it('escapes a collaborator name containing HTML/markup before it reaches the email body (M6)', async () => {
    const maliciousName = '<img src=x onerror=alert(1)> "Jamie" & <b>Rivera</b>'
    const supabase = mockSupabase({
      collaborator: { id: COLLAB_ID, user_id: USER_ID, name: maliciousName, email: 'jamie@example.com' },
    })
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)

    const res = await POST(postRequest(), { params: Promise.resolve({ id: COLLAB_ID }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    const sendArgs = (sendEmail as jest.Mock).mock.calls[0][0]
    expect(sendArgs.html).not.toContain('<img src=x onerror=alert(1)>')
    expect(sendArgs.html).not.toContain('<b>Rivera</b>')
    expect(sendArgs.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(sendArgs.html).toContain('&quot;Jamie&quot;')
    expect(sendArgs.html).toContain('&amp;')
    expect(sendArgs.html).toContain('&lt;b&gt;Rivera&lt;/b&gt;')
  })

  it('sends the plain, unescaped name in the text body (no HTML injection risk in plain text)', async () => {
    const supabase = mockSupabase({
      collaborator: { id: COLLAB_ID, user_id: USER_ID, name: 'Jamie & Rivera', email: 'jamie@example.com' },
    })
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)

    await POST(postRequest(), { params: Promise.resolve({ id: COLLAB_ID }) })

    const sendArgs = (sendEmail as jest.Mock).mock.calls[0][0]
    expect(sendArgs.text).toContain('Hi Jamie & Rivera,')
  })

  it('creates the invite record and sends, returning emailSent:true on success', async () => {
    const supabase = mockSupabase()
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)

    const res = await POST(postRequest(), { params: Promise.resolve({ id: COLLAB_ID }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(expect.objectContaining({ ok: true, emailSent: true }))
    expect(body.inviteLink).toContain('/signup?invite=')
    expect(supabase.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        collaborator_id: COLLAB_ID,
        inviting_user_id: USER_ID,
        invited_email: 'jamie@example.com',
        status: 'pending',
      })
    )
  })

  it('returns emailSent:false (best-effort) when sendEmail fails', async () => {
    const supabase = mockSupabase()
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)
    ;(sendEmail as jest.Mock).mockResolvedValue({ ok: false, error: 'not configured' })

    const res = await POST(postRequest(), { params: Promise.resolve({ id: COLLAB_ID }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(expect.objectContaining({ ok: true, emailSent: false }))
    expect(body.inviteLink).toContain('/signup?invite=')
  })

  it('returns 404 when the collaborator is not found or not owned by the caller', async () => {
    const supabase = mockSupabase({ collaborator: null })
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)

    const res = await POST(postRequest(), { params: Promise.resolve({ id: COLLAB_ID }) })

    expect(res.status).toBe(404)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('does not create or send a signup invite for a claimed Funūn member', async () => {
    const supabase = mockSupabase({
      collaborator: {
        id: COLLAB_ID,
        user_id: USER_ID,
        name: 'Jamie Rivera',
        email: 'jamie@example.com',
        claimed_by: MEMBER_ID,
      },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(
      serviceClient({ accountId: MEMBER_ID, blocks: [] })
    )
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)

    const res = await POST(postRequest(), { params: Promise.resolve({ id: COLLAB_ID }) })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      alreadyMember: true,
      emailSent: false,
      skipped: true,
    })
    expect(supabase.insertSpy).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('returns 400 when the collaborator has no email on file', async () => {
    const supabase = mockSupabase({
      collaborator: { id: COLLAB_ID, user_id: USER_ID, name: 'No Email', email: null },
    })
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)

    const res = await POST(postRequest(), { params: Promise.resolve({ id: COLLAB_ID }) })

    expect(res.status).toBe(400)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('skips sending within the 60s cooldown and never inserts a second row, returning the EXISTING token', async () => {
    const supabase = mockSupabase({ recentInvite: { id: 'recent-1', invite_token: 'existing-token-xyz' } })
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)

    const res = await POST(postRequest(), { params: Promise.resolve({ id: COLLAB_ID }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(
      expect.objectContaining({ ok: true, skipped: true, emailSent: false })
    )
    expect(body.inviteLink).toBe('https://funun.studio/signup?invite=existing-token-xyz')
    expect(supabase.insertSpy).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('returns 500 when the invite insert fails', async () => {
    const supabase = mockSupabase({ insertError: { message: 'insert boom' } })
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)

    const res = await POST(postRequest(), { params: Promise.resolve({ id: COLLAB_ID }) })

    expect(res.status).toBe(500)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('returns 401 for an unauthenticated caller', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: null } })) },
      from: jest.fn(),
    })

    const res = await POST(postRequest(), { params: Promise.resolve({ id: COLLAB_ID }) })

    expect(res.status).toBe(401)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Block gate (quick task 260923-block-aware-roster-reads).
//
// `alreadyMember: true` is a membership disclosure, and on THIS route it is a
// read, not a write: `claim_collaborators()` stamped `claimed_by` at the
// member's signup, when no block could yet exist, and a block placed
// afterwards was never applied to the stamped row. PR #96 gated every write
// path; there was no write left here to gate.
//
// The gate covers the unclaimed branch too, deliberately. Gating only the
// claimed one would leave claimed-and-blocked (a generic 400) distinguishable
// from unclaimed-and-blocked (a 200 and a sent email), which is the very
// inference this closes.
// ─────────────────────────────────────────────────────────────────────────

describe('POST /api/collaborators/[id]/invite — block gate', () => {
  function claimedCollaborator() {
    return {
      id: COLLAB_ID,
      user_id: USER_ID,
      name: 'Jamie Rivera',
      email: 'jamie@example.com',
      claimed_by: MEMBER_ID,
    }
  }

  it('returns the generic refusal — never alreadyMember — when the CALLER blocked the member', async () => {
    const supabase = mockSupabase({ collaborator: claimedCollaborator() })
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)
    ;(createServiceClient as jest.Mock).mockReturnValue(
      serviceClient({ accountId: MEMBER_ID, blocks: [{ blocker_id: USER_ID, blocked_id: MEMBER_ID }] })
    )

    const res = await POST(postRequest(), { params: Promise.resolve({ id: COLLAB_ID }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    // Byte-identical to the refusal POST /api/collaborators, quick-invite,
    // follows, connections, endorsements and wall posts already return, so a
    // block looks exactly like any other generic failure of the same action.
    expect(body).toEqual({ error: BLOCKED_ACTION_ERROR })
    expect(body).not.toHaveProperty('alreadyMember')
    expect(JSON.stringify(body)).not.toContain(MEMBER_ID)
    expect(JSON.stringify(body)).not.toContain('jamie@example.com')
    expect(supabase.insertSpy).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('returns the same refusal when the MEMBER blocked the caller — the direction they cannot see', async () => {
    const supabase = mockSupabase({ collaborator: claimedCollaborator() })
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)
    ;(createServiceClient as jest.Mock).mockReturnValue(
      serviceClient({ accountId: MEMBER_ID, blocks: [{ blocker_id: MEMBER_ID, blocked_id: USER_ID }] })
    )

    const res = await POST(postRequest(), { params: Promise.resolve({ id: COLLAB_ID }) })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: BLOCKED_ACTION_ERROR })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('refuses an UNCLAIMED row whose email belongs to a blocked account, identically', async () => {
    // Same status, same body. If this branch had been left open, the 200 here
    // versus the 400 above would itself have confirmed membership.
    const supabase = mockSupabase({
      collaborator: { id: COLLAB_ID, user_id: USER_ID, name: 'Jamie Rivera', email: 'jamie@example.com' },
    })
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)
    ;(createServiceClient as jest.Mock).mockReturnValue(
      serviceClient({ accountId: MEMBER_ID, blocks: [{ blocker_id: MEMBER_ID, blocked_id: USER_ID }] })
    )

    const res = await POST(postRequest(), { params: Promise.resolve({ id: COLLAB_ID }) })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: BLOCKED_ACTION_ERROR })
    expect(supabase.insertSpy).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('catches a row whose email was cleared after the claim, on claimed_by alone', async () => {
    const supabase = mockSupabase({
      collaborator: { id: COLLAB_ID, user_id: USER_ID, name: 'Jamie Rivera', email: null, claimed_by: MEMBER_ID },
    })
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)
    ;(createServiceClient as jest.Mock).mockReturnValue(
      serviceClient({ accountId: null, blocks: [{ blocker_id: MEMBER_ID, blocked_id: USER_ID }] })
    )

    const res = await POST(postRequest(), { params: Promise.resolve({ id: COLLAB_ID }) })

    // Without the claimed_by fallback this would be the 200 + alreadyMember
    // disclosure, because a blank email resolves no account at all.
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: BLOCKED_ACTION_ERROR })
  })

  it('fails CLOSED when the block lookup errors — an unknown state is not a safe state', async () => {
    const supabase = mockSupabase({ collaborator: claimedCollaborator() })
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)
    ;(createServiceClient as jest.Mock).mockReturnValue(
      serviceClient({ accountId: MEMBER_ID, blocksError: { message: 'blocks unavailable' } })
    )

    const res = await POST(postRequest(), { params: Promise.resolve({ id: COLLAB_ID }) })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: BLOCKED_ACTION_ERROR })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('still returns alreadyMember for an UNBLOCKED member, hidden or not (D-01a, unchanged)', async () => {
    // Whether a hidden member\'s membership may be confirmed to the roster
    // owner is Phase 41\'s D-01a, an open owner decision. Nothing here settles
    // it: only a block changes this response.
    const supabase = mockSupabase({ collaborator: claimedCollaborator() })
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)
    ;(createServiceClient as jest.Mock).mockReturnValue(
      serviceClient({ accountId: MEMBER_ID, blocks: [] })
    )

    const res = await POST(postRequest(), { params: Promise.resolve({ id: COLLAB_ID }) })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      alreadyMember: true,
      emailSent: false,
      skipped: true,
    })
  })

  it('still invites an UNBLOCKED non-member exactly as before', async () => {
    const supabase = mockSupabase()
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)
    ;(createServiceClient as jest.Mock).mockReturnValue(serviceClient({ accountId: null }))

    const res = await POST(postRequest(), { params: Promise.resolve({ id: COLLAB_ID }) })

    expect(res.status).toBe(200)
    expect((await res.json()).emailSent).toBe(true)
    expect(supabase.insertSpy).toHaveBeenCalled()
  })

  it('is unaffected by a self-invite — the caller may still invite their own address', async () => {
    const supabase = mockSupabase()
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)
    ;(createServiceClient as jest.Mock).mockReturnValue(serviceClient({ accountId: USER_ID }))

    const res = await POST(postRequest(), { params: Promise.resolve({ id: COLLAB_ID }) })

    expect(res.status).toBe(200)
    expect(sendEmail).toHaveBeenCalled()
  })
})
