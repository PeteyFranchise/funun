import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { appendRelationshipLog } from '@/lib/client-partners/contacts'
import { buildDefaultGamePlanTopics } from '@/lib/client-partners/game-plan'
import { GET, PUT, POST } from './route'

// ─── GET/PUT/POST /api/admin/client-partners/[orgId]/game-plan ─────────────
// (31.1 plan 07, Task 1, R14/D-31.1-06). Mirrors
// app/api/admin/buyer-orgs/[id]/ae/route.test.ts's admin-route mocking
// conventions. Covers: seeded default when no row exists, own-book 404 on
// every verb, PUT upsert, and POST's "X of N covered" log + plan retirement.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => {
  const actual = jest.requireActual('@/lib/admin/gate')
  return {
    ...actual,
    requireStaff: jest.fn(),
  }
})

jest.mock('@/lib/client-partners/contacts', () => {
  const actual = jest.requireActual('@/lib/client-partners/contacts')
  return {
    ...actual,
    appendRelationshipLog: jest.fn(),
  }
})

const LEADERSHIP_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OUT_OF_BOOK_AE_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const IN_BOOK_AE_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const ORG_UUID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

function jsonRequest(method: string, body?: unknown) {
  return new Request(`http://t.local/api/admin/client-partners/${ORG_UUID}/game-plan`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function paramsFor(orgId = ORG_UUID) {
  return { params: Promise.resolve({ orgId }) }
}

type FakeRow = Record<string, unknown>

function mockService(options: { gamePlanRow?: FakeRow | null; orgRow?: FakeRow | null } = {}) {
  const { gamePlanRow = null, orgRow = { id: ORG_UUID, ae_user_id: IN_BOOK_AE_UUID } } = options

  const upsertSpy = jest.fn((payload: FakeRow) => ({
    select: () => ({
      single: async () => ({
        data: { id: 'gp-1', buyer_org_id: ORG_UUID, updated_by: null, created_at: 't', updated_at: 't', ...payload },
        error: null,
      }),
    }),
  }))
  const deleteEqSpy = jest.fn(async () => ({ data: null, error: null }))

  const from = jest.fn((table: string) => {
    if (table === 'buyer_orgs') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: orgRow, error: null }),
          }),
        }),
      }
    }
    if (table === 'game_plans') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: gamePlanRow, error: null }),
          }),
        }),
        upsert: upsertSpy,
        delete: () => ({ eq: deleteEqSpy }),
      }
    }
    if (table === 'playbook_entries') {
      // 31.2-08: GET also loads published authored Topics for pickerTopics
      // (loadAuthoredGamePlanTopics — select → eq → eq → order). Empty by
      // default: these tests assert the 31.1 game-plan behavior, and the
      // seeded/authored merge itself is covered in game-plan.test.ts.
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from, upsertSpy, deleteEqSpy }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET game-plan', () => {
  it('returns the seeded defaults when no row exists yet', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: IN_BOOK_AE_UUID }, staffRole: 'ae' })
    const service = mockService({ gamePlanRow: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET(jsonRequest('GET'), paramsFor())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.seeded).toBe(true)
    expect(json.data.topics).toEqual(buildDefaultGamePlanTopics())
  })

  it('returns the saved topics when a row exists', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: IN_BOOK_AE_UUID }, staffRole: 'ae' })
    const savedTopics = [{ id: 't1', title: 'Custom', source: null, questions: [], done: true, note: 'x' }]
    const service = mockService({ gamePlanRow: { topics: savedTopics } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET(jsonRequest('GET'), paramsFor())
    const json = await res.json()
    expect(json.data.seeded).toBe(false)
    expect(json.data.topics).toEqual(savedTopics)
  })

  it('returns 404 for an out-of-book AE, never 403', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: OUT_OF_BOOK_AE_UUID }, staffRole: 'ae' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET(jsonRequest('GET'), paramsFor())
    expect(res.status).toBe(404)
  })
})

describe('PUT game-plan', () => {
  const validTopics = [
    { id: 't1', title: 'Confirm the brief', questions: ['Q1?'], done: false },
  ]

  it('upserts the topics for an in-book caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: IN_BOOK_AE_UUID }, staffRole: 'ae' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PUT(jsonRequest('PUT', { topics: validTopics }), paramsFor())
    expect(res.status).toBe(200)
    expect(service.upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        buyer_org_id: ORG_UUID,
        updated_by: IN_BOOK_AE_UUID,
        topics: [{ id: 't1', title: 'Confirm the brief', source: null, questions: ['Q1?'], done: false, note: '' }],
      }),
      { onConflict: 'buyer_org_id' }
    )
  })

  it('returns 400 for an invalid topic shape and never upserts', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: IN_BOOK_AE_UUID }, staffRole: 'ae' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PUT(jsonRequest('PUT', { topics: [{ id: 't1' }] }), paramsFor())
    expect(res.status).toBe(400)
    expect(service.upsertSpy).not.toHaveBeenCalled()
  })

  it('returns 404 for an out-of-book AE and never upserts', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: OUT_OF_BOOK_AE_UUID }, staffRole: 'ae' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PUT(jsonRequest('PUT', { topics: validTopics }), paramsFor())
    expect(res.status).toBe(404)
    expect(service.upsertSpy).not.toHaveBeenCalled()
  })
})

describe('POST game-plan (log-conversation)', () => {
  beforeEach(() => {
    ;(appendRelationshipLog as jest.Mock).mockResolvedValue({ id: 'log-1', kind: 'conversation' })
  })

  it('appends a kind=conversation entry recording "3 of 5 covered" + notes, then retires the plan', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: IN_BOOK_AE_UUID }, staffRole: 'ae' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const topics = [
      { id: 't1', title: 'A', questions: [], done: true, note: 'went well' },
      { id: 't2', title: 'B', questions: [], done: true },
      { id: 't3', title: 'C', questions: [], done: true },
      { id: 't4', title: 'D', questions: [], done: false },
      { id: 't5', title: 'E', questions: [], done: false },
    ]

    const res = await POST(jsonRequest('POST', { topics }), paramsFor())
    expect(res.status).toBe(201)

    expect(appendRelationshipLog).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        orgId: ORG_UUID,
        kind: 'conversation',
        authorUserId: IN_BOOK_AE_UUID,
        body: expect.stringContaining('3 of 5 covered'),
      })
    )
    const [, args] = (appendRelationshipLog as jest.Mock).mock.calls[0]
    expect(args.body).toContain('A — went well')

    expect(service.deleteEqSpy).toHaveBeenCalled()
  })

  it('logging 0 of N covered records "0 of N covered" — never a silent blank', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: IN_BOOK_AE_UUID }, staffRole: 'ae' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const topics = [
      { id: 't1', title: 'A', questions: [], done: false },
      { id: 't2', title: 'B', questions: [], done: false },
    ]

    const res = await POST(jsonRequest('POST', { topics }), paramsFor())
    expect(res.status).toBe(201)
    expect(appendRelationshipLog).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ body: '0 of 2 covered' })
    )
  })

  it('returns 404 for an out-of-book AE and never logs', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: OUT_OF_BOOK_AE_UUID }, staffRole: 'ae' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest('POST', { topics: [] }), paramsFor())
    expect(res.status).toBe(404)
    expect(appendRelationshipLog).not.toHaveBeenCalled()
  })

  it('leadership bypasses own-book scoping', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({ orgRow: { id: ORG_UUID, ae_user_id: IN_BOOK_AE_UUID } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET(jsonRequest('GET'), paramsFor())
    expect(res.status).toBe(200)
  })
})
