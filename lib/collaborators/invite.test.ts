import { sendEmail } from '@/lib/email'
import { resolveAccountIdByEmail } from '@/lib/invites/allowlist'
import { createConnectionRequest, BLOCKED_ACTION_ERROR, BLOCKED_ACTION_STATUS } from '@/lib/social/connect-request'
import { linkClaimedCollaborators } from '@/lib/collaborators/link-claim'
import {
  buildCollaboratorInviteUrl,
  buildCollaboratorJoinUrl,
  buildCollaboratorInviteEmail,
  buildCollaboratorConnectEmail,
  sendCollaboratorInvite,
} from './invite'

// ─── lib/collaborators/invite.ts ───────────────────────────────────────────
// Pure-builder coverage (URL base handling mirrors lib/split-sheets/
// esign-invite.test.ts's set/restore pattern) + sendCollaboratorInvite's
// send-path outcomes, extracted out of
// app/api/collaborators/[id]/invite/route.test.ts (260825-i4i Task 1).
//
// 260825-m2k Task 2: mocks @/lib/invites/allowlist, @/lib/social/
// connect-request, and @/lib/collaborators/link-claim so the membership
// branch's decision (invited vs. connect-requested vs. ...) is under this
// file's control per test, alongside the already-mocked @/lib/email.
// createServiceClient is mocked too — its return value is never inspected
// directly, only threaded through to the (also mocked) collaborators below.

jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
}))

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(() => ({})),
}))

jest.mock('@/lib/invites/allowlist', () => ({
  resolveAccountIdByEmail: jest.fn(),
}))

jest.mock('@/lib/social/connect-request', () => ({
  createConnectionRequest: jest.fn(),
  BLOCKED_ACTION_ERROR: 'This action could not be completed',
  BLOCKED_ACTION_STATUS: 400,
}))

jest.mock('@/lib/collaborators/link-claim', () => ({
  linkClaimedCollaborators: jest.fn(),
}))

const ORIGINAL_ENV = { ...process.env }

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const COLLAB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const MEMBER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...ORIGINAL_ENV }
  ;(sendEmail as jest.Mock).mockResolvedValue({ ok: true })
  // Default: no account on this email — every pre-existing test below falls
  // through to the untouched signup-invite path exactly as before.
  ;(resolveAccountIdByEmail as jest.Mock).mockResolvedValue({ ok: true, userId: null })
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('buildCollaboratorInviteUrl', () => {
  it('builds a signup link from NEXT_PUBLIC_APP_URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://funun.studio'
    expect(buildCollaboratorInviteUrl('abc')).toBe('https://funun.studio/signup?invite=abc')
  })

  it('strips a trailing slash off the base with no double slash', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://funun.studio/'
    expect(buildCollaboratorInviteUrl('abc')).toBe('https://funun.studio/signup?invite=abc')
  })

  it('falls back to a relative path when NEXT_PUBLIC_APP_URL is unset, never emitting "undefined"', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const url = buildCollaboratorInviteUrl('abc')
    expect(url).toBe('/signup?invite=abc')
    expect(url).not.toContain('undefined')
  })
})

describe('buildCollaboratorJoinUrl', () => {
  it('builds a join link from NEXT_PUBLIC_APP_URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://funun.studio'
    expect(buildCollaboratorJoinUrl('abc')).toBe('https://funun.studio/join/abc')
  })

  it('strips a trailing slash off the base with no double slash', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://funun.studio/'
    expect(buildCollaboratorJoinUrl('abc')).toBe('https://funun.studio/join/abc')
  })

  it('falls back to a relative path when NEXT_PUBLIC_APP_URL is unset, never emitting "undefined"', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const url = buildCollaboratorJoinUrl('abc')
    expect(url).toBe('/join/abc')
    expect(url).not.toContain('undefined')
  })
})

describe('buildCollaboratorInviteEmail', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://funun.studio'
  })

  it('escapes markup and an ampersand in the name for the html body, but leaves the text body raw', () => {
    const maliciousName = '<img src=x onerror=alert(1)> "Jamie" & <b>Rivera</b>'
    const { html, text } = buildCollaboratorInviteEmail({ name: maliciousName, token: 'tok123' })

    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<b>Rivera</b>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&quot;Jamie&quot;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&lt;b&gt;Rivera&lt;/b&gt;')

    expect(text).toContain(`Hi ${maliciousName},`)
  })
})

function mockSupabase(
  options: {
    recentInvite?: { id: string; invite_token: string } | null
    insertError?: { message: string } | null
  } = {}
) {
  const { recentInvite = null, insertError = null } = options
  const insertSpy = jest.fn(async () => ({ error: insertError }))

  const from = jest.fn((table: string) => {
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

  return { from, insertSpy }
}

describe('sendCollaboratorInvite', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://funun.studio'
  })

  it('rejects a collaborator with no email', async () => {
    const supabase = mockSupabase()
    const result = await sendCollaboratorInvite(supabase as never, {
      collaborator: { id: COLLAB_ID, name: 'No Email', email: null },
      invitingUserId: USER_ID,
    })
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'A collaborator email address is required to send an invite',
    })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('inside the 60s window returns the EXISTING token, no new insert, no email sent', async () => {
    const supabase = mockSupabase({
      recentInvite: { id: 'recent-1', invite_token: 'existing-token-xyz' },
    })
    const result = await sendCollaboratorInvite(supabase as never, {
      collaborator: { id: COLLAB_ID, name: 'Jamie Rivera', email: 'jamie@example.com' },
      invitingUserId: USER_ID,
    })
    expect(result).toEqual({
      ok: true,
      outcome: 'invited',
      skipped: true,
      emailSent: false,
      inviteLink: 'https://funun.studio/signup?invite=existing-token-xyz',
    })
    expect(supabase.insertSpy).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('on a clean path with sendEmail ok:false still returns ok:true with the inviteLink present', async () => {
    ;(sendEmail as jest.Mock).mockResolvedValue({ ok: false, error: 'not configured' })
    const supabase = mockSupabase()
    const result = await sendCollaboratorInvite(supabase as never, {
      collaborator: { id: COLLAB_ID, name: 'Jamie Rivera', email: 'jamie@example.com' },
      invitingUserId: USER_ID,
    })
    expect(result.ok).toBe(true)
    if (result.ok && result.outcome === 'invited') {
      expect(result.emailSent).toBe(false)
      expect(result.skipped).toBe(false)
      expect(result.inviteLink).toContain('/signup?invite=')
    } else {
      throw new Error('expected outcome invited')
    }
    expect(supabase.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        collaborator_id: COLLAB_ID,
        inviting_user_id: USER_ID,
        invited_email: 'jamie@example.com',
        status: 'pending',
      })
    )
  })

  it('returns ok:false status:500 when the invites insert errors', async () => {
    const supabase = mockSupabase({ insertError: { message: 'insert boom' } })
    const result = await sendCollaboratorInvite(supabase as never, {
      collaborator: { id: COLLAB_ID, name: 'Jamie Rivera', email: 'jamie@example.com' },
      invitingUserId: USER_ID,
    })
    expect(result).toEqual({ ok: false, status: 500, error: 'insert boom' })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('on a clean success path returns emailSent:true and a usable inviteLink', async () => {
    const supabase = mockSupabase()
    const result = await sendCollaboratorInvite(supabase as never, {
      collaborator: { id: COLLAB_ID, name: 'Jamie Rivera', email: 'jamie@example.com' },
      invitingUserId: USER_ID,
    })
    expect(result.ok).toBe(true)
    if (result.ok && result.outcome === 'invited') {
      expect(result.emailSent).toBe(true)
      expect(result.skipped).toBe(false)
      expect(result.inviteLink).toContain('/signup?invite=')
    } else {
      throw new Error('expected outcome invited')
    }
  })
})

describe('buildCollaboratorConnectEmail', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://funun.studio'
  })

  it('contains no signup link, no token, and no IPI onboarding material', () => {
    const { subject, html, text } = buildCollaboratorConnectEmail({
      inviterName: 'Jordan Ellis',
      collaboratorName: 'Jamie Rivera',
    })
    expect(subject).toContain('Jordan Ellis')
    expect(html).not.toContain('/signup?invite=')
    expect(html).not.toContain('IPI')
    expect(html).toContain('/network')
    expect(text).not.toContain('/signup?invite=')
    expect(text).not.toContain('IPI')
  })

  it('escapes markup in both interpolated names for the html body', () => {
    const malicious = '<img src=x onerror=alert(1)>'
    const { html } = buildCollaboratorConnectEmail({
      inviterName: malicious,
      collaboratorName: malicious,
    })
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

describe('sendCollaboratorInvite — membership branch (260825-m2k)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://funun.studio'
  })

  it('a collaborator row whose claimed_by is already set returns already-linked, with no lookup, no token, and no email', async () => {
    const supabase = mockSupabase()
    const result = await sendCollaboratorInvite(supabase as never, {
      collaborator: { id: COLLAB_ID, name: 'Jamie Rivera', email: 'jamie@example.com', claimed_by: MEMBER_ID },
      invitingUserId: USER_ID,
    })
    expect(result).toEqual({ ok: true, outcome: 'already-linked' })
    expect(resolveAccountIdByEmail).not.toHaveBeenCalled()
    expect(supabase.insertSpy).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('an email with a Funūn account produces connect-requested, inserts no collaborator_invites row, mints no token, and returns no inviteLink', async () => {
    ;(resolveAccountIdByEmail as jest.Mock).mockResolvedValue({ ok: true, userId: MEMBER_ID })
    ;(createConnectionRequest as jest.Mock).mockResolvedValue({
      kind: 'created',
      connectionId: 'conn-1',
      actorName: 'Jordan Ellis',
    })

    const supabase = mockSupabase()
    const result = await sendCollaboratorInvite(supabase as never, {
      collaborator: { id: COLLAB_ID, name: 'Jamie Rivera', email: 'jamie@example.com' },
      invitingUserId: USER_ID,
    })

    expect(result).toEqual({ ok: true, outcome: 'connect-requested', emailSent: true })
    expect('inviteLink' in result).toBe(false)
    expect(supabase.insertSpy).not.toHaveBeenCalled()
    expect(createConnectionRequest).toHaveBeenCalledWith(
      supabase,
      expect.anything(),
      expect.objectContaining({ requesterId: USER_ID, addresseeId: MEMBER_ID })
    )
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'jamie@example.com', subject: expect.stringContaining('Jordan Ellis') })
    )
  })

  it('an email that resolves to the inviter\'s own account id returns a not-ok result', async () => {
    ;(resolveAccountIdByEmail as jest.Mock).mockResolvedValue({ ok: true, userId: USER_ID })

    const supabase = mockSupabase()
    const result = await sendCollaboratorInvite(supabase as never, {
      collaborator: { id: COLLAB_ID, name: 'Jamie Rivera', email: 'jamie@example.com' },
      invitingUserId: USER_ID,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.error).toContain('own account')
    }
    expect(createConnectionRequest).not.toHaveBeenCalled()
  })

  it('a failed account lookup returns a not-ok result and never falls through to the signup-invite path', async () => {
    ;(resolveAccountIdByEmail as jest.Mock).mockResolvedValue({ ok: false, error: 'connection reset' })

    const supabase = mockSupabase()
    const result = await sendCollaboratorInvite(supabase as never, {
      collaborator: { id: COLLAB_ID, name: 'Jamie Rivera', email: 'jamie@example.com' },
      invitingUserId: USER_ID,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(503)
    expect(supabase.insertSpy).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('an existing pending request between the pair returns connect-pending with nothing sent', async () => {
    ;(resolveAccountIdByEmail as jest.Mock).mockResolvedValue({ ok: true, userId: MEMBER_ID })
    ;(createConnectionRequest as jest.Mock).mockResolvedValue({ kind: 'pending' })

    const supabase = mockSupabase()
    const result = await sendCollaboratorInvite(supabase as never, {
      collaborator: { id: COLLAB_ID, name: 'Jamie Rivera', email: 'jamie@example.com' },
      invitingUserId: USER_ID,
    })

    expect(result).toEqual({ ok: true, outcome: 'connect-pending' })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(linkClaimedCollaborators).not.toHaveBeenCalled()
  })

  it('an existing accepted connection attempts the scoped claim and returns already-linked when a row was linked', async () => {
    ;(resolveAccountIdByEmail as jest.Mock).mockResolvedValue({ ok: true, userId: MEMBER_ID })
    ;(createConnectionRequest as jest.Mock).mockResolvedValue({ kind: 'connected' })
    ;(linkClaimedCollaborators as jest.Mock).mockResolvedValue(1)

    const supabase = mockSupabase()
    const result = await sendCollaboratorInvite(supabase as never, {
      collaborator: { id: COLLAB_ID, name: 'Jamie Rivera', email: 'jamie@example.com' },
      invitingUserId: USER_ID,
    })

    expect(result).toEqual({ ok: true, outcome: 'already-linked' })
    expect(linkClaimedCollaborators).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ownerUserId: USER_ID, memberUserId: MEMBER_ID, memberEmail: 'jamie@example.com' })
    )
  })

  it('an existing accepted connection returns already-connected when the scoped claim links nothing', async () => {
    ;(resolveAccountIdByEmail as jest.Mock).mockResolvedValue({ ok: true, userId: MEMBER_ID })
    ;(createConnectionRequest as jest.Mock).mockResolvedValue({ kind: 'connected-conflict' })
    ;(linkClaimedCollaborators as jest.Mock).mockResolvedValue(0)

    const supabase = mockSupabase()
    const result = await sendCollaboratorInvite(supabase as never, {
      collaborator: { id: COLLAB_ID, name: 'Jamie Rivera', email: 'jamie@example.com' },
      invitingUserId: USER_ID,
    })

    expect(result).toEqual({ ok: true, outcome: 'already-connected' })
  })

  it('a blocked pair returns the generic BLOCKED_ACTION_ERROR and BLOCKED_ACTION_STATUS', async () => {
    ;(resolveAccountIdByEmail as jest.Mock).mockResolvedValue({ ok: true, userId: MEMBER_ID })
    ;(createConnectionRequest as jest.Mock).mockResolvedValue({ kind: 'blocked' })

    const supabase = mockSupabase()
    const result = await sendCollaboratorInvite(supabase as never, {
      collaborator: { id: COLLAB_ID, name: 'Jamie Rivera', email: 'jamie@example.com' },
      invitingUserId: USER_ID,
    })

    expect(result).toEqual({ ok: false, status: BLOCKED_ACTION_STATUS, error: BLOCKED_ACTION_ERROR })
  })

  it('the member-facing email failing lowers emailSent only — the connect-requested outcome still stands', async () => {
    ;(resolveAccountIdByEmail as jest.Mock).mockResolvedValue({ ok: true, userId: MEMBER_ID })
    ;(createConnectionRequest as jest.Mock).mockResolvedValue({
      kind: 'created',
      connectionId: 'conn-1',
      actorName: 'Jordan Ellis',
    })
    ;(sendEmail as jest.Mock).mockResolvedValue({ ok: false, error: 'not configured' })

    const supabase = mockSupabase()
    const result = await sendCollaboratorInvite(supabase as never, {
      collaborator: { id: COLLAB_ID, name: 'Jamie Rivera', email: 'jamie@example.com' },
      invitingUserId: USER_ID,
    })

    expect(result).toEqual({ ok: true, outcome: 'connect-requested', emailSent: false })
  })

  it('a createConnectionRequest error kind returns a not-ok 500', async () => {
    ;(resolveAccountIdByEmail as jest.Mock).mockResolvedValue({ ok: true, userId: MEMBER_ID })
    ;(createConnectionRequest as jest.Mock).mockResolvedValue({ kind: 'error', message: 'insert boom' })

    const supabase = mockSupabase()
    const result = await sendCollaboratorInvite(supabase as never, {
      collaborator: { id: COLLAB_ID, name: 'Jamie Rivera', email: 'jamie@example.com' },
      invitingUserId: USER_ID,
    })

    expect(result).toEqual({ ok: false, status: 500, error: 'insert boom' })
  })
})
