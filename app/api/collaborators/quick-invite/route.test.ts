import { createApiClient } from '@/lib/supabase/server'
import { sendCollaboratorInvite } from '@/lib/collaborators/invite'
import { POST } from './route'

// ─── POST /api/collaborators/quick-invite ──────────────────────────────────
// Route-level coverage: auth, strict parsing, email normalization,
// reuse-vs-insert, and response shaping. sendCollaboratorInvite (the shared
// send mechanics tested in lib/collaborators/invite.test.ts) is mocked so
// only this route's own logic is under test.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
}))

jest.mock('@/lib/collaborators/invite', () => ({
  sendCollaboratorInvite: jest.fn(),
}))

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const NEW_ROW_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const EXISTING_ROW_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

function postRequest(body: unknown) {
  return new Request('http://t.local/api/collaborators/quick-invite', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// A chainable query-builder mock covering the exact call shape the route
// uses: .select().eq().ilike().is().order().limit().maybeSingle() for the
// reuse lookup, and .insert().select().single() for the create path.
function mockSupabase(
  options: {
    existing?: Record<string, unknown> | null
    insertResult?: { data: Record<string, unknown> | null; error: { message: string } | null }
  } = {}
) {
  const { existing = null, insertResult = { data: null, error: null } } = options

  const singleSpy = jest.fn(async () => insertResult)
  const insertSelectSpy = jest.fn(() => ({ single: singleSpy }))
  const insertSpy = jest.fn(() => ({ select: insertSelectSpy }))

  const maybeSingleSpy = jest.fn(async () => ({ data: existing, error: null }))
  const limitSpy = jest.fn(() => ({ maybeSingle: maybeSingleSpy }))
  const orderSpy = jest.fn(() => ({ limit: limitSpy }))
  const isSpy = jest.fn(() => ({ order: orderSpy }))
  const ilikeSpy = jest.fn(() => ({ is: isSpy }))
  const eqSpy = jest.fn(() => ({ ilike: ilikeSpy }))
  const selectSpy = jest.fn(() => ({ eq: eqSpy }))

  const from = jest.fn((table: string) => {
    if (table === 'collaborators') {
      return { select: selectSpy, insert: insertSpy }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from, insertSpy, singleSpy, ilikeSpy, maybeSingleSpy }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(sendCollaboratorInvite as jest.Mock).mockResolvedValue({
    ok: true,
    outcome: 'invited',
    skipped: false,
    emailSent: true,
    inviteLink: 'https://funun.studio/signup?invite=tok123',
  })
})

describe('POST /api/collaborators/quick-invite', () => {
  it('returns 401 for an unauthenticated caller, with no insert and no email', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: null } })) },
      from: jest.fn(),
    })

    const res = await POST(postRequest({ first_name: 'Jamie', email: 'jamie@example.com' }))

    expect(res.status).toBe(401)
    expect(sendCollaboratorInvite).not.toHaveBeenCalled()
  })

  it('returns 400 for an unknown extra body key, with no insert', async () => {
    const supabase = mockSupabase()
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: USER_ID } } })) },
      ...supabase,
    })

    const res = await POST(
      postRequest({ first_name: 'Jamie', email: 'jamie@example.com', phone: '5551234567' })
    )

    expect(res.status).toBe(400)
    expect(supabase.insertSpy).not.toHaveBeenCalled()
    expect(sendCollaboratorInvite).not.toHaveBeenCalled()
  })

  it('returns 400 for a malformed email, with no insert', async () => {
    const supabase = mockSupabase()
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: USER_ID } } })) },
      ...supabase,
    })

    const res = await POST(postRequest({ first_name: 'Jamie', email: 'not-an-email' }))

    expect(res.status).toBe(400)
    expect(supabase.insertSpy).not.toHaveBeenCalled()
  })

  it('returns 400 for a blank first_name, with no insert', async () => {
    const supabase = mockSupabase()
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: USER_ID } } })) },
      ...supabase,
    })

    const res = await POST(postRequest({ first_name: '   ', email: 'jamie@example.com' }))

    expect(res.status).toBe(400)
    expect(supabase.insertSpy).not.toHaveBeenCalled()
  })

  it('inserts a new row and returns 200 with reused:false when no existing roster row matches', async () => {
    const insertedRow = {
      id: NEW_ROW_ID,
      user_id: USER_ID,
      name: 'Jamie',
      first_name: 'Jamie',
      email: 'jamie@example.com',
      status: 'pending',
    }
    const supabase = mockSupabase({ existing: null, insertResult: { data: insertedRow, error: null } })
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: USER_ID } } })) },
      ...supabase,
    })

    const res = await POST(postRequest({ first_name: 'Jamie', email: 'jamie@example.com' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.reused).toBe(false)
    expect(body.data.collaborator).toEqual(insertedRow)
    expect(body.data.inviteLink).toContain('/signup?invite=')
    expect(supabase.insertSpy).toHaveBeenCalledWith({
      user_id: USER_ID,
      name: 'Jamie',
      first_name: 'Jamie',
      email: 'jamie@example.com',
      status: 'pending',
    })
  })

  it('reuses an existing active roster row matching the email (any casing) without a second insert', async () => {
    const existingRow = {
      id: EXISTING_ROW_ID,
      user_id: USER_ID,
      name: 'Jamie',
      first_name: 'Jamie',
      email: 'jamie@example.com',
      status: 'pending',
      archived_at: null,
    }
    const supabase = mockSupabase({ existing: existingRow })
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: USER_ID } } })) },
      ...supabase,
    })

    const res = await POST(postRequest({ first_name: 'Jamie', email: 'JAMIE@EXAMPLE.COM' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.reused).toBe(true)
    expect(body.data.collaborator.id).toBe(EXISTING_ROW_ID)
    expect(supabase.insertSpy).not.toHaveBeenCalled()
  })

  it('normalizes email to lowercase and trimmed before the lookup', async () => {
    const supabase = mockSupabase({
      existing: null,
      insertResult: {
        data: { id: NEW_ROW_ID, user_id: USER_ID, name: 'Jamie', first_name: 'Jamie', email: 'jamie@example.com' },
        error: null,
      },
    })
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: USER_ID } } })) },
      ...supabase,
    })

    await POST(postRequest({ first_name: '  Jamie  ', email: '  JAMIE@Example.com  ' }))

    expect(supabase.ilikeSpy).toHaveBeenCalledWith('email', 'jamie@example.com')
    expect(supabase.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'jamie@example.com' })
    )
  })

  it('still returns 200 with data.emailSent === false and inviteLink present when sendEmail is unavailable', async () => {
    const insertedRow = {
      id: NEW_ROW_ID,
      user_id: USER_ID,
      name: 'Jamie',
      first_name: 'Jamie',
      email: 'jamie@example.com',
    }
    const supabase = mockSupabase({ existing: null, insertResult: { data: insertedRow, error: null } })
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: USER_ID } } })) },
      ...supabase,
    })
    ;(sendCollaboratorInvite as jest.Mock).mockResolvedValue({
      ok: true,
      outcome: 'invited',
      skipped: false,
      emailSent: false,
      inviteLink: 'https://funun.studio/signup?invite=tok456',
    })

    const res = await POST(postRequest({ first_name: 'Jamie', email: 'jamie@example.com' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.emailSent).toBe(false)
    expect(body.data.inviteLink).toBe('https://funun.studio/signup?invite=tok456')
  })

  it('returns a non-2xx with an error, but still carries data.collaborator, when sendCollaboratorInvite fails', async () => {
    const insertedRow = {
      id: NEW_ROW_ID,
      user_id: USER_ID,
      name: 'Jamie',
      first_name: 'Jamie',
      email: 'jamie@example.com',
    }
    const supabase = mockSupabase({ existing: null, insertResult: { data: insertedRow, error: null } })
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: USER_ID } } })) },
      ...supabase,
    })
    ;(sendCollaboratorInvite as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      error: 'insert boom',
    })

    const res = await POST(postRequest({ first_name: 'Jamie', email: 'jamie@example.com' }))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('insert boom')
    expect(body.data.collaborator).toEqual(insertedRow)
  })

  // 260825-m2k — outcome-aware envelope: inviteLink/skipped only for
  // invited; emailSent for both invited and connect-requested; the
  // collaborator row and reused flag stay on every branch so the roster
  // still folds the row in.
  it('returns outcome:invited with inviteLink for a signup-token send', async () => {
    const insertedRow = {
      id: NEW_ROW_ID,
      user_id: USER_ID,
      name: 'Jamie',
      first_name: 'Jamie',
      email: 'jamie@example.com',
    }
    const supabase = mockSupabase({ existing: null, insertResult: { data: insertedRow, error: null } })
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: USER_ID } } })) },
      ...supabase,
    })

    const res = await POST(postRequest({ first_name: 'Jamie', email: 'jamie@example.com' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.outcome).toBe('invited')
    expect(body.data.inviteLink).toContain('/signup?invite=')
    expect(body.data.emailSent).toBe(true)
  })

  it('returns outcome:connect-requested with emailSent but no inviteLink when the email already has an account', async () => {
    const insertedRow = {
      id: NEW_ROW_ID,
      user_id: USER_ID,
      name: 'Jamie',
      first_name: 'Jamie',
      email: 'jamie@example.com',
    }
    const supabase = mockSupabase({ existing: null, insertResult: { data: insertedRow, error: null } })
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: USER_ID } } })) },
      ...supabase,
    })
    ;(sendCollaboratorInvite as jest.Mock).mockResolvedValue({
      ok: true,
      outcome: 'connect-requested',
      emailSent: true,
    })

    const res = await POST(postRequest({ first_name: 'Jamie', email: 'jamie@example.com' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.outcome).toBe('connect-requested')
    expect(body.data.emailSent).toBe(true)
    expect('inviteLink' in body.data).toBe(false)
    expect(body.data.collaborator).toEqual(insertedRow)
    expect(body.data.reused).toBe(false)
  })

  it('returns outcome:already-linked with no inviteLink and no emailSent for an already-claimed row', async () => {
    const insertedRow = {
      id: NEW_ROW_ID,
      user_id: USER_ID,
      name: 'Jamie',
      first_name: 'Jamie',
      email: 'jamie@example.com',
    }
    const supabase = mockSupabase({ existing: null, insertResult: { data: insertedRow, error: null } })
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: USER_ID } } })) },
      ...supabase,
    })
    ;(sendCollaboratorInvite as jest.Mock).mockResolvedValue({ ok: true, outcome: 'already-linked' })

    const res = await POST(postRequest({ first_name: 'Jamie', email: 'jamie@example.com' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.outcome).toBe('already-linked')
    expect('inviteLink' in body.data).toBe(false)
    expect('emailSent' in body.data).toBe(false)
  })
})
