// Audit #2 — the paid AI routes must require sign-in. Proves an unauthenticated
// request is rejected 401 BEFORE the model is called (no cost incurred), and a
// signed-in request proceeds.

const mockGetUser = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createApiClient: async () => ({ auth: { getUser: (...a: unknown[]) => mockGetUser(...a) } }),
}))

const mockDraft = jest.fn()
const mockRerank = jest.fn()
jest.mock('@/lib/buyer/brief-ai', () => ({
  draftBriefFromProse: (...a: unknown[]) => mockDraft(...a),
  rerankCandidates: (...a: unknown[]) => mockRerank(...a),
  BRIEF_PROSE_MAX: 2000,
}))

jest.mock('@/lib/buyer/brief', () => ({
  coerceBrief: (b: unknown) => b ?? {},
  coerceCandidates: (c: unknown) => (Array.isArray(c) ? c : []),
}))

import { POST as draftPOST } from '@/app/api/buyer/brief-draft/route'
import { POST as rerankPOST } from '@/app/api/buyer/brief-rerank/route'

function req(body: unknown) {
  return { json: async () => body } as unknown as Request
}

const asAnon = () => mockGetUser.mockResolvedValue({ data: { user: null } })
const asUser = () => mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

beforeEach(() => {
  jest.clearAllMocks()
})

describe('brief-draft — auth gate (#2)', () => {
  it('rejects an unauthenticated request with 401 and never calls the model', async () => {
    asAnon()
    const res = await draftPOST(req({ prose: 'a warm indie folk track for a car ad' }))
    expect(res.status).toBe(401)
    expect(mockDraft).not.toHaveBeenCalled()
  })

  it('proceeds for a signed-in user', async () => {
    asUser()
    mockDraft.mockResolvedValue({ ok: true, brief: { mood: 'warm' } })
    const res = await draftPOST(req({ prose: 'a warm indie folk track for a car ad' }))
    expect(res.status).toBe(200)
    expect(mockDraft).toHaveBeenCalledTimes(1)
  })
})

describe('brief-rerank — auth gate (#2)', () => {
  it('rejects an unauthenticated request with 401 and never calls the model', async () => {
    asAnon()
    const res = await rerankPOST(req({ brief: {}, candidates: [{ id: 't1' }] }))
    expect(res.status).toBe(401)
    expect(mockRerank).not.toHaveBeenCalled()
  })

  it('proceeds for a signed-in user', async () => {
    asUser()
    mockRerank.mockResolvedValue({ ok: true, ranked: [{ id: 't1' }] })
    const res = await rerankPOST(req({ brief: {}, candidates: [{ id: 't1' }] }))
    expect(res.status).toBe(200)
    expect(mockRerank).toHaveBeenCalledTimes(1)
  })
})
