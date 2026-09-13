import { sendEmail } from '@/lib/email'
import {
  buildCollaboratorInviteUrl,
  buildCollaboratorJoinUrl,
  buildCollaboratorInviteEmail,
  sendCollaboratorInvite,
} from './invite'

// ─── lib/collaborators/invite.ts ───────────────────────────────────────────
// Pure-builder coverage (URL base handling mirrors lib/split-sheets/
// esign-invite.test.ts's set/restore pattern) + sendCollaboratorInvite's
// send-path outcomes, extracted out of
// app/api/collaborators/[id]/invite/route.test.ts (260825-i4i Task 1).

jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
}))

const ORIGINAL_ENV = { ...process.env }

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const COLLAB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...ORIGINAL_ENV }
  ;(sendEmail as jest.Mock).mockResolvedValue({ ok: true })
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

  it('carries an encoded same-app destination for a Writer\'s Room invitation', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://funun.studio'
    expect(buildCollaboratorInviteUrl('abc', '/vault/works/work-1')).toBe(
      'https://funun.studio/signup?invite=abc&next=%2Fvault%2Fworks%2Fwork-1'
    )
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
    const { html, text } = buildCollaboratorInviteEmail({
      name: maliciousName,
      token: 'tok123',
      inviterName: 'Peter Zora',
      inviterHandle: 'peterzora',
    })

    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<b>Rivera</b>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&quot;Jamie&quot;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&lt;b&gt;Rivera&lt;/b&gt;')

    expect(text).toContain(`Hi ${maliciousName},`)
  })

  it('presents one clear claim-profile action that preserves the invite token', () => {
    const { subject, html, text } = buildCollaboratorInviteEmail({
      name: 'Stephan',
      token: 'tok123',
      inviterName: 'Peter Zora',
      inviterHandle: 'peterzora',
    })

    expect(subject).toBe('Peter Zora added you as a collaborator on Funūn')
    expect(html).toContain('Peter Zora (@peterzora) added you as a collaborator')
    expect(text).toContain('Peter Zora (@peterzora) added you as a collaborator')
    expect(text).toContain(
      'Funūn is a shared workspace where you can write together, keep credits and metadata accurate, organize masters, and find new opportunities for your music.'
    )
    expect(html.match(/<a href=/g)).toHaveLength(1)
    expect(html).toContain('Claim my Funūn profile')
    expect(html).toContain('https://funun.studio/signup?invite=tok123')
    expect(html).not.toContain('/join/tok123')
    expect(text).toContain(
      'Claim my Funūn profile: https://funun.studio/signup?invite=tok123'
    )
    expect(text).not.toContain('/join/tok123')
  })

  it('preserves creative momentum for an invite sent from a Writer\'s Room', () => {
    const { subject, html, text } = buildCollaboratorInviteEmail({
      name: 'Stephan',
      token: 'tok123',
      nextPath: '/vault/works/work-1',
      inviterName: 'Peter Zora',
      inviterHandle: 'peterzora',
    })

    expect(subject).toBe("Peter Zora invited you into a Writer's Room on Funūn")
    expect(html).toContain("Peter Zora (@peterzora) invited you to write with them in a <strong>Writer's Room</strong>")
    expect(html).toContain('Claim my profile and open the song')
    expect(text).toContain('Claim my profile and open the song')
    expect(text).toContain('next=%2Fvault%2Fworks%2Fwork-1')
  })

  it('uses a role-neutral fallback when the inviter has no display identity', () => {
    const { subject, html, text } = buildCollaboratorInviteEmail({
      name: 'Stephan',
      token: 'tok123',
      inviterName: null,
      inviterHandle: null,
    })

    expect(subject).toBe('A Funūn member added you as a collaborator on Funūn')
    expect(html).toContain('A Funūn member added you as a collaborator')
    expect(text).not.toContain('An artist')
  })

  it('escapes inviter markup in HTML and strips line breaks from email identity text', () => {
    const { subject, html, text } = buildCollaboratorInviteEmail({
      name: 'Stephan',
      token: 'tok123',
      inviterName: '<b>Peter</b>\r\nInjected',
      inviterHandle: '@peter&friends',
    })

    expect(subject).toBe('<b>Peter</b> Injected added you as a collaborator on Funūn')
    expect(subject).not.toMatch(/[\r\n]/)
    expect(html).toContain('&lt;b&gt;Peter&lt;/b&gt; Injected (@peter&amp;friends)')
    expect(html).not.toContain('<b>Peter</b>')
    expect(text).toContain('<b>Peter</b> Injected (@peter&friends)')
  })
})

function mockSupabase(
  options: {
    recentInvite?: { id: string; invite_token: string } | null
    insertError?: { message: string } | null
    inviterProfile?: { artist_name: string | null; handle: string | null } | null
    inviterLookupThrows?: boolean
  } = {}
) {
  const {
    recentInvite = null,
    insertError = null,
    inviterProfile = { artist_name: 'Peter Zora', handle: 'peterzora' },
    inviterLookupThrows = false,
  } = options
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
    if (table === 'user_profiles') {
      if (inviterLookupThrows) throw new Error('profile lookup unavailable')
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: inviterProfile, error: null })),
          })),
        })),
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
    if (result.ok) {
      expect(result.emailSent).toBe(false)
      expect(result.skipped).toBe(false)
      expect(result.inviteLink).toContain('/signup?invite=')
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
    expect(result).toEqual({ ok: false, status: 500, error: 'Invitation could not be created.' })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('on a clean success path returns emailSent:true and a usable inviteLink', async () => {
    const supabase = mockSupabase()
    const result = await sendCollaboratorInvite(supabase as never, {
      collaborator: { id: COLLAB_ID, name: 'Jamie Rivera', email: 'jamie@example.com' },
      invitingUserId: USER_ID,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.emailSent).toBe(true)
      expect(result.skipped).toBe(false)
      expect(result.inviteLink).toContain('/signup?invite=')
    }
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Peter Zora added you as a collaborator on Funūn',
        text: expect.stringContaining('Peter Zora (@peterzora) added you as a collaborator'),
      })
    )
  })

  it('keeps delivery working with the role-neutral fallback when inviter lookup throws', async () => {
    const supabase = mockSupabase({ inviterLookupThrows: true })
    const result = await sendCollaboratorInvite(supabase as never, {
      collaborator: { id: COLLAB_ID, name: 'Jamie Rivera', email: 'jamie@example.com' },
      invitingUserId: USER_ID,
    })

    expect(result.ok).toBe(true)
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'A Funūn member added you as a collaborator on Funūn',
      })
    )
  })

  it('carries a Writer\'s Room destination through the invite link and email', async () => {
    const supabase = mockSupabase()
    const result = await sendCollaboratorInvite(supabase as never, {
      collaborator: { id: COLLAB_ID, name: 'Jamie Rivera', email: 'jamie@example.com' },
      invitingUserId: USER_ID,
      nextPath: '/vault/works/work-1',
    })

    expect(result.ok && result.inviteLink).toContain('next=%2Fvault%2Fworks%2Fwork-1')
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("Writer's Room"),
        text: expect.stringContaining('Claim my profile and open the song'),
      })
    )
  })
})
