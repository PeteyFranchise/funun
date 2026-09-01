import { createApiClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
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
}))

jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
}))

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const COLLAB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

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
  process.env.NEXT_PUBLIC_APP_URL = 'https://funun.studio'
  ;(sendEmail as jest.Mock).mockResolvedValue({ ok: true })
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
        claimed_by: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      },
    })
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
