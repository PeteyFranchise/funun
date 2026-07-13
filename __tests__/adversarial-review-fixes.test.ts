import { POST as createDocument } from '@/app/api/vault/[projectId]/documents/route'
import { PATCH as patchDocument } from '@/app/api/vault/[projectId]/documents/[docId]/route'
import { POST as acceptPitch } from '@/app/api/pitch/accept/[token]/route'
import { POST as declinePitch } from '@/app/api/pitch/decline/[token]/route'
import { POST as unsubscribePitch } from '@/app/api/pitch/unsubscribe/[token]/route'
import { POST as sendPitch } from '@/app/api/pitches/route'
import { POST as approveSplit } from '@/app/api/approve/[token]/route'
import { POST as claimCurator } from '@/app/api/curators/claim/[token]/route'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { sendEmail } from '@/lib/email'

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
  createApiClient: jest.fn(),
}))

jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(),
}))

jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
}))

type EqCall = [string, unknown]
type IsCall = [string, unknown]
type GtCall = [string, unknown]
type TestBuilder = {
  select: jest.Mock
  update: jest.Mock
  eq: jest.Mock
  gt: jest.Mock
  is: jest.Mock
  maybeSingle: jest.Mock
}
type TestSelectInBuilder = {
  select: jest.Mock
  in: jest.Mock
}
type TestExistingPitchBuilder = {
  select: jest.Mock
  eq: jest.Mock
  in: jest.Mock
}

function jsonRequest(body: unknown) {
  return new Request('http://test.local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeBuilder(result: unknown = { data: null, error: null }) {
  const eqCalls: EqCall[] = []
  const isCalls: IsCall[] = []
  const gtCalls: GtCall[] = []
  const builder: TestBuilder = {
    select: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn((column: string, value: unknown) => {
      eqCalls.push([column, value])
      return builder
    }),
    gt: jest.fn((column: string, value: unknown) => {
      gtCalls.push([column, value])
      return builder
    }),
    is: jest.fn((column: string, value: unknown) => {
      isCalls.push([column, value])
      return builder
    }),
    maybeSingle: jest.fn(async () => result),
  }
  return { builder, eqCalls, gtCalls, isCalls }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(createNotification as jest.Mock).mockResolvedValue(undefined)
  ;(sendEmail as jest.Mock).mockResolvedValue({ ok: true })
})

describe('document signing state guard', () => {
  it('rejects creating a signed document through the generic document route', async () => {
    const res = await createDocument(jsonRequest({ type: 'split_sheet', status: 'signed' }), {
      params: Promise.resolve({ projectId: 'project-1' }),
    })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/uploaded PDF|verification flow/),
    })
  })

  it('rejects patching a document to signed through the generic document route', async () => {
    const res = await patchDocument(jsonRequest({ status: 'signed' }), {
      params: Promise.resolve({ projectId: 'project-1', docId: 'doc-1' }),
    })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/uploaded PDF|verification flow/),
    })
  })
})

describe('public token routes use atomic unused-state predicates', () => {
  it('writes an expiry timestamp when sending pitch response tokens', async () => {
    const now = Date.now()
    jest.spyOn(Date, 'now').mockReturnValue(now)
    const projectBuilder = makeBuilder({
      data: { id: 'project-1', title: 'Project', tracks: [{ id: 'track-1', title: 'Song' }] },
      error: null,
    })
    const curatorsBuilder: TestSelectInBuilder = {
      select: jest.fn(() => curatorsBuilder),
      in: jest.fn(async () => ({
        data: [{
          id: 'curator-1',
          name: 'Curator',
          email: 'curator@test.local',
          email_valid: true,
          do_not_pitch: false,
          claim_token: null,
        }],
        error: null,
      })),
    }
    const existingBuilder: TestExistingPitchBuilder = {
      select: jest.fn(() => existingBuilder),
      eq: jest.fn(() => existingBuilder),
      in: jest.fn(async () => ({ data: [], error: null })),
    }
    const insertBuilder = {
      insert: jest.fn((rows: unknown[]) => ({
        select: jest.fn(async () => ({
          data: [{ id: 'pitch-1', curator_id: 'curator-1', response_token: 'response-token' }],
          error: null,
        })),
        rows,
      })),
    }
    const api = {
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'artist-1', email: 'artist@test.local' } } })) },
      from: jest.fn(() => projectBuilder.builder),
    }
    const service = {
      from: jest
        .fn()
        .mockReturnValueOnce(curatorsBuilder)
        .mockReturnValueOnce(existingBuilder)
        .mockReturnValueOnce(insertBuilder),
    }
    ;(createApiClient as jest.Mock).mockReturnValue(api)
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await sendPitch(jsonRequest({
      projectId: 'project-1',
      trackId: 'track-1',
      curatorIds: ['curator-1'],
      note: 'This song fits your playlist.',
    }))

    expect(res.status).toBe(200)
    expect(insertBuilder.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        response_token_expires_at: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ])
  })

  it('accepts a pitch only when the response token row is still pending and unexpired', async () => {
    const pitch = {
      id: 'pitch-1',
      status: 'accepted',
      project_id: 'project-1',
      curator_id: 'curator-1',
      artist_id: 'artist-1',
      response_token_expires_at: '2099-01-01T00:00:00.000Z',
      vault_projects: { user_id: 'artist-1', title: 'Song' },
    }
    const update = makeBuilder({ data: pitch, error: null })
    const service = {
      from: jest.fn(() => update.builder),
      auth: { admin: { getUserById: jest.fn(async () => ({ data: { user: { email: 'artist@test.local' } } })) } },
    }
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await acceptPitch(new Request('http://test.local', { method: 'POST' }), {
      params: Promise.resolve({ token: 'response-token' }),
    })

    expect(res.status).toBe(200)
    expect(update.builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'accepted' })
    )
    expect(update.eqCalls).toEqual(
      expect.arrayContaining([
        ['response_token', 'response-token'],
        ['status', 'pending'],
      ])
    )
    expect(update.gtCalls).toEqual(
      expect.arrayContaining([['response_token_expires_at', expect.any(String)]])
    )
  })

  it('declines a pitch only when the response token row is still pending and unexpired', async () => {
    const pitch = {
      id: 'pitch-1',
      status: 'declined',
      project_id: 'project-1',
      curator_id: 'curator-1',
      artist_id: 'artist-1',
      response_token_expires_at: '2099-01-01T00:00:00.000Z',
      vault_projects: { user_id: 'artist-1', title: 'Song' },
    }
    const update = makeBuilder({ data: pitch, error: null })
    const service = {
      from: jest.fn(() => update.builder),
      auth: { admin: { getUserById: jest.fn(async () => ({ data: { user: { email: 'artist@test.local' } } })) } },
    }
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await declinePitch(jsonRequest({ reason: 'Not a fit' }), {
      params: Promise.resolve({ token: 'response-token' }),
    })

    expect(res.status).toBe(200)
    expect(update.builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'declined', decline_reason: 'Not a fit' })
    )
    expect(update.eqCalls).toEqual(
      expect.arrayContaining([
        ['response_token', 'response-token'],
        ['status', 'pending'],
      ])
    )
    expect(update.gtCalls).toEqual(
      expect.arrayContaining([['response_token_expires_at', expect.any(String)]])
    )
  })

  it('unsubscribes from future pitches only while the response token is unexpired', async () => {
    const pitchLookup = makeBuilder({ data: { id: 'pitch-1', curator_id: 'curator-1' }, error: null })
    const curatorUpdate = makeBuilder({ data: null, error: null })
    const service = {
      from: jest.fn().mockReturnValueOnce(pitchLookup.builder).mockReturnValueOnce(curatorUpdate.builder),
    }
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await unsubscribePitch(new Request('http://test.local', { method: 'POST' }), {
      params: Promise.resolve({ token: 'response-token' }),
    })

    expect(res.status).toBe(200)
    expect(pitchLookup.eqCalls).toEqual(
      expect.arrayContaining([['response_token', 'response-token']])
    )
    expect(pitchLookup.gtCalls).toEqual(
      expect.arrayContaining([['response_token_expires_at', expect.any(String)]])
    )
  })

  it('updates a split approval party only while approval_status is pending', async () => {
    const partyLookup = makeBuilder({
      data: {
        id: 'party-1',
        name: 'Writer',
        approval_status: 'pending',
        token_expires_at: null,
        split_sheets: {
          id: 'sheet-1',
          song_name: 'Song',
          status: 'pending_approval',
          initiator_user_id: 'artist-1',
        },
      },
      error: null,
    })
    const partyUpdate = makeBuilder({ data: { id: 'party-1' }, error: null })
    const allParties = makeBuilder({
      data: [{ id: 'party-1', approval_status: 'approved' }],
      error: null,
    })
    const sheetUpdate = makeBuilder({ data: null, error: null })
    const service = {
      from: jest
        .fn()
        .mockReturnValueOnce(partyLookup.builder)
        .mockReturnValueOnce(partyUpdate.builder)
        .mockReturnValueOnce(allParties.builder)
        .mockReturnValueOnce(sheetUpdate.builder),
      auth: { admin: { getUserById: jest.fn(async () => ({ data: { user: { email: 'artist@test.local' } } })) } },
    }
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await approveSplit(jsonRequest({ action: 'approve' }), {
      params: Promise.resolve({ token: 'approval-token' }),
    })

    expect(res.status).toBe(200)
    expect(partyUpdate.eqCalls).toEqual(
      expect.arrayContaining([
        ['id', 'party-1'],
        ['approval_status', 'pending'],
      ])
    )
  })

  it('claims a curator record only while the token is still on an unclaimed row', async () => {
    const curatorLookup = makeBuilder({
      data: {
        id: 'curator-1',
        email: 'curator@test.local',
        claim_token_expires_at: null,
        claimed_by: null,
      },
      error: null,
    })
    const curatorClaim = makeBuilder({ data: { id: 'curator-1' }, error: null })
    const service = {
      from: jest.fn().mockReturnValueOnce(curatorLookup.builder).mockReturnValueOnce(curatorClaim.builder),
      auth: {
        admin: {
          createUser: jest.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
          generateLink: jest.fn(async () => ({
            data: { properties: { action_link: 'https://test.local/magic' } },
          })),
        },
      },
    }
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await claimCurator(new Request('http://test.local', { method: 'POST' }), {
      params: Promise.resolve({ token: 'claim-token' }),
    })

    expect(res.status).toBe(200)
    expect(curatorClaim.eqCalls).toEqual(
      expect.arrayContaining([
        ['id', 'curator-1'],
        ['claim_token', 'claim-token'],
      ])
    )
    expect(curatorClaim.isCalls).toEqual(expect.arrayContaining([['claimed_by', null]]))
  })
})
